import fs from 'fs';
import path from 'path';

const CLOUD_URL = process.env.CLOUD_INBOX_URL || 'https://radiology-meeting-system.vercel.app/api/draft-inbox';
const LOCAL_URL = 'http://localhost:3000/api/draft-inbox';
// 直接存放於專案根目錄下的中文資料夾「草稿夾」
const outDir = path.join(process.cwd(), '草稿夾');

async function fetchSource(label, url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((item) => ({ ...item, _source: label, _apiUrl: url }));
  } catch {
    return [];
  }
}

async function fetchChunkedAudio(item) {
  if (item.audioBase64) return item.audioBase64;
  const count = Number(item.audioChunkCount) || 0;
  if (count <= 0 || !item._apiUrl) return null;

  const parts = [];
  for (let i = 0; i < count; i++) {
    process.stdout.write(`   ⏳ 下載語音分段 ${i + 1}/${count}...\r`);
    const res = await fetch(
      `${item._apiUrl}?audioId=${encodeURIComponent(item.id)}&chunk=${i}`,
      { cache: 'no-store' }
    );
    if (!res.ok) {
      console.error(`\n   ⚠️ 語音分段 ${i + 1} 下載失敗 (HTTP ${res.status})`);
      return null;
    }
    const data = await res.json();
    if (!data.success || !data.chunkData) {
      console.error(`\n   ⚠️ 語音分段 ${i + 1} 無資料`);
      return null;
    }
    parts.push(data.chunkData);
  }
  if (count > 0) process.stdout.write('                                     \r');
  return parts.join('');
}

function sanitizeFileName(str) {
  return String(str || '').replace(/[\\/:*?"<>|]/g, '_').trim();
}

async function main() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const [cloudItems, localItems] = await Promise.all([
    fetchSource('Vercel雲端正式版', CLOUD_URL),
    fetchSource('本機測試版', LOCAL_URL)
  ]);

  const seenIds = new Set();
  const merged = [];
  for (const item of [...cloudItems, ...localItems]) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      merged.push(item);
    }
  }

  if (merged.length === 0) {
    console.log('📭 目前雲端與本機草稿匣尚無暫存的手寫稿或語音檔。');
    return;
  }

  console.log(`📥 共抓取到 ${merged.length} 筆暫存草稿，正在存入「${outDir}」：`);

  for (const item of merged) {
    const dateStr = sanitizeFileName(item.date || (item.createdAt || '').slice(0, 10) || '未定日期');
    const uploader = sanitizeFileName(item.createdBy || '科內紀錄人');
    const folderName = `${dateStr}_${uploader}_${sanitizeFileName(item.id)}`;
    const itemDir = path.join(outDir, folderName);

    if (!fs.existsSync(itemDir)) {
      fs.mkdirSync(itemDir, { recursive: true });
    }

    // 1. 儲存文字逐字稿與元資料（中文檔名）
    const metaText = [
      `暫存編號: ${item.id}`,
      `來源環境: ${item._source}`,
      `建立時間: ${item.createdAt}`,
      `上傳人員: ${item.createdBy}`,
      `會議分類: ${item.category}`,
      `預設標題: ${item.meetingTitle}`,
      `開會日期: ${item.date}`,
      `--- 語音逐字稿 / 手寫速記文字 ---`,
      item.transcript || '（無文字稿）'
    ].join('\n');
    const txtPath = path.join(itemDir, '會議語音與速記文字.txt');
    fs.writeFileSync(txtPath, metaText, 'utf-8');

    // 2. 儲存手寫稿照片（中文檔名）
    const savedImages = [];
    for (let i = 0; i < (item.handwrittenImages || []).length; i++) {
      const img = item.handwrittenImages[i];
      const base64 = String(img.dataUrl || '').split(',')[1] || img.base64 || '';
      if (base64) {
        const ext = (img.mimeType || '').includes('png') ? 'png' : 'jpg';
        const origBase = sanitizeFileName(path.parse(img.name || '').name);
        const imgFileName = origBase ? `手寫稿_${i + 1}_${origBase}.${ext}` : `手寫稿_${i + 1}.${ext}`;
        const imgPath = path.join(itemDir, imgFileName);
        fs.writeFileSync(imgPath, Buffer.from(base64, 'base64'));
        savedImages.push(imgPath);
      }
    }

    // 3. 儲存錄音檔（支援自動從分段重新拼回完整大錄音檔，中文檔名）
    let savedAudio = null;
    if (item.hasAudio || item.audioBase64 || item.audioChunkCount > 0) {
      const fullAudioB64 = await fetchChunkedAudio(item);
      if (fullAudioB64) {
        const ext = sanitizeFileName((item.audioFileName || '').split('.').pop() || 'm4a');
        const audioPath = path.join(itemDir, `語音錄音檔.${ext}`);
        const buf = Buffer.from(fullAudioB64, 'base64');
        fs.writeFileSync(audioPath, buf);
        savedAudio = `${audioPath} (${(buf.length / (1024 * 1024)).toFixed(2)} MB)`;
      }
    }

    console.log(`\n✅ [${folderName}] (${item._source}) — ${item.meetingTitle}`);
    console.log(`   📄 文字稿路徑: ${txtPath}`);
    savedImages.forEach((p, idx) => console.log(`   🖼️ 手寫稿照片 (${idx + 1}): ${p}`));
    if (savedAudio) console.log(`   🎵 語音錄音檔: ${savedAudio}`);
  }
}

main();
