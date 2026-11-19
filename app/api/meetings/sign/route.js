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
    if (!meeting.checkins) {
      meeting.checkins = {};
    }

    // 1. 現場出席簽到模式 (mode === 'checkin')：發起會議後 (in_progress) 即可讓與會同仁先完成現場出席簽到
    if (mode === 'checkin') {
      const presentSet = new Set(meeting.presentStaffNames || []);
      presentSet.add(cleanName);
      meeting.presentStaffNames = Array.from(presentSet);
      meeting.leaveStaffNames = (meeting.leaveStaffNames || []).filter((n) => n !== cleanName);

      const checkinMethod = signatureDataUrl ? '現場出席簽到(含手寫簽名)' : '現場出席簽到';
      meeting.checkins[cleanName] = {
        staffId: staffId || cleanName,
        name: cleanName,
        method: checkinMethod,
        checkedInAt: nowIso,
        comment: comment.trim() || '現場出席簽到',
        signatureDataUrl: signatureDataUrl || meeting.checkins[cleanName]?.signatureDataUrl || null
      };

      // 若該場會議已經是由技術主任「正式公布 (published)」之會議，掃碼簽到亦同步視為完成簽閱
      if (meeting.status === 'published' || !meeting.status) {
        meeting.signatures[cleanName] = {
          staffId: staffId || cleanName,
          name: cleanName,
          method: checkinMethod,
          signedAt: nowIso,
          comment: comment.trim() || '現場出席簽到暨查閱',
          signatureDataUrl:
            signatureDataUrl ||
            meeting.signatures[cleanName]?.signatureDataUrl ||
            meeting.checkins[cleanName]?.signatureDataUrl ||
            null
        };
      }

      meetings[idx] = meeting;
      await db.write('meetings.json', meetings);
      return NextResponse.json({
        success: true,
        meeting,
        meetings
      });
    }

    // 2. 會後正式會議紀錄查閱簽認模式 (mode === 'sign')：需待技術主任確認無誤按「公布 (published)」後方可查閱簽認
    if (meeting.status && meeting.status !== 'published') {
      return NextResponse.json(
        {
          error: '⏳ 本場會議尚待技術主任確認公布，公布後方可進行會議紀錄查閱簽認（開會期間請先點選「📲 現場出席簽到」）！'
        },
        { status: 400 }
      );
    }

    const methodLabel = signatureDataUrl ? '手機手寫電子簽名' : '手機一鍵已閱簽認';

    meeting.signatures[cleanName] = {
      staffId: staffId || cleanName,
      name: cleanName,
      method: methodLabel,
      signedAt: nowIso,
      comment: comment.trim() || '已詳閱會議紀錄',
      signatureDataUrl:
        signatureDataUrl ||
        meeting.signatures[cleanName]?.signatureDataUrl ||
        meeting.checkins?.[cleanName]?.signatureDataUrl ||
        null
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
