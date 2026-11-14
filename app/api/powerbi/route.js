import { NextResponse } from 'next/server';
import iconv from 'iconv-lite';
import { db } from '@/lib/db';

function normalizeForCp950(str) {
  return String(str || '')
    .replace(/\u30FB/g, '、')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
}

function toCsvResponse(rows, filename = 'powerbi_data.csv', encoding = 'big5') {
  const isUtf8 = encoding === 'utf8' || encoding === 'utf-8';
  if (!Array.isArray(rows) || rows.length === 0) {
    const emptyText = '無資料\r\n';
    const bodyBuf = isUtf8
      ? Buffer.from('\uFEFF' + emptyText, 'utf8')
      : iconv.encode(emptyText, 'cp950');
    return new Response(bodyBuf, {
      headers: {
        'Content-Type': isUtf8 ? 'text/csv; charset=utf-8' : 'text/csv; charset=big5',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = r[h] === null || r[h] === undefined ? '' : r[h];
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    )
  ];

  const csvBody = lines.join('\r\n');
  const bodyBuf = isUtf8
    ? Buffer.from('\uFEFF' + csvBody, 'utf8')
    : iconv.encode(normalizeForCp950(csvBody), 'cp950');

  return new Response(bodyBuf, {
    headers: {
      // 台灣版 Windows Power BI Desktop「取得資料 -> Web」讀取 CSV 時預設強制使用 950 (Big5/CP950)，
      // 預設輸出 CP950 即可讓 Power BI 免設定直接顯示繁體中文零亂碼！
      'Content-Type': isUtf8 ? 'text/csv; charset=utf-8' : 'text/csv; charset=big5',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function escapeHtml(val) {
  return String(val === null || val === undefined ? '' : val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtmlTable(id, caption, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<table id="${id}"><caption>${escapeHtml(caption)}</caption><thead><tr><th>狀態</th></tr></thead><tbody><tr><td>無資料</td></tr></tbody></table>`;
  }
  const headers = Object.keys(rows[0]);
  const thead = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map(
      (r) =>
        `<tr>${headers
          .map((h) => `<td>${escapeHtml(r[h])}</td>`)
          .join('')}</tr>`
    )
    .join('')}</tbody>`;
  return `<table id="${id}" border="1"><caption>${escapeHtml(caption)}</caption>${thead}${tbody}</table>`;
}

function toHtmlTablesResponse(tablesMap) {
  const html = `<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta charset="utf-8" />
  <title>新樓基督教醫院 影像醫學科會議整合系統 — Power BI 互動式圖表與即時資料源</title>
  <style>
    body { font-family: "Microsoft JhengHei", sans-serif; padding: 16px 24px; color: #0f172a; background: #f8fafc; margin: 0; }
    .top-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; background: #1e293b; color: #fff; padding: 14px 20px; border-radius: 12px; margin-bottom: 16px; border-bottom: 3px solid #f59e0b; }
    .btn-link { background: #f59e0b; color: #0f172a; font-weight: 800; padding: 8px 16px; border-radius: 8px; text-decoration: none; font-size: 14px; }
    .chart-frame { width: 100%; height: 780px; border: 2px solid #cbd5e1; border-radius: 12px; background: #fff; margin-bottom: 24px; }
    h2 { color: #1e3a8a; margin-top: 28px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 24px; font-size: 13px; background: #fff; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    caption { font-weight: 800; font-size: 16px; text-align: left; margin-bottom: 8px; color: #0f172a; }
  </style>
</head>
<body>
  <div class="top-bar">
    <div>
      <strong style="font-size:18px;">📊 新樓基督教醫院 影像醫學科 — Power BI 互動式視覺化圖表 ＆ 4 大即時資料表</strong>
      <div style="font-size:12px; color:#cbd5e1; margin-top:4px;">上方可直接操作 Power BI 互動式圖表（支援點擊交叉篩選）；下方 4 張標準資料表供 Power BI Desktop「取得資料 ➔ Web」直接抓取</div>
    </div>
    <a class="btn-link" href="/powerbi" target="_blank">🖥️ 全螢幕開啟 Power BI 互動式圖表中心 ↗</a>
  </div>
  <iframe class="chart-frame" src="/powerbi" title="Power BI Interactive Charts"></iframe>
  <h2>🗂️ Power BI 原始連動資料表（共 4 張表，供 Power BI Desktop 導覽器直接勾選）</h2>
  ${Object.entries(tablesMap)
    .map(([id, info]) => renderHtmlTable(id, info.caption, info.rows))
    .join('\n')}
</body>
</html>`;

  return new Response(Buffer.from(html, 'utf8'), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const table = (searchParams.get('table') || 'all').toLowerCase();
    const format = (searchParams.get('format') || 'json').toLowerCase();
    const encoding = (searchParams.get('encoding') || 'big5').toLowerCase();

    const [meetingsRaw, staffRaw, settingsRaw] = await Promise.all([
      db.read('meetings.json'),
      db.read('staff.json'),
      db.read('settings.json')
    ]);

    const meetings = meetingsRaw || [];
    const staff = staffRaw || [];
    const settings = settingsRaw || {};
    const categories = settings.meetingCategories || [];
    const inServiceStaff = staff.filter((s) => s.status === '在職');
    const inServiceNames = inServiceStaff.map((s) => s.name);

    const getCatName = (catId) => {
      const found = categories.find((c) => c.id === catId);
      return found ? found.shortName || found.name : catId;
    };

    // 1. 會議總表 (meetings)
    const meetingsTable = meetings.map((m) => {
      const signedMap = m.signatures || {};
      const signedNames = Object.keys(signedMap);
      const signedCount = signedNames.length;
      const presentList = m.presentStaffNames || [];
      const leaveList = m.leaveStaffNames || [];
      const targetPool =
        m.isArchived && (m.reopenedForStaff || []).length === 0
          ? Array.from(new Set([...presentList, ...signedNames]))
          : Array.from(new Set([...inServiceNames, ...presentList]));
      const unsignedCount = Math.max(0, targetPool.filter((n) => !signedMap[n]).length);
      const expectedCount = m.expectedCount || targetPool.length || 20;
      const attendanceRate = expectedCount > 0 ? Math.round((presentList.length / expectedCount) * 100) : 100;
      const signRate = targetPool.length > 0 ? Math.round((signedCount / targetPool.length) * 100) : 100;

      return {
        會議ID: m.id,
        會議標題: m.title,
        會議分類代碼: m.category,
        會議分類名稱: getCatName(m.category),
        民國年度: m.rocYear || String((parseInt((m.date || '2026').slice(0, 4), 10) || 2026) - 1911),
        開會日期: m.date,
        開會時間: m.time || '',
        開會地點: m.location || '',
        會議主席: m.chair || '',
        會議記錄人: m.recorder || '',
        專區狀態: m.isArchived ? '歷史紀錄專區' : '開放簽閱中',
        應到人數: expectedCount,
        出席人數: presentList.length,
        值班休假人數: leaveList.length,
        出席率百分比: attendanceRate,
        已簽核人數: signedCount,
        未簽核人數: unsignedCount,
        簽核率百分比: signRate,
        議程數: (m.agendaItems || []).length,
        決議數: (m.resolutions || []).length,
        待辦事項數: (m.actionItems || []).length,
        附件檔案數: (m.attachments || []).length,
        出席人員名單: presentList.join('、'),
        值班休假名單: leaveList.join('、')
      };
    });

    // 2. 出席與簽核交叉明細表 (attendance - Power BI Fact Table)
    const attendanceTable = [];
    meetings.forEach((m) => {
      const signedMap = m.signatures || {};
      const presentList = m.presentStaffNames || [];
      const leaveList = m.leaveStaffNames || [];
      const catName = getCatName(m.category);
      const rocYear = m.rocYear || String((parseInt((m.date || '2026').slice(0, 4), 10) || 2026) - 1911);

      const allPeopleInMtg = Array.from(
        new Set([...inServiceNames, ...presentList, ...leaveList, ...Object.keys(signedMap)])
      );

      allPeopleInMtg.forEach((personName) => {
        const staffObj = staff.find((s) => s.name === personName);
        const isPresent = presentList.includes(personName);
        const isLeave = leaveList.includes(personName) || !isPresent;
        const sig = signedMap[personName];
        const isSigned = Boolean(sig);

        attendanceTable.push({
          會議ID: m.id,
          會議標題: m.title,
          會議分類: catName,
          民國年度: rocYear,
          開會日期: m.date,
          專區狀態: m.isArchived ? '歷史紀錄專區' : '開放簽閱中',
          人員代號: staffObj?.code || 'EXT',
          人員姓名: personName,
          職稱: staffObj?.title || '手動新增人員',
          所屬組別: (staffObj?.groups || ['一般科會']).join('、'),
          出勤狀態: isPresent ? '出席' : '值班/休假(未出席)',
          是否出席數值: isPresent ? 1 : 0,
          是否值班休假數值: isLeave ? 1 : 0,
          簽核狀態: isSigned ? '已簽核' : '未簽核',
          是否已簽核數值: isSigned ? 1 : 0,
          簽核方式: sig?.method || '尚未簽核',
          簽核時間: sig?.signedAt || '',
          簽核意見: sig?.comment || ''
        });
      });
    });

    // 3. 人員統計維度表 (staff)
    const staffTable = staff
      .filter((s) => s.status !== '離職')
      .map((s) => {
        const totalMeetings = meetings.length;
        const attendedCount = meetings.filter((m) => (m.presentStaffNames || []).includes(s.name)).length;
        const leaveCount = meetings.filter((m) => (m.leaveStaffNames || []).includes(s.name)).length;
        const signedCount = meetings.filter((m) => Boolean(m.signatures?.[s.name])).length;
        const unsignedCount = Math.max(0, totalMeetings - signedCount);

        return {
          人員ID: s.id,
          登入代號: s.code,
          姓名: s.name,
          職稱: s.title,
          在職狀態: s.status,
          所屬組別: (s.groups || []).join('、'),
          總會議場次: totalMeetings,
          實際出席場次: attendedCount,
          值班休假場次: leaveCount,
          出席率百分比: totalMeetings > 0 ? Math.round((attendedCount / totalMeetings) * 100) : 100,
          已簽核場次: signedCount,
          未簽核場次: unsignedCount,
          簽核率百分比: totalMeetings > 0 ? Math.round((signedCount / totalMeetings) * 100) : 100
        };
      });

    // 4. 待辦追蹤事項表 (actions)
    const actionsTable = [];
    meetings.forEach((m) => {
      const catName = getCatName(m.category);
      (m.actionItems || []).forEach((act, idx) => {
        actionsTable.push({
          待辦ID: act.id || `${m.id}-ACT-${idx + 1}`,
          會議ID: m.id,
          會議標題: m.title,
          會議分類: catName,
          開會日期: m.date,
          待辦事項內容: act.task,
          負責人員: act.assignee,
          預計完成日: act.dueDate || '',
          進度狀態: act.status || '進行中',
          是否已完成數值: act.status === '已完成' ? 1 : 0
        });
      });
    });

    // Power BI Web HTML 表格模式（一次顯示 4 張表供勾選，且強制 UTF-8 100% 零亂碼）
    if (format === 'html') {
      if (table === 'meetings') {
        return toHtmlTablesResponse({ meetings: { caption: '1_會議總表', rows: meetingsTable } });
      }
      if (table === 'attendance') {
        return toHtmlTablesResponse({ attendance: { caption: '2_出席與簽核明細表', rows: attendanceTable } });
      }
      if (table === 'staff') {
        return toHtmlTablesResponse({ staff: { caption: '3_全科人員統計表', rows: staffTable } });
      }
      if (table === 'actions') {
        return toHtmlTablesResponse({ actions: { caption: '4_待辦事項追蹤表', rows: actionsTable } });
      }
      return toHtmlTablesResponse({
        meetings: { caption: '1_會議總表', rows: meetingsTable },
        attendance: { caption: '2_出席與簽核明細表', rows: attendanceTable },
        staff: { caption: '3_全科人員統計表', rows: staffTable },
        actions: { caption: '4_待辦事項追蹤表', rows: actionsTable }
      });
    }

    // Power BI / Excel CSV 模式（預設採用 CP950/Big5 完美對應台灣版 Windows Power BI 預設 950 編碼，徹底解決亂碼）
    if (format === 'csv') {
      if (table === 'attendance') return toCsvResponse(attendanceTable, 'powerbi_attendance.csv', encoding);
      if (table === 'staff') return toCsvResponse(staffTable, 'powerbi_staff.csv', encoding);
      if (table === 'actions') return toCsvResponse(actionsTable, 'powerbi_actions.csv', encoding);
      return toCsvResponse(meetingsTable, 'powerbi_meetings.csv', encoding);
    }

    if (table === 'meetings') {
      return NextResponse.json(meetingsTable, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }
    if (table === 'attendance') {
      return NextResponse.json(attendanceTable, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }
    if (table === 'staff') {
      return NextResponse.json(staffTable, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }
    if (table === 'actions') {
      return NextResponse.json(actionsTable, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        hospitalName: settings.hospitalName || '新樓基督教醫院',
        departmentName: settings.departmentName || '影像醫學科',
        summary: {
          totalMeetings: meetings.length,
          activeMeetings: meetings.filter((m) => !m.isArchived).length,
          archivedMeetings: meetings.filter((m) => m.isArchived).length,
          totalStaff: inServiceStaff.length
        },
        meetings: meetingsTable,
        attendance: attendanceTable,
        staff: staffTable,
        actions: actionsTable
      },
      { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (error) {
    console.error('Power BI API Error:', error);
    return NextResponse.json({ error: 'Power BI 資料產生失敗' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const settings = (await db.read('settings.json')) || {};
    const pushUrl = (body.pushUrl || body.powerBiPushUrl || settings.powerBiPushUrl || '').trim();

    if (!pushUrl) {
      return NextResponse.json(
        { error: '請先填入 Power BI 串流資料集推送網址 (Push URL)' },
        { status: 400 }
      );
    }

    const [meetingsRaw, staffRaw] = await Promise.all([
      db.read('meetings.json'),
      db.read('staff.json')
    ]);
    const meetings = meetingsRaw || [];
    const staff = staffRaw || [];
    const inServiceNames = staff.filter((s) => s.status === '在職').map((s) => s.name);

    const payloadRows = meetings.map((m) => {
      const signedMap = m.signatures || {};
      const signedCount = Object.keys(signedMap).length;
      const presentList = m.presentStaffNames || [];
      const targetPool = Array.from(new Set([...inServiceNames, ...presentList]));
      const unsignedCount = Math.max(0, targetPool.filter((n) => !signedMap[n]).length);
      return {
        meetingId: m.id,
        title: m.title,
        category: m.category,
        date: m.date,
        presentCount: presentList.length,
        leaveCount: (m.leaveStaffNames || []).length,
        signedCount,
        unsignedCount,
        timestamp: new Date().toISOString()
      };
    });

    const res = await fetch(pushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadRows)
    });

    settings.powerBiPushUrl = pushUrl;
    settings.lastPowerBiSyncedAt = new Date().toISOString();
    await db.write('settings.json', settings);

    return NextResponse.json({
      success: true,
      status: res.status,
      syncedAt: settings.lastPowerBiSyncedAt,
      message: `✅ 已成功推送 ${payloadRows.length} 場會議統計數據至 Power BI 串流資料集！`
    });
  } catch (error) {
    return NextResponse.json(
      { error: `推送至 Power BI 失敗：${error.message}` },
      { status: 500 }
    );
  }
}
