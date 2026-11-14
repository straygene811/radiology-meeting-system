import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAdmin } from '@/lib/auth';

export async function GET() {
  try {
    const [meetings, staff, settings, adminRole, loginRecords] = await Promise.all([
      db.read('meetings.json'),
      db.read('staff.json'),
      db.read('settings.json'),
      verifyAdmin(),
      db.read('login_records.json')
    ]);

    return NextResponse.json({
      meetings: meetings || [],
      staff: staff || [],
      settings: settings || {},
      adminRole: adminRole || null,
      loginRecords: loginRecords || {}
    });
  } catch (error) {
    return NextResponse.json({ error: '載入會議紀錄失敗' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    const role = await verifyAdmin();

    // 允許所有已登入之前台同仁執行「發起會議紀錄 (save_meeting / staff_create_meeting)」、「修改會議標題 (quick_update_title)」與「設定問卷系統連結 (update_survey_url)」
    const staffAllowedActions = ['save_meeting', 'staff_create_meeting', 'quick_update_title', 'update_survey_url'];
    if (!role && !staffAllowedActions.includes(action)) {
      return NextResponse.json({ error: '未授權的存取，請先登入管理後台' }, { status: 401 });
    }

    if (action === 'update_survey_url') {
      const { surveySystemUrl, surveySystemTitle } = body;
      const currentSettings = (await db.read('settings.json')) || {};
      const nextSettings = {
        ...currentSettings,
        surveySystemUrl: (surveySystemUrl || '').trim(),
        surveySystemTitle: (surveySystemTitle || '問卷調查與教學回饋系統').trim()
      };
      await db.write('settings.json', nextSettings);
      return NextResponse.json({
        success: true,
        settings: nextSettings,
        message: '✅ 問卷系統連結已成功儲存並綁定！'
      });
    }

    let meetings = (await db.read('meetings.json')) || [];

    if (action === 'save_meeting' || action === 'staff_create_meeting') {
      const { meeting, initiatedBy } = body;
      if (!meeting?.title?.trim()) {
        return NextResponse.json({ error: '會議標題不能為空' }, { status: 400 });
      }

      const nowIso = new Date().toISOString();
      const idx = meetings.findIndex((m) => m.id === meeting.id);
      const parsedYear = parseInt((meeting.date || '2026').slice(0, 4), 10) || 2026;
      const computedRocYear = meeting.rocYear || String(parsedYear > 1911 ? parsedYear - 1911 : parsedYear);
      let savedMeeting = null;

      if (idx >= 0) {
        meetings[idx] = {
          ...meetings[idx],
          ...meeting,
          title: meeting.title.trim(),
          rocYear: computedRocYear,
          isArchived: Boolean(meeting.isArchived),
          updatedAt: nowIso
        };
        savedMeeting = meetings[idx];
      } else {
        const newId = meeting.id || `MTG-${computedRocYear}-${Date.now().toString().slice(-4)}`;
        const creatorName = initiatedBy || meeting.recorder || '潘俊儒';
        const newMeeting = {
          id: newId,
          title: meeting.title.trim(),
          category: meeting.category || 'dept',
          date: meeting.date || new Date().toISOString().slice(0, 10),
          time: meeting.time || '12:30',
          rocYear: computedRocYear,
          displayDate: meeting.displayDate || `${meeting.date || ''} ${meeting.time || ''}`.trim(),
          location: meeting.location || '影像醫學科 會議室',
          chair: meeting.chair || '林宜蓁',
          recorder: meeting.recorder || creatorName,
          initiatedBy: creatorName,
          status: meeting.status || 'published',
          isArchived: Boolean(meeting.isArchived),
          reopenedForStaff: meeting.reopenedForStaff || [],
          targetGroups: Array.isArray(meeting.targetGroups) && meeting.targetGroups.length > 0 ? meeting.targetGroups : ['全科人員'],
          expectedCount: Number(meeting.expectedCount) || (meeting.presentStaffNames?.length || 18),
          presentStaffNames: meeting.presentStaffNames || [],
          leaveStaffNames: meeting.leaveStaffNames || [],
          agendaItems: meeting.agendaItems || [],
          discussionSections: meeting.discussionSections || [],
          resolutions: meeting.resolutions || [],
          actionItems: meeting.actionItems || [],
          attachments: meeting.attachments || [],
          surveyUrl: (meeting.surveyUrl || '').trim(),
          surveyTitle: (meeting.surveyTitle || '').trim(),
          approvalChain: meeting.approvalChain || {
            recorderSubmittedBy: meeting.recorder || creatorName,
            recorderSubmittedAt: nowIso,
            chairApprovedBy: meeting.chair || null,
            chairApprovedAt: nowIso,
            directorApprovedBy: '許志賢 科主任',
            directorApprovedAt: nowIso
          },
          signatures: meeting.signatures || {},
          rawTranscript: meeting.rawTranscript || '',
          createdAt: nowIso
        };
        meetings.unshift(newMeeting);
        savedMeeting = newMeeting;
      }

      await db.write('meetings.json', meetings);
      return NextResponse.json({
        success: true,
        meetings,
        savedMeeting,
        message: `✅ 會議紀錄「${savedMeeting.title}」已成功儲存並發起！`
      });
    }

    if (action === 'delete_meeting') {
      const { id } = body;
      meetings = meetings.filter((m) => m.id !== id);
      await db.write('meetings.json', meetings);
      return NextResponse.json({ success: true, meetings });
    }

    if (action === 'quick_update_title') {
      const { id, title, category } = body;
      if (!title || !title.trim()) {
        return NextResponse.json({ error: '會議標題不能為空' }, { status: 400 });
      }
      const idx = meetings.findIndex((m) => m.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: '找不到該場會議' }, { status: 404 });
      }
      meetings[idx] = {
        ...meetings[idx],
        title: title.trim(),
        ...(category ? { category } : {}),
        updatedAt: new Date().toISOString()
      };
      await db.write('meetings.json', meetings);
      return NextResponse.json({
        success: true,
        meetings,
        updatedMeeting: meetings[idx],
        message: `✅ 已成功更新會議標題為：「${title.trim()}」`
      });
    }

    // 結案歸檔至歷史專區 OR 重新開放未簽者補簽
    if (action === 'toggle_archive') {
      const { id, isArchived } = body;
      const idx = meetings.findIndex((m) => m.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: '找不到該場會議' }, { status: 404 });
      }
      const m = meetings[idx];
      meetings[idx] = {
        ...m,
        isArchived: Boolean(isArchived),
        status: !isArchived ? 'published' : m.status,
        reopenedForStaff: isArchived ? [] : (m.reopenedForStaff || []),
        updatedAt: new Date().toISOString()
      };
      await db.write('meetings.json', meetings);
      return NextResponse.json({
        success: true,
        meetings,
        updatedMeeting: meetings[idx],
        message: isArchived
          ? '📦 會議已結案歸檔至「歷史紀錄專區」（首頁不再顯示）'
          : '🔓 已重新開放未簽同仁補簽（保留已簽者紀錄，未簽同仁登入首頁即可看到並補簽）'
      });
    }

    // 個別同仁退回重簽（清除該同仁原簽名，並讓該會議重新顯示於該同仁首頁待簽區）
    if (action === 'reopen_sign_single') {
      const { id, staffName, reason = '' } = body;
      const idx = meetings.findIndex((m) => m.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: '找不到該場會議' }, { status: 404 });
      }
      const m = meetings[idx];
      const nextSigs = { ...(m.signatures || {}) };
      delete nextSigs[staffName];

      const reopenedSet = new Set(m.reopenedForStaff || []);
      reopenedSet.add(staffName);

      meetings[idx] = {
        ...m,
        signatures: nextSigs,
        reopenedForStaff: Array.from(reopenedSet),
        reopenReasonMap: {
          ...(m.reopenReasonMap || {}),
          [staffName]: reason || '管理員重新開啟簽核，請再次詳閱並簽認'
        },
        updatedAt: new Date().toISOString()
      };

      await db.write('meetings.json', meetings);
      return NextResponse.json({
        success: true,
        meetings,
        updatedMeeting: meetings[idx],
        message: `↩️ 已將「${staffName}」退回重簽！該場會議將重新顯示在 ${staffName} 的首頁待簽閱專區。`
      });
    }

    if (action === 'advance_approval') {
      const { id, nextStatus, approverName, comment, signatureDataUrl } = body;
      const idx = meetings.findIndex((m) => m.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: '找不到該場會議' }, { status: 404 });
      }

      const nowIso = new Date().toISOString();
      const m = meetings[idx];
      const chain = { ...(m.approvalChain || {}) };
      const sigs = { ...(m.signatures || {}) };

      if (nextStatus === 'pending_chair') {
        chain.recorderSubmittedBy = approverName || m.recorder || '紀錄人';
        chain.recorderSubmittedAt = nowIso;
      } else if (nextStatus === 'pending_director') {
        chain.chairApprovedBy = approverName || m.chair || '會議主席';
        chain.chairApprovedAt = nowIso;
        const cleanChair = (approverName || m.chair || '會議主席').split(' ')[0];
        sigs[cleanChair] = {
          staffId: 'CHAIR',
          name: cleanChair,
          method: '會議主席覆核簽章',
          signedAt: nowIso,
          comment: comment || '主席覆核通過，呈請主任核准',
          signatureDataUrl: signatureDataUrl || sigs[cleanChair]?.signatureDataUrl || null
        };
      } else if (nextStatus === 'published') {
        if (!chain.chairApprovedAt) {
          chain.chairApprovedBy = m.chair || '會議主席';
          chain.chairApprovedAt = nowIso;
        }
        chain.directorApprovedBy = approverName || '許志賢 科主任';
        chain.directorApprovedAt = nowIso;
        const cleanDirector = (approverName || '許志賢').split(' ')[0];
        sigs[cleanDirector] = {
          staffId: 'DIRECTOR',
          name: cleanDirector,
          method: '科主任核准發布',
          signedAt: nowIso,
          comment: comment || '准予核備並發布全科簽閱',
          signatureDataUrl: signatureDataUrl || sigs[cleanDirector]?.signatureDataUrl || null
        };
      }

      meetings[idx] = {
        ...m,
        status: nextStatus,
        approvalChain: chain,
        signatures: sigs,
        updatedAt: nowIso
      };

      await db.write('meetings.json', meetings);
      return NextResponse.json({ success: true, meetings, updatedMeeting: meetings[idx] });
    }

    if (action === 'update_action_item') {
      const { meetingId, actionItemId, status } = body;
      const idx = meetings.findIndex((m) => m.id === meetingId);
      if (idx < 0) {
        return NextResponse.json({ error: '找不到會議紀錄' }, { status: 404 });
      }
      meetings[idx].actionItems = (meetings[idx].actionItems || []).map((item) =>
        item.id === actionItemId ? { ...item, status } : item
      );
      await db.write('meetings.json', meetings);
      return NextResponse.json({ success: true, meetings });
    }

    return NextResponse.json({ error: '未知的操作' }, { status: 400 });
  } catch (error) {
    console.error('Meetings POST Error:', error);
    return NextResponse.json({ error: '儲存會議紀錄失敗' }, { status: 500 });
  }
}
