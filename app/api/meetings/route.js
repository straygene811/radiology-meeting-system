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

    // 允許所有已登入之前台同仁執行「發起會議 / 儲存紀錄」、「結束會議送審」、「技術主任確認公布 / 退回修改」、「修改會議標題」與「設定問卷系統連結」
    const staffAllowedActions = [
      'save_meeting',
      'staff_create_meeting',
      'finish_meeting_record',
      'director_review_meeting',
      'quick_update_title',
      'update_survey_url'
    ];
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
        const existing = meetings[idx];
        const existingCheckins = existing.checkins || {};
        const checkedInNames = Object.keys(existingCheckins);
        const mergedPresent = Array.from(
          new Set([...(meeting.presentStaffNames || existing.presentStaffNames || []), ...checkedInNames])
        );
        const mergedLeave = (meeting.leaveStaffNames || existing.leaveStaffNames || []).filter(
          (n) => !mergedPresent.includes(n)
        );
        const nextStatus = meeting.status || existing.status || 'in_progress';
        const nextChain = { ...(existing.approvalChain || {}), ...(meeting.approvalChain || {}) };
        if (nextStatus === 'pending_review') {
          nextChain.recorderSubmittedBy = initiatedBy || meeting.recorder || existing.recorder || '記錄人';
          nextChain.recorderSubmittedAt = nowIso;
        }

        meetings[idx] = {
          ...existing,
          ...meeting,
          title: meeting.title.trim(),
          rocYear: computedRocYear,
          status: nextStatus,
          presentStaffNames: mergedPresent,
          leaveStaffNames: mergedLeave,
          checkins: meeting.checkins || existingCheckins,
          signatures: meeting.signatures || existing.signatures || {},
          approvalChain: nextChain,
          ...(nextStatus === 'pending_review' ? { endedAt: nowIso } : {}),
          isArchived: Boolean(meeting.isArchived),
          updatedAt: nowIso
        };
        savedMeeting = meetings[idx];
      } else {
        const newId = meeting.id || `MTG-${computedRocYear}-${Date.now().toString().slice(-4)}`;
        const creatorName = initiatedBy || meeting.recorder || '潘俊儒';
        const initialStatus = meeting.status || (action === 'staff_create_meeting' ? 'in_progress' : 'published');
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
          status: initialStatus,
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
            recorderSubmittedBy: initialStatus === 'published' ? meeting.recorder || creatorName : null,
            recorderSubmittedAt: initialStatus === 'published' ? nowIso : null,
            chairApprovedBy: initialStatus === 'published' ? meeting.chair || null : null,
            chairApprovedAt: initialStatus === 'published' ? nowIso : null,
            directorApprovedBy: initialStatus === 'published' ? '林宜蓁 技術主任' : null,
            directorApprovedAt: initialStatus === 'published' ? nowIso : null
          },
          checkins: meeting.checkins || {},
          signatures: meeting.signatures || {},
          rawTranscript: meeting.rawTranscript || '',
          returnReason: '',
          returnedBy: '',
          returnedAt: null,
          createdAt: nowIso
        };
        meetings.unshift(newMeeting);
        savedMeeting = newMeeting;
      }

      await db.write('meetings.json', meetings);
      const statusMsg =
        savedMeeting.status === 'in_progress'
          ? `✅ 已發起會議「${savedMeeting.title}」（現已開放同仁現場簽到，請點選進入執行會議紀錄）！`
          : savedMeeting.status === 'pending_review'
          ? `🏁 已結束會議並完成資料登錄！正待技術主任確認無誤後按「公布」。`
          : `✅ 會議紀錄「${savedMeeting.title}」已成功儲存！`;
      return NextResponse.json({
        success: true,
        meetings,
        savedMeeting,
        message: statusMsg
      });
    }

    // 記錄人完成會議後按「結束會議」：結束資料登錄，送交技術主任確認無誤後按公布
    if (action === 'finish_meeting_record') {
      const { id, recorderName, meeting: updatedFields } = body;
      const idx = meetings.findIndex((m) => m.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: '找不到該場會議' }, { status: 404 });
      }
      const nowIso = new Date().toISOString();
      const existing = meetings[idx];
      const existingCheckins = existing.checkins || {};
      const checkedInNames = Object.keys(existingCheckins);
      const basePresent = updatedFields?.presentStaffNames || existing.presentStaffNames || [];
      const mergedPresent = Array.from(new Set([...basePresent, ...checkedInNames]));
      const baseLeave = updatedFields?.leaveStaffNames || existing.leaveStaffNames || [];
      const mergedLeave = baseLeave.filter((n) => !mergedPresent.includes(n));

      const chain = {
        ...(existing.approvalChain || {}),
        recorderSubmittedBy: recorderName || existing.recorder || '會議記錄人',
        recorderSubmittedAt: nowIso
      };

      meetings[idx] = {
        ...existing,
        ...(updatedFields ? { ...updatedFields, id: existing.id } : {}),
        presentStaffNames: mergedPresent,
        leaveStaffNames: mergedLeave,
        checkins: existingCheckins,
        signatures: existing.signatures || {},
        status: 'pending_review',
        endedAt: nowIso,
        approvalChain: chain,
        updatedAt: nowIso
      };

      await db.write('meetings.json', meetings);
      return NextResponse.json({
        success: true,
        meetings,
        updatedMeeting: meetings[idx],
        message: `🏁 已結束會議並完成資料登錄！本場會議紀錄已送交「技術主任」確認，待技術主任按「公布」後即開放全科查閱。`
      });
    }

    // 技術主任確認審核：確認無誤按「公布」(decision='publish') OR 退回記錄人修改資料 (decision='return'，完整保留已維護資料內容退回上一步)
    if (action === 'director_review_meeting') {
      const { id, decision, reviewerName, reason = '' } = body;
      const idx = meetings.findIndex((m) => m.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: '找不到該場會議' }, { status: 404 });
      }
      const nowIso = new Date().toISOString();
      const m = meetings[idx];
      const cleanReviewer = (reviewerName || '林宜蓁').trim();
      const chain = { ...(m.approvalChain || {}) };
      const sigs = { ...(m.signatures || {}) };

      if (decision === 'publish') {
        chain.chairApprovedBy = cleanReviewer;
        chain.chairApprovedAt = nowIso;
        chain.directorApprovedBy = cleanReviewer;
        chain.directorApprovedAt = nowIso;

        const cleanPersonName = cleanReviewer.split(' ')[0];
        sigs[cleanPersonName] = {
          staffId: 'TECH_DIRECTOR',
          name: cleanPersonName,
          method: '技術主任確認公布',
          signedAt: nowIso,
          comment: (reason || '技術主任確認無誤，正式公布開放全科查閱').trim(),
          signatureDataUrl: sigs[cleanPersonName]?.signatureDataUrl || m.checkins?.[cleanPersonName]?.signatureDataUrl || null
        };

        meetings[idx] = {
          ...m,
          status: 'published',
          publishedAt: nowIso,
          publishedBy: cleanReviewer,
          approvalChain: chain,
          signatures: sigs,
          returnReason: '',
          updatedAt: nowIso
        };

        await db.write('meetings.json', meetings);
        return NextResponse.json({
          success: true,
          meetings,
          updatedMeeting: meetings[idx],
          message: `✅ 技術主任（${cleanReviewer}）已確認無誤並正式「公布」！現已開放全科其他人員查閱與簽閱。`
        });
      }

      if (decision === 'return') {
        chain.returnedBy = cleanReviewer;
        chain.returnedAt = nowIso;
        chain.returnReason = (reason || '請記錄人補充或修正會議紀錄資料後，再次送出確認').trim();

        // 完整保留所有已維護之資料內容（agendaItems, discussionSections, resolutions, actionItems, attachments, rawTranscript, presentStaffNames, checkins 等）退回上一步
        meetings[idx] = {
          ...m,
          status: 'returned',
          returnedBy: cleanReviewer,
          returnedAt: nowIso,
          returnReason: chain.returnReason,
          approvalChain: chain,
          updatedAt: nowIso
        };

        await db.write('meetings.json', meetings);
        return NextResponse.json({
          success: true,
          meetings,
          updatedMeeting: meetings[idx],
          message: `↩️ 已退回記錄人（${m.recorder || '原記錄人'}）修改資料！（已完整保留所有已維護之資料內容退回上一步）`
        });
      }

      return NextResponse.json({ error: '未知的審核決定' }, { status: 400 });
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
