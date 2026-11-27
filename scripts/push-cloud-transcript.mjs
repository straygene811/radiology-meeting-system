import fs from 'fs';
import path from 'path';

const CLOUD_URL =
  process.env.CLOUD_INBOX_URL || 'https://radiology-meeting-system.vercel.app/api/draft-inbox';

function usage() {
  console.log(`
用法：
  1) 直接指定草稿夾內轉譯好的 .txt（會自動偵測草稿編號 INBOX-...）：
     node scripts/push-cloud-transcript.mjs "草稿夾/2026-11-27_黃玉青_INBOX-20261127-10288/語音逐字稿.txt"

  2) 手動指定草稿編號與文字檔路徑（選填第 3 參數：標題）：
     node scripts/push-cloud-transcript.mjs INBOX-20261127-10288 "草稿夾/.../語音逐字稿.txt" "115年科務會議轉譯稿"

  環境變數（可選）：
     CLOUD_INBOX_URL=http://localhost:3000/api/draft-inbox   （改推至本機測試站）
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }

  let draftId = '';
  let filePath = '';
  let customTitle = '';

  if (fs.existsSync(args[0]) && fs.statSync(args[0]).isFile()) {
    filePath = path.resolve(args[0]);
    customTitle = args[1] || '';
    const match = filePath.match(/(INBOX-\d{8}-\d+|TRANS-\d{8}-\d+)/i);
    if (match) draftId = match[1];
  } else {
    draftId = args[0] || '';
    filePath = args[1] ? path.resolve(args[1]) : '';
    customTitle = args[2] || '';
  }

  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`❌ 找不到文字檔：${filePath || '(未指定)'}`);
    usage();
    process.exit(1);
  }

  const text = fs.readFileSync(filePath, 'utf-8').trim();
  if (!text) {
    console.error('❌ 文字檔內容為空，已取消回傳。');
    process.exit(1);
  }

  // 若檔名/路徑沒有編號，試著從文字檔前幾行找「暫存編號: INBOX-...」
  if (!draftId) {
    const lineMatch = text.match(/暫存編號[：:]\s*(INBOX-\d{8}-\d+|TRANS-\d{8}-\d+)/i);
    if (lineMatch) draftId = lineMatch[1];
  }

  const fileName = path.basename(filePath);
  const payload = {
    action: 'return_transcript',
    id: draftId,
    meetingTitle: customTitle,
    returnedTranscript: text,
    transcriptTitle: fileName,
    transcribedBy: '管理者 IDE 轉譯'
  };

  console.log(`📤 正在回傳轉譯文字檔至 ${CLOUD_URL}`);
  console.log(`   草稿編號：${draftId || '（將自動新建一筆轉譯文字檔）'}`);
  console.log(`   檔案來源：${filePath}（${text.length} 字）`);

  const res = await fetch(CLOUD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    console.error(`❌ 回傳失敗 (HTTP ${res.status}):`, data.error || data);
    process.exit(1);
  }

  console.log(`✅ ${data.message}`);
  console.log(`   人員現在可於 App 點選「進入維護會議紀錄」➔「📥 載入轉譯文字檔」直接點選整理！`);
}

main().catch((err) => {
  console.error('❌ 回傳過程發生錯誤:', err);
  process.exit(1);
});
