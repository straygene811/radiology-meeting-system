// 分段上傳至雲端草稿匣工具（自動切塊 <= 1.4MB，徹底避開 Vercel 4.5MB 單次傳輸限制）

const AUDIO_CHUNK_CHARS = 1_400_000; // 每塊約 1.4MB Base64（約 1.05MB 原始音檔），安全低於 Vercel 4.5MB 上限
const IMAGE_BATCH_MAX_CHARS = 1_200_000;

async function postJsonWithRetry(url, bodyObj, retries = 2) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj)
      });
      if (res.status === 413) {
        throw new Error('單次傳輸資料量超過伺服器上限 (4.5MB)');
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `伺服器回應錯誤 (${res.status})`);
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
  }
  throw lastErr || new Error('上傳至雲端失敗');
}

export async function uploadDraftToCloudInbox(
  {
    meetingId = '',
    category = 'dept',
    meetingTitle = '',
    date = new Date().toISOString().slice(0, 10),
    createdBy = '科內紀錄人',
    transcript = '',
    handwrittenImages = [],
    audioBase64 = null,
    audioMimeType = 'audio/mp4',
    audioFileName = ''
  },
  onProgress = () => {}
) {
  const cleanImages = (Array.isArray(handwrittenImages) ? handwrittenImages : [])
    .filter((img) => img && (img.dataUrl || img.base64))
    .map((img, idx) => ({
      id: img.id || `IMG-${idx + 1}`,
      name: img.name || `handwritten_${idx + 1}.jpg`,
      mimeType: img.mimeType || 'image/jpeg',
      dataUrl: img.dataUrl || `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`
    }));

  const cleanAudioB64 = audioBase64 ? String(audioBase64).trim() : '';
  const audioChunkCount = cleanAudioB64 ? Math.ceil(cleanAudioB64.length / AUDIO_CHUNK_CHARS) : 0;
  const audioByteSize = cleanAudioB64 ? Math.floor((cleanAudioB64.length * 3) / 4) : 0;

  // 計算圖片總大小，決定要隨 init_draft 一起送還是分批送
  const totalImagesChars = cleanImages.reduce((sum, img) => sum + (img.dataUrl?.length || 0), 0);
  const inlineImages = totalImagesChars <= IMAGE_BATCH_MAX_CHARS ? cleanImages : [];
  const deferredImages = totalImagesChars <= IMAGE_BATCH_MAX_CHARS ? [] : cleanImages;

  // STEP 1: 建立雲端草稿主記錄
  onProgress('建立雲端暫存草稿...');
  const initRes = await postJsonWithRetry('/api/draft-inbox', {
    action: 'init_draft',
    meetingId,
    category,
    meetingTitle,
    date,
    createdBy,
    transcript,
    handwrittenImages: inlineImages,
    hasAudio: Boolean(cleanAudioB64),
    audioChunkCount,
    audioMimeType: cleanAudioB64 ? audioMimeType : null,
    audioFileName: cleanAudioB64 ? audioFileName : null,
    audioByteSize
  });

  const draftId = initRes.id;

  // STEP 2: 若圖片總量較大，逐張安全補傳
  for (let i = 0; i < deferredImages.length; i++) {
    onProgress(`上傳手寫稿照片 ${i + 1}/${deferredImages.length}...`);
    await postJsonWithRetry('/api/draft-inbox', {
      action: 'append_image',
      id: draftId,
      image: deferredImages[i]
    });
  }

  // STEP 3: 若有錄音檔，自動切成每段 <= 1.4MB 分段上傳
  if (cleanAudioB64 && audioChunkCount > 0) {
    for (let i = 0; i < audioChunkCount; i++) {
      const start = i * AUDIO_CHUNK_CHARS;
      const chunkData = cleanAudioB64.slice(start, start + AUDIO_CHUNK_CHARS);
      const pct = Math.round(((i + 1) / audioChunkCount) * 100);
      onProgress(`上傳語音分段 ${i + 1}/${audioChunkCount} (${pct}%)...`);
      await postJsonWithRetry('/api/draft-inbox', {
        action: 'upload_audio_chunk',
        id: draftId,
        chunkIndex: i,
        totalChunks: audioChunkCount,
        chunkData
      });
    }
  }

  // STEP 4: 標記完成並取得最新草稿清單
  onProgress('完成雲端存檔...');
  const finalRes = await postJsonWithRetry('/api/draft-inbox', {
    action: 'finalize_draft',
    id: draftId
  });

  return finalRes;
}

export async function downloadChunkedAudioBase64(item, apiBase = '/api/draft-inbox', onProgress = () => {}) {
  if (!item) return null;
  if (item.audioBase64) return item.audioBase64;
  const count = Number(item.audioChunkCount) || 0;
  if (count <= 0) return null;

  const parts = [];
  for (let i = 0; i < count; i++) {
    onProgress(`下載語音分段 ${i + 1}/${count}...`);
    const res = await fetch(`${apiBase}?audioId=${encodeURIComponent(item.id)}&chunk=${i}`, {
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`下載語音分段 ${i + 1} 失敗 (${res.status})`);
    }
    const data = await res.json();
    if (!data.success || !data.chunkData) {
      throw new Error(data.error || `語音分段 ${i + 1} 資料遺失`);
    }
    parts.push(data.chunkData);
  }
  return parts.join('');
}
