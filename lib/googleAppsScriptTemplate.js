export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * 新樓基督教醫院 - 影像醫學科會議整合系統
 * Google Sheets 雲端試算表雙向同步腳本 (Google Apps Script)
 *
 * 【安裝步驟】
 * 1. 開啟一份新的 Google 試算表 (Google Sheets)
 * 2. 點選上方選單「擴充功能」>「Apps Script」
 * 3. 將本程式碼完整貼上（覆蓋原本的 myFunction），按 Ctrl+S 儲存
 * 4. 點選右上角「部署」>「新增部署作業」
 * 5. 左側齒輪選「網頁應用程式」，執行身分選「我」，誰可以存取選「所有人」
 * 6. 部署後複製「網頁應用程式網址 (https://script.google.com/macros/s/.../exec)」
 * 7. 貼回「影像醫學科會議整合系統」後台 >「系統與雲端設定」即可一鍵同步！
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (payload.action === 'sync_all') {
      syncStaffSheet(ss, payload.staff || []);
      syncMeetingsSheet(ss, payload.meetings || []);
      syncSignaturesSheet(ss, payload.meetings || []);
      syncActionItemsSheet(ss, payload.meetings || []);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: '已成功同步至 Google 試算表（含人員名冊、會議紀錄、簽核明細、待辦事項）',
        syncedAt: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: '未知的操作指令'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    system: '新樓醫院影像醫學科會議整合系統 Google Sheets Webhook 運作中'
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  sheet.clearContents();
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#dbeafe');
  return sheet;
}

function syncStaffSheet(ss, staffList) {
  var headers = ['系統編號', '登入代號', '姓名', '職稱', '系統角色', '所屬組別', '在職狀態', '備註'];
  var sheet = getOrCreateSheet(ss, '1_科內人員名冊', headers);
  staffList.forEach(function(s) {
    sheet.appendRow([
      s.id || '',
      s.code || '',
      s.name || '',
      s.title || '',
      s.role || '',
      (s.groups || []).join('、'),
      s.status || '',
      s.note || ''
    ]);
  });
}

function syncMeetingsSheet(ss, meetings) {
  var headers = ['會議編號', '會議名稱', '會議類別', '日期', '時間', '地點', '主席', '記錄', '狀態', '應到人數', '出席人數', '出席率(%)', '已簽閱人數', '決議事項摘要', '討論內容全文'];
  var sheet = getOrCreateSheet(ss, '2_會議紀錄總表', headers);
  meetings.forEach(function(m) {
    var expected = m.expectedCount || (m.presentStaffNames ? m.presentStaffNames.length : 0);
    var present = m.presentStaffNames ? m.presentStaffNames.length : 0;
    var rate = expected > 0 ? Math.round((present / expected) * 100) : 100;
    var signedCount = m.signatures ? Object.keys(m.signatures).length : 0;
    var discussionText = (m.discussionSections || []).map(function(sec) {
      return '【' + sec.heading + '】\\n' + (sec.bullets || []).map(function(b) { return '• ' + b; }).join('\\n');
    }).join('\\n\\n');

    sheet.appendRow([
      m.id || '',
      m.title || '',
      m.category || '',
      m.date || '',
      m.time || '',
      m.location || '',
      m.chair || '',
      m.recorder || '',
      m.status || '',
      expected,
      present,
      rate + '%',
      signedCount,
      (m.resolutions || []).join('；'),
      discussionText
    ]);
  });
}

function syncSignaturesSheet(ss, meetings) {
  var headers = ['會議編號', '會議名稱', '會議日期', '簽核人員姓名', '簽核方式', '簽核時間', '回饋意見/備註', '是否有手寫電子簽名'];
  var sheet = getOrCreateSheet(ss, '3_簽到與簽閱明細', headers);
  meetings.forEach(function(m) {
    var sigs = m.signatures || {};
    Object.keys(sigs).forEach(function(name) {
      var sig = sigs[name];
      sheet.appendRow([
        m.id || '',
        m.title || '',
        m.date || '',
        sig.name || name,
        sig.method || '手機已閱簽認',
        sig.signedAt || '',
        sig.comment || '',
        sig.signatureDataUrl ? '是 (含電子簽名圖檔)' : '否 (時間戳記簽認)'
      ]);
    });
  });
}

function syncActionItemsSheet(ss, meetings) {
  var headers = ['來源會議編號', '來源會議名稱', '待辦編號', '待辦事項內容', '負責人', '預計完成日', '執行狀態'];
  var sheet = getOrCreateSheet(ss, '4_待辦事項追蹤表', headers);
  meetings.forEach(function(m) {
    (m.actionItems || []).forEach(function(item) {
      sheet.appendRow([
        m.id || '',
        m.title || '',
        item.id || '',
        item.task || '',
        item.assignee || '',
        item.dueDate || '',
        item.status || ''
      ]);
    });
  });
}
`;

