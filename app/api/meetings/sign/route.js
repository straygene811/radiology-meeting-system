import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      meetingId,
      staffId,
      staffName,
      mode = 'sign', // 'sign' | 'checkin' | 'update_task'
      comment = '',
      signatureDataUrl = null,
      actionItemId = null,
      taskStatus = null
    } = body;

    const meetings = (await db.read('meetings.json')) || [];
    const idx = meetings.findIndex((m) => m.id === meetingId);
    if (idx < 0) {
      return NextResponse.json({ error: '找不到該場會議紀錄' }, { status: 404 });
    }

    const meeting = meetings[idx];
    const nowIso = new Date().toISOString();

    if (mode === 'update_task') {
      meeting.actionItems = (meeting.actionItems || []).map((item) =>
        item.id === actionItemId ? { ...item, status: taskStatus } : item
      );
      meetings[idx] = meeting;
      await db.write('meetings.json', meetings);
      return NextResponse.json({
        success: true,
        meeting,
        meetings
      });
    }

    if (!staffName || !staffName.trim()) {
      return NextResponse.json({ error: '簽核人員姓名不能為空' }, { status: 400 });
    }

    const cleanName = staffName.trim();

    if (!meeting.signatures) {
      meeting.signatures = {};
    }

    // 若為現場 QR Code 掃碼簽到，同步將人員加入出席名單並自請假名單移除
    if (mode === 'checkin') {
      const presentSet = new Set(meeting.presentStaffNames || []);
      presentSet.add(cleanName);
      meeting.presentStaffNames = Array.from(presentSet);
      meeting.leaveStaffNames = (meeting.leaveStaffNames || []).filter((n) => n !== cleanName);
    }

    const methodLabel =
      mode === 'checkin'
        ? signatureDataUrl
          ? '現場QR簽到(含手寫簽名)'
          : '現場QR掃碼簽到'
        : signatureDataUrl
        ? '手機手寫電子簽名'
        : '手機一鍵已閱簽認';

    meeting.signatures[cleanName] = {
      staffId: staffId || cleanName,
      name: cleanName,
      method: methodLabel,
      signedAt: nowIso,
      comment: comment.trim() || (mode === 'checkin' ? '現場出席簽到' : '已詳閱會議紀錄'),
      signatureDataUrl: signatureDataUrl || meeting.signatures[cleanName]?.signatureDataUrl || null
    };

    // 若該同仁原本在「退回重簽 (reopenedForStaff)」清單中，完成簽名後即移出，自動歸回歷史紀錄專區
    if (Array.isArray(meeting.reopenedForStaff)) {
      meeting.reopenedForStaff = meeting.reopenedForStaff.filter((n) => n !== cleanName);
    }

    meetings[idx] = meeting;
    await db.write('meetings.json', meetings);

    return NextResponse.json({
      success: true,
      meeting,
      meetings
    });
  } catch (error) {
    console.error('Sign API Error:', error);
    return NextResponse.json({ error: '簽核儲存失敗，請稍後再試' }, { status: 500 });
  }
}
