import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const rawItems = await db.read('draft_inbox.json');
    const items = Array.isArray(rawItems) ? rawItems : [];
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

    const rawItems = await db.read('draft_inbox.json');
    let items = Array.isArray(rawItems) ? [...rawItems] : [];

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
      const newItem = {
        id: `INBOX-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(now.getTime()).slice(-5)}`,
        createdAt: now.toISOString(),
        createdBy: String(createdBy || '科內紀錄人').trim(),
        category,
        meetingTitle: String(meetingTitle || '').trim() || '未命名會議草稿（待 IDE 整理）',
        date,
        transcript: cleanTranscript,
        handwrittenImages: cleanImages,
        hasAudio: Boolean(audioBase64),
        audioMimeType: audioBase64 ? audioMimeType : null,
        audioFileName: audioBase64 ? audioFileName || `voice_${now.toISOString().slice(0, 10)}.webm` : null,
        audioBase64: audioBase64 || null,
        status: 'pending'
      };

      // 最新暫存排在最前面，最多保留最近 15 筆避免佔用過大空間
      items = [newItem, ...items].slice(0, 15);
      await db.write('draft_inbox.json', items);

      return NextResponse.json({
        success: true,
        item: newItem,
        items,
        message: `☁️ 已成功暫存至雲端草稿匣（共含 ${cleanImages.length} 張手寫稿${
          audioBase64 ? '、1 份錄音檔' : ''
        }${cleanTranscript ? '、語音/文字速記' : ''}）！回到電腦打開 IDE 即可請 AI 直接抓取分析。`
      });
    }

    if (action === 'delete_draft') {
      const { id } = body;
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
    return NextResponse.json({ error: '儲存雲端暫存草稿失敗（請確認單次錄音檔大小未超過 3.5MB）' }, { status: 500 });
  }
}
