import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAdmin } from '@/lib/auth';

export async function POST(request) {
  const role = await verifyAdmin();
  if (!role) {
    return NextResponse.json({ error: '未授權的存取' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const settings = (await db.read('settings.json')) || {};
    const webhookUrl = (body.webhookUrl || settings.googleSheetWebhookUrl || '').trim();

    if (!webhookUrl) {
      return NextResponse.json(
        { error: '請先填入 Google Apps Script 部署後的網頁應用程式網址 (Webhook URL)' },
        { status: 400 }
      );
    }

    const [staff, meetings] = await Promise.all([
      db.read('staff.json'),
      db.read('meetings.json')
    ]);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync_all',
        timestamp: new Date().toISOString(),
        hospitalName: settings.hospitalName || '新樓基督教醫院',
        departmentName: settings.departmentName || '影像醫學科',
        staff: staff || [],
        meetings: meetings || []
      })
    });

    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    const nowIso = new Date().toISOString();
    settings.googleSheetWebhookUrl = webhookUrl;
    settings.lastSyncedAt = nowIso;
    await db.write('settings.json', settings);

    return NextResponse.json({
      success: true,
      syncedAt: nowIso,
      remoteResponse: parsed,
      message: `已成功將 ${staff?.length || 0} 筆人員與 ${meetings?.length || 0} 場會議紀錄同步至 Google 試算表！`
    });
  } catch (error) {
    console.error('Sync Google Sheets Error:', error);
    return NextResponse.json(
      { error: `同步連線失敗：${error.message || '請確認網址是否正確且權限設為「所有人」'}` },
      { status: 500 }
    );
  }
}

