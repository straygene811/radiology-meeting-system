import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const CHUNK_KEY = (id, idx) => `draft_audio_${id}_c${idx}.json`;

async function cleanupDraftAudioChunks(item) {
  if (!item) return;
  const count = Number(item.audioChunkCount) || 0;
  if (count <= 0) return;
  const jobs = [];
  for (let i = 0; i < count; i++) {
    jobs.push(db.remove(CHUNK_KEY(item.id, i)));
  }
  await Promise.allSettled(jobs);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const audioId = searchParams.get('audioId');
    const chunkParam = searchParams.get('chunk');

    // 分段下載單一錄音片段（避開 Vercel 4.5MB 回應體上限）
    if (audioId && chunkParam !== null) {
      const chunkIndex = parseInt(chunkParam, 10);
      if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
        return NextResponse.json({ error: '無效的分段編號' }, { status: 400 });
      }
      const chunkObj = await db.read(CHUNK_KEY(audioId, chunkIndex));
      if (!chunkObj || !chunkObj.chunkData) {
        return NextResponse.json({ error: `找不到語音分段 #${chunkIndex}` }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        audioId,
        chunkIndex,
        chunkData: chunkObj.chunkData
      });
    }

    const rawItems = await db.read('draft_inbox.json');
    const items = Array.isArray(rawItems) ? rawItems : [];

    // 單筆查詢音檔資訊
    if (audioId) {
      const found = items.find((it) => it.id === audioId);
      if (!found) {
        return NextResponse.json({ error: '找不到指定草稿' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        audioId,
        hasAudio: Boolean(found.hasAudio || found.audioBase64 || found.audioChunkCount > 0),
        audioChunkCount: Number(found.audioChunkCount) || 0,
        audioMimeType: found.audioMimeType || 'audio/mp4',
        audioFileName: found.audioFileName || '會議錄音.m4a',
        audioBase64: found.audioBase64 || null
      });
    }

    return NextResponse.json({
      success: true,
      storageMode: db.getStorageMode(),
      count: items.length,
      items
    });
  } catch (error) {
    console.error('Draft Inbox GET Error:', error);
    return NextResponse.json({ error: '讀取雲端暫存草稿匣失敗' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action = 'save_draft' } = body;

    // 獨立高併發安全：上傳單一音檔分段時不需要反覆讀寫整份 draft_inbox.json
    if (action === 'upload_audio_chunk') {
      const { id, chunkIndex, totalChunks, chunkData } = body;
      if (!id || typeof chunkIndex !== 'number' || chunkIndex < 0 || !chunkData) {
        return NextResponse.json({ error: '語音分段資料不完整' }, { status: 400 });
      }
      await db.write(CHUNK_KEY(id, chunkIndex), {
        id,
        chunkIndex,
        totalChunks: Number(totalChunks) || 1,
        chunkData
      });
      return NextResponse.json({
        success: true,
        id,
        chunkIndex,
        totalChunks
      });
    }

    const rawItems = await db.read('draft_inbox.json');
    let items = Array.isArray(rawItems) ? [...rawItems] : [];

    // STEP 1（分段上傳模式）：初始化草稿主檔
    if (action === 'init_draft') {
      const {
        category = 'dept',
        meetingTitle = '',
        date = new Date().toISOString().slice(0, 10),
        createdBy = '科內紀錄人',
        transcript = '',
        handwrittenImages = [],
        hasAudio = false,
        audioChunkCount = 0,
        audioMimeType = 'audio/mp4',
        audioFileName = '',
        audioByteSize = 0
      } = body;

      const cleanTranscript = String(transcript || '').trim();
      const cleanImages = Array.isArray(handwrittenImages)
        ? handwrittenImages
            .filter((img) => img && (img.dataUrl || img.base64))
            .map((img, idx) => ({
              id: img.id || `IMG-${idx + 1}`,
              name: img.name || `handwritten_${idx + 1}.jpg`,
              mimeType: img.mimeType || 'image/jpeg',
              dataUrl:
                img.dataUrl ||
                `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`
            }))
        : [];

      const now = new Date();
      const newItem = {
        id: `INBOX-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(now.getTime()).slice(-5)}`,
        createdAt: now.toISOString(),
        createdBy: String(createdBy || '科內紀錄人').trim(),
        category,
        meetingTitle: String(meetingTitle || '').trim() || '未命名會議草稿（待 IDE 整理）',
        date,
        transcript: cleanTranscript,
        handwrittenImages: cleanImages,
        hasAudio: Boolean(hasAudio && audioChunkCount > 0),
        audioChunkCount: Number(audioChunkCount) || 0,
        audioByteSize: Number(audioByteSize) || 0,
        audioMimeType: hasAudio ? audioMimeType || 'audio/mp4' : null,
        audioFileName: hasAudio ? audioFileName || `voice_${now.toISOString().slice(0, 10)}.m4a` : null,
        audioBase64: null, // 分段存於獨立 key，避免拖慢列表查詢與爆量
        audioUploadComplete: !hasAudio,
        status: hasAudio && audioChunkCount > 0 ? 'uploading' : 'pending'
      };

      const nextList = [newItem, ...items];
      const pruned = nextList.slice(15);
      items = nextList.slice(0, 15);
      await db.write('draft_inbox.json', items);

      // 清理超出 15 筆上限被淘汰之舊草稿分段音檔
      if (pruned.length > 0) {
        await Promise.allSettled(pruned.map((old) => cleanupDraftAudioChunks(old)));
      }

      return NextResponse.json({
        success: true,
        id: newItem.id,
        item: newItem,
        items
      });
    }

    // STEP 2（可選）：逐張附加手寫稿照片，避免大量照片超過單次傳輸上限
    if (action === 'append_image') {
      const { id, image } = body;
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0 || !image || (!image.dataUrl && !image.base64)) {
        return NextResponse.json({ error: '找不到草稿或圖片資料不完整' }, { status: 400 });
      }
      const cleanImg = {
        id: image.id || `IMG-${(items[idx].handwrittenImages?.length || 0) + 1}`,
        name: image.name || `handwritten_${(items[idx].handwrittenImages?.length || 0) + 1}.jpg`,
        mimeType: image.mimeType || 'image/jpeg',
        dataUrl:
          image.dataUrl || `data:${image.mimeType || 'image/jpeg'};base64,${image.base64}`
      };
      items[idx] = {
        ...items[idx],
        handwrittenImages: [...(items[idx].handwrittenImages || []), cleanImg]
      };
      await db.write('draft_inbox.json', items);
      return NextResponse.json({ success: true, id, count: items[idx].handwrittenImages.length });
    }

    // STEP 3（分段上傳模式）：完成上傳並標記為待整理
    if (action === 'finalize_draft') {
      const { id } = body;
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: '找不到指定草稿' }, { status: 404 });
      }
      const target = {
        ...items[idx],
        audioUploadComplete: true,
        status: 'pending'
      };
      items[idx] = target;
      await db.write('draft_inbox.json', items);

      const sizeStr =
        target.audioByteSize > 0 ? ` (${(target.audioByteSize / (1024 * 1024)).toFixed(2)} MB)` : '';
      return NextResponse.json({
        success: true,
        item: target,
        items,
        message: `☁️ 已成功暫存至雲端草稿匣（共含 ${(target.handwrittenImages || []).length} 張手寫稿${
          target.hasAudio ? `、1 份錄音檔${sizeStr}` : ''
        }${target.transcript ? '、語音/文字速記' : ''}）！回電腦用 IDE 抓取即可完整拼回分析。`
      });
    }

    // 向下相容：傳統單次 save_draft（自動將音檔也轉存分段 key，確保列表輕量快速）
    if (action === 'save_draft') {
      const {
        category = 'dept',
        meetingTitle = '',
        date = new Date().toISOString().slice(0, 10),
        createdBy = '科內紀錄人',
        transcript = '',
        handwrittenImages = [],
        audioBase64 = null,
        audioMimeType = 'audio/webm',
        audioFileName = ''
      } = body;

      const cleanTranscript = String(transcript || '').trim();
      const cleanImages = Array.isArray(handwrittenImages)
        ? handwrittenImages
            .filter((img) => img && (img.dataUrl || img.base64))
            .map((img, idx) => ({
              id: img.id || `IMG-${idx + 1}`,
              name: img.name || `handwritten_${idx + 1}.jpg`,
              mimeType: img.mimeType || 'image/jpeg',
              dataUrl:
                img.dataUrl ||
                `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`
            }))
        : [];

      if (!cleanTranscript && cleanImages.length === 0 && !audioBase64) {
        return NextResponse.json(
          { error: '請至少輸入語音逐字稿、上傳手寫稿照片或上傳錄音檔後再暫存至雲端！' },
          { status: 400 }
        );
      }

      const now = new Date();
      const newId = `INBOX-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(now.getTime()).slice(-5)}`;
      const cleanB64 = audioBase64 ? String(audioBase64).trim() : '';
      let chunkCount = 0;
      if (cleanB64) {
        const chunkLen = 1_400_000;
        chunkCount = Math.ceil(cleanB64.length / chunkLen);
        for (let i = 0; i < chunkCount; i++) {
          await db.write(CHUNK_KEY(newId, i), {
            id: newId,
            chunkIndex: i,
            totalChunks: chunkCount,
            chunkData: cleanB64.slice(i * chunkLen, (i + 1) * chunkLen)
          });
        }
      }

      const newItem = {
        id: newId,
        createdAt: now.toISOString(),
        createdBy: String(createdBy || '科內紀錄人').trim(),
        category,
        meetingTitle: String(meetingTitle || '').trim() || '未命名會議草稿（待 IDE 整理）',
        date,
        transcript: cleanTranscript,
        handwrittenImages: cleanImages,
        hasAudio: Boolean(cleanB64),
        audioChunkCount: chunkCount,
        audioByteSize: cleanB64 ? Math.floor((cleanB64.length * 3) / 4) : 0,
        audioMimeType: cleanB64 ? audioMimeType : null,
        audioFileName: cleanB64 ? audioFileName || `voice_${now.toISOString().slice(0, 10)}.webm` : null,
        audioBase64: null,
        audioUploadComplete: true,
        status: 'pending'
      };

      const nextList = [newItem, ...items];
      const pruned = nextList.slice(15);
      items = nextList.slice(0, 15);
      await db.write('draft_inbox.json', items);

      if (pruned.length > 0) {
        await Promise.allSettled(pruned.map((old) => cleanupDraftAudioChunks(old)));
      }

      return NextResponse.json({
        success: true,
        item: newItem,
        items,
        message: `☁️ 已成功暫存至雲端草稿匣（共含 ${cleanImages.length} 張手寫稿${
          cleanB64 ? '、1 份錄音檔' : ''
        }${cleanTranscript ? '、語音/文字速記' : ''}）！回到電腦打開 IDE 即可請 AI 直接抓取分析。`
      });
    }

    if (action === 'delete_draft') {
      const { id } = body;
      const target = items.find((item) => item.id === id);
      if (target) {
        await cleanupDraftAudioChunks(target);
      }
      items = items.filter((item) => item.id !== id);
      await db.write('draft_inbox.json', items);
      return NextResponse.json({
        success: true,
        items,
        message: '🗑️ 已刪除該筆雲端暫存草稿'
      });
    }

    if (action === 'mark_processed') {
      const { id } = body;
      items = items.map((item) => (item.id === id ? { ...item, status: 'processed' } : item));
      await db.write('draft_inbox.json', items);
      return NextResponse.json({
        success: true,
        items,
        message: '✅ 已標記為整理完成'
      });
    }

    if (action === 'clear_all') {
      await Promise.allSettled(items.map((item) => cleanupDraftAudioChunks(item)));
      items = [];
      await db.write('draft_inbox.json', items);
      return NextResponse.json({
        success: true,
        items: [],
        message: '🗑️ 已清空所有雲端暫存草稿'
      });
    }

    return NextResponse.json({ error: '未知的操作' }, { status: 400 });
  } catch (error) {
    console.error('Draft Inbox POST Error:', error);
    return NextResponse.json({ error: '儲存雲端暫存草稿失敗，請稍後再試' }, { status: 500 });
  }
}
