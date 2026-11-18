'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  FileText,
  Mic,
  Users,
  Search,
  PenTool,
  Check,
  QrCode,
  Download,
  Printer,
  LogOut,
  ShieldCheck,
  UserCheck,
  AlertCircle,
  ListChecks,
  RotateCcw,
  Archive,
  BookOpen,
  BellRing,
  Calendar,
  Filter,
  Plus,
  Edit3,
  Save,
  Trash2,
  MicOff,
  Sparkles,
  Upload
} from 'lucide-react';
import { generateMeetingDocxBlob } from '@/lib/exportDocx';

// 關鍵字高亮元件：用於歷史紀錄專區搜尋會議內容時醒目提示
function HighlightText({ text, keyword }) {
  const str = String(text || '');
  const kw = (keyword || '').trim();
  if (!kw) return <>{str}</>;

  try {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = str.split(new RegExp(`(${escaped})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === kw.toLowerCase() ? (
            <mark
              key={i}
              style={{
                background: '#fef08a',
                color: '#854d0e',
                padding: '0 3px',
                borderRadius: '4px',
                fontWeight: 700
              }}
            >
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  } catch {
    return <>{str}</>;
  }
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [settings, setSettings] = useState({});

  // Login state
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('ALL');
  const [loginInput, setLoginInput] = useState('');
  const [selectedDropdownStaff, setSelectedDropdownStaff] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Check-in QR parameter
  const [checkinMeetingId, setCheckinMeetingId] = useState(null);

  // 雙專區切換：'home' (首頁・待我簽閱專區) vs 'history' (歷史紀錄專區)
  const [activeZone, setActiveZone] = useState('home'); // 'home' | 'history'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMeetingId, setActiveMeetingId] = useState(null);

  // Signature pad state
  const [showSigPad, setShowSigPad] = useState(false);
  const [signComment, setSignComment] = useState('');
  const [signingLoading, setSigningLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);

  // Lightbox image preview
  const [previewImage, setPreviewImage] = useState(null);

  // 同仁前台發起會議紀錄 / 編輯會議紀錄 State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [staffDraftMeeting, setStaffDraftMeeting] = useState(null);
  const [customAttendeeInput, setCustomAttendeeInput] = useState('');
  const [savingStaffMeeting, setSavingStaffMeeting] = useState(false);
  const [voiceQuickText, setVoiceQuickText] = useState('');
  const [voiceInterimText, setVoiceInterimText] = useState('');
  const [voiceBeforePolish, setVoiceBeforePolish] = useState('');
  const [voiceCorrections, setVoiceCorrections] = useState([]);
  const [polishingVoice, setPolishingVoice] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [aiStructuringLoading, setAiStructuringLoading] = useState(false);
  const speechRecRef = useRef(null);
  const latestVoiceTextRef = useRef('');

  // 【G】列表欄位排序狀態
  const [listSortBy, setListSortBy] = useState('date'); // 'date' | 'category' | 'title' | 'unsigned'
  const [listSortDir, setListSortDir] = useState('desc'); // 'asc' | 'desc'

  // 【問卷系統連結整合】狀態
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [activeSurveyTarget, setActiveSurveyTarget] = useState({ url: '', title: '', meetingId: '' });
  const [surveyConfigInput, setSurveyConfigInput] = useState('');
  const [surveyTitleInput, setSurveyTitleInput] = useState('');
  const [savingSurveyUrl, setSavingSurveyUrl] = useState(false);
  const [showSurveyUrlEditor, setShowSurveyUrlEditor] = useState(false);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4200);
  };

  const getRocYear = (m) => {
    if (m.rocYear) return String(m.rocYear);
    const y = parseInt((m.date || '2026').slice(0, 4), 10) || 2026;
    return String(y > 1911 ? y - 1911 : y);
  };

  // 判斷某場會議對該名同仁而言，是否屬於「首頁（待簽閱）」或「歷史紀錄專區」
  const isMeetingPendingForUser = (m, user) => {
    if (!user) return false;
    const isSignedByMe = Boolean(m.signatures?.[user.name]);
    if (isSignedByMe) return false; // 已簽核過的就不會顯示在首頁！
    const isReopenedForMe = (m.reopenedForStaff || []).includes(user.name);
    if (isReopenedForMe) return true; // 管理員退回重簽，強制顯示於首頁
    if (m.isArchived) return false; // 已結案歸檔至歷史專區
    return m.status === 'published';
  };

  const isMeetingInHistoryForUser = (m, user) => {
    if (!user) return true;
    const isSignedByMe = Boolean(m.signatures?.[user.name]);
    if (isSignedByMe) return true; // 已簽核過自動進入歷史紀錄專區
    if (m.isArchived && !(m.reopenedForStaff || []).includes(user.name)) return true; // 管理員結案歸檔之歷史會議
    return false;
  };

  const fetchAllData = async () => {
    try {
      const res = await fetch('/api/meetings');
      const data = await res.json();
      const loadedMeetings = data.meetings || [];
      const loadedStaff = data.staff || [];
      setMeetings(loadedMeetings);
      setStaffList(loadedStaff);
      setSettings(data.settings || {});

      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const checkinId = params.get('checkin');
        const mtgId = params.get('meeting');
        const zoneParam = params.get('zone');
        if (zoneParam === 'history') setActiveZone('history');
        if (checkinId) {
          setCheckinMeetingId(checkinId);
          setActiveMeetingId(checkinId);
        } else if (mtgId) {
          setActiveMeetingId(mtgId);
        }

        const savedUserStr = localStorage.getItem('rad_mtg_staff_user');
        if (savedUserStr) {
          try {
            const parsedUser = JSON.parse(savedUserStr);
            const refreshed = loadedStaff.find((s) => s.name === parsedUser.name || s.id === parsedUser.id);
            if (refreshed) {
              setCurrentUser(refreshed);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // 當切換「首頁」或「歷史紀錄專區」時，預設回到乾淨的會議列表（點進去才顯示會議內容）
  useEffect(() => {
    if (!currentUser) return;
    if (checkinMeetingId) return;
    setActiveMeetingId(null);
    setShowSigPad(false);
  }, [activeZone]);

  // Initialize Canvas when signature pad opens
  useEffect(() => {
    if (showSigPad && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      isDrawingRef.current = false;
      setHasDrawnSignature(false);
    }
  }, [showSigPad, activeMeetingId]);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    const clientX =
      e.touches && e.touches.length > 0
        ? e.touches[0].clientX
        : e.changedTouches && e.changedTouches.length > 0
        ? e.changedTouches[0].clientX
        : e.clientX;
    const clientY =
      e.touches && e.touches.length > 0
        ? e.touches[0].clientY
        : e.changedTouches && e.changedTouches.length > 0
        ? e.changedTouches[0].clientY
        : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (e.cancelable) e.preventDefault();
    if (!canvasRef.current) return;
    if (e.pointerId !== undefined && e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const { x, y } = getCanvasCoords(e);
    isDrawingRef.current = true;
    lastPointRef.current = { x, y };
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    setHasDrawnSignature(true);
  };

  const draw = (e) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    if (e.cancelable) e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPointRef.current = { x, y };
  };

  const stopDrawing = (e) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (e && e.pointerId !== undefined && e.currentTarget?.releasePointerCapture) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const clearSignatureCanvas = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    isDrawingRef.current = false;
    setHasDrawnSignature(false);
  };

  // 筆電 / 桌機輔助：一鍵在畫布上產生擬真手寫體簽名章（亦可再以滑鼠加筆）
  const applyLaptopSignatureStamp = () => {
    if (!canvasRef.current || !currentUser) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 繪製擬真深藍黑墨水手寫楷體簽名
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 - 6);
    ctx.rotate(-0.03);
    ctx.font = 'italic 700 56px "DFKai-SB", "BiauKai", "KaiTi", "STKaiti", "Microsoft JhengHei", serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentUser.name, 0, 0);

    // 底部簽名筆觸橫線與日期小字
    ctx.beginPath();
    ctx.moveTo(-110, 34);
    ctx.quadraticCurveTo(0, 26, 115, 32);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.font = '600 13px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(`${new Date().toLocaleDateString('zh-TW')} 電子簽認`, 0, 50);
    ctx.restore();

    setHasDrawnSignature(true);
  };

  const handleStaffLogin = async (e, overrideQuery = null) => {
    if (e) e.preventDefault();
    const query = (overrideQuery || loginInput || selectedDropdownStaff || '').trim();
    if (!query) {
      setLoginError('請選擇您的姓名，或輸入您的員工代號/姓名');
      return;
    }

    setLoggingIn(true);
    setLoginError('');

    try {
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeOrName: query })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoginError(data.error || '登入失敗');
        return;
      }

      setCurrentUser(data.member);
      if (rememberMe && typeof window !== 'undefined') {
        localStorage.setItem('rad_mtg_staff_user', JSON.stringify(data.member));
      }

      if (checkinMeetingId) {
        await handleSignMeeting(checkinMeetingId, 'checkin', null, '現場QR掃碼簽到', data.member);
      } else {
        showToast(`👋 歡迎登入，${data.member.name}（${data.member.title}）`);
      }
    } catch (err) {
      setLoginError('網路連線異常，請稍後再試');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogoutStaff = () => {
    setCurrentUser(null);
    setLoginInput('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rad_mtg_staff_user');
    }
  };

  const handleSignMeeting = async (meetingId, mode = 'sign', sigDataUrl = null, customComment = null, userOverride = null) => {
    const user = userOverride || currentUser;
    if (!user) return;

    setSigningLoading(true);
    try {
      const res = await fetch('/api/meetings/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          staffId: user.id,
          staffName: user.name,
          mode,
          comment: customComment !== null ? customComment : signComment,
          signatureDataUrl: sigDataUrl
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const updatedMeetings = data.meetings || [];
        setMeetings(updatedMeetings);
        setShowSigPad(false);
        setSignComment('');
        // 【A】簽核完成後「自動返回首頁列表」
        setActiveZone('home');
        setActiveMeetingId(null);
        setCheckinMeetingId(null);
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        showToast(
          mode === 'checkin'
            ? `✅ ${user.name} 已完成【${data.meeting.title}】現場出席簽到，已自動返回首頁列表！`
            : `✅ 簽核成功！已自動返回首頁待簽列表（本筆紀錄已移入「📚 歷史紀錄專區」）`
        );
      } else {
        alert(data.error || '簽核失敗');
      }
    } catch (err) {
      alert('網路錯誤，請稍後再試');
    } finally {
      setSigningLoading(false);
    }
  };

  const handleUpdateMyTaskStatus = async (meetingId, actionItemId, nextStatus) => {
    try {
      const res = await fetch('/api/meetings/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          mode: 'update_task',
          actionItemId,
          taskStatus: nextStatus
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        showToast(`📌 待辦事項狀態已更新為「${nextStatus}」`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportWord = async (meeting) => {
    try {
      showToast(`📄 正在產生「${meeting.title}」公版 Word 檔案...`);
      const catObj = (settings.meetingCategories || []).find((c) => c.id === meeting.category);
      const blob = await generateMeetingDocxBlob(meeting, settings, catObj?.name || meeting.category);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${meeting.title}.docx`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('✅ 公版 Word (.docx) 下載完成！');
    } catch (err) {
      console.error(err);
      alert('匯出 Word 時發生錯誤');
    }
  };

  // ==================== 同仁前台直接「發起會議紀錄 / 編輯會議紀錄」功能 ====================
  const openStaffMeetingCreator = (existingMeeting = null) => {
    const allActiveNames = staffList.filter((s) => s.status !== '離職').map((s) => s.name);
    const activeNames = staffList.filter((s) => s.status === '在職').map((s) => s.name);
    const defaultLeaveNames = allActiveNames.filter((n) => !activeNames.includes(n));
    const todayStr = new Date().toISOString().slice(0, 10);
    const rocYr = String(new Date().getFullYear() - 1911);
    const defaultCat = categoryFilter !== 'ALL' ? categoryFilter : 'dept';
    setCustomAttendeeInput('');

    if (existingMeeting) {
      const copy = JSON.parse(JSON.stringify(existingMeeting));
      const curPresent = copy.presentStaffNames || [];
      const rawLeave = Array.isArray(copy.leaveStaffNames) ? copy.leaveStaffNames : [];
      copy.leaveStaffNames = Array.from(
        new Set([...rawLeave, ...allActiveNames.filter((n) => !curPresent.includes(n))].filter((n) => !curPresent.includes(n)))
      );
      setStaffDraftMeeting(copy);
      setVoiceQuickText(existingMeeting.rawTranscript || '');
    } else {
      setStaffDraftMeeting({
        id: '',
        title: `${rocYr} 年新樓醫院影像醫學科 會議紀錄`,
        category: defaultCat,
        date: todayStr,
        time: '12:30',
        rocYear: rocYr,
        displayDate: `${rocYr} 年 ${new Date().getMonth() + 1} 月 ${new Date().getDate()} 日 12:30`,
        location: '影像醫學科 會議室',
        chair: currentUser?.name || '林宜蓁',
        recorder: currentUser?.name || '潘俊儒',
        status: 'published',
        isArchived: false,
        targetGroups: ['全科人員'],
        expectedCount: allActiveNames.length || activeNames.length || 20,
        presentStaffNames: activeNames,
        leaveStaffNames: defaultLeaveNames,
        agendaItems: ['1. 主席報告事項', '2. 本次會議討論事項'],
        discussionSections: [
          { heading: '1. 主席報告與宣導事項', bullets: [''] },
          { heading: '2. 討論事項與執行細節', bullets: [''] }
        ],
        resolutions: ['通過本次會議討論事項，請相關同仁配合辦理。'],
        actionItems: [],
        attachments: [],
        rawTranscript: '',
        surveyUrl: '',
        surveyTitle: ''
      });
      setVoiceQuickText('');
    }
    setShowCreateModal(true);
  };

  // 【D】發起新會議時「📋 一鍵帶入上一場同類別會議範本（或任選過往會議作為範本）」
  const applyMeetingTemplateToDraft = (templateMeeting) => {
    if (!templateMeeting || !staffDraftMeeting) return;
    const todayStr = staffDraftMeeting.date || new Date().toISOString().slice(0, 10);
    const y = parseInt((todayStr || '2026').slice(0, 4), 10) || 2026;
    const roc = String(y > 1911 ? y - 1911 : y);
    setStaffDraftMeeting((prev) => ({
      ...prev,
      category: templateMeeting.category || prev.category,
      location: templateMeeting.location || prev.location,
      chair: templateMeeting.chair || prev.chair,
      targetGroups: templateMeeting.targetGroups?.length ? [...templateMeeting.targetGroups] : prev.targetGroups,
      presentStaffNames: templateMeeting.presentStaffNames?.length ? [...templateMeeting.presentStaffNames] : prev.presentStaffNames,
      leaveStaffNames: templateMeeting.leaveStaffNames?.length ? [...templateMeeting.leaveStaffNames] : prev.leaveStaffNames,
      expectedCount: templateMeeting.expectedCount || prev.expectedCount,
      agendaItems: templateMeeting.agendaItems?.length ? [...templateMeeting.agendaItems] : prev.agendaItems,
      discussionSections: templateMeeting.discussionSections?.length
        ? templateMeeting.discussionSections.map((s) => ({
            heading: s.heading,
            bullets: (s.bullets || []).length ? [...s.bullets] : ['']
          }))
        : prev.discussionSections,
      resolutions: templateMeeting.resolutions?.length ? [...templateMeeting.resolutions] : prev.resolutions,
      surveyUrl: templateMeeting.surveyUrl || prev.surveyUrl || '',
      surveyTitle: templateMeeting.surveyTitle || prev.surveyTitle || '',
      rocYear: roc
    }));
    showToast(`📋 已套用「${templateMeeting.title}」之議程、討論架構與名單範本！`);
  };

  // 【E】判斷附件是否為圖片（非圖片則為 PDF / Word / Excel / PPTX / CSV 等文件）
  const isImageAttachment = (att) => {
    if (!att) return false;
    const mime = String(att.mimeType || '').toLowerCase();
    const url = String(att.url || '').toLowerCase();
    const name = String(att.fileName || att.title || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    if (url.startsWith('data:image/')) return true;
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return true;
    if (!mime && !/\.(pdf|docx?|xlsx?|pptx?|csv|zip|txt)$/i.test(url) && !/\.(pdf|docx?|xlsx?|pptx?|csv|zip|txt)$/i.test(name)) {
      return true;
    }
    return false;
  };

  const getFileTypeBadge = (att) => {
    const name = String(att?.fileName || att?.title || att?.url || '').toLowerCase();
    const mime = String(att?.mimeType || '').toLowerCase();
    if (name.endsWith('.pdf') || mime.includes('pdf')) return { label: '📕 PDF 文件', bg: '#fee2e2', color: '#b91c1c' };
    if (/\.(docx?)$/i.test(name) || mime.includes('word')) return { label: '📘 Word 文件', bg: '#dbeafe', color: '#1d4ed8' };
    if (/\.(xlsx?|csv)$/i.test(name) || mime.includes('sheet') || mime.includes('excel') || mime.includes('csv'))
      return { label: '📗 Excel 報表', bg: '#d1fae5', color: '#047857' };
    if (/\.(pptx?)$/i.test(name) || mime.includes('presentation') || mime.includes('powerpoint'))
      return { label: '📙 PPT 簡報', bg: '#ffedd5', color: '#c2410c' };
    return { label: '📎 附件檔案', bg: '#f1f5f9', color: '#334155' };
  };

  // 【問卷系統連結整合】組合帶入目前登入人員與會議參數的問卷網址
  const buildSurveyUrlWithParams = (rawUrl, meeting = null) => {
    const clean = (rawUrl || '').trim();
    if (!clean) return '';
    try {
      const u = new URL(clean, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      if (currentUser?.name && !u.searchParams.has('staffName')) u.searchParams.set('staffName', currentUser.name);
      if (currentUser?.code && !u.searchParams.has('staffCode')) u.searchParams.set('staffCode', currentUser.code);
      if (currentUser?.title && !u.searchParams.has('staffTitle')) u.searchParams.set('staffTitle', currentUser.title);
      if (meeting?.id && !u.searchParams.has('meetingId')) u.searchParams.set('meetingId', meeting.id);
      if (meeting?.title && !u.searchParams.has('meetingTitle')) u.searchParams.set('meetingTitle', meeting.title);
      return u.toString();
    } catch {
      return clean;
    }
  };

  const openSurveyCenter = (meeting = null) => {
    const targetUrl = (meeting?.surveyUrl || settings.surveySystemUrl || '').trim();
    const targetTitle = meeting?.surveyTitle || (meeting ? `${meeting.title} — 會議問卷` : settings.surveySystemTitle || '影像醫學科問卷調查系統');
    setSurveyConfigInput(settings.surveySystemUrl || '');
    setSurveyTitleInput(settings.surveySystemTitle || '影像醫學科問卷調查系統');
    setActiveSurveyTarget({
      url: targetUrl ? buildSurveyUrlWithParams(targetUrl, meeting) : '',
      rawUrl: targetUrl,
      title: targetTitle,
      meetingId: meeting?.id || ''
    });
    setShowSurveyUrlEditor(!targetUrl);
    setShowSurveyModal(true);
  };

  const handleSaveSurveySystemUrl = async (e) => {
    if (e) e.preventDefault();
    setSavingSurveyUrl(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_survey_url',
          surveySystemUrl: surveyConfigInput.trim(),
          surveySystemTitle: (surveyTitleInput || '').trim() || '影像醫學科問卷調查系統',
          meetingId: activeSurveyTarget.meetingId || undefined,
          meetingSurveyUrl: activeSurveyTarget.meetingId ? surveyConfigInput.trim() : undefined,
          meetingSurveyTitle: activeSurveyTarget.meetingId ? (surveyTitleInput || '').trim() : undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.settings) setSettings(data.settings);
        if (data.meetings) setMeetings(data.meetings);
        const finalUrl = surveyConfigInput.trim();
        setActiveSurveyTarget((prev) => ({
          ...prev,
          rawUrl: finalUrl,
          url: finalUrl ? buildSurveyUrlWithParams(finalUrl, activeMeeting) : '',
          title: (surveyTitleInput || '').trim() || prev.title
        }));
        setShowSurveyUrlEditor(false);
        showToast(data.message || '✅ 問卷系統連結已儲存！');
      }
    } catch (err) {
      alert('儲存問卷網址失敗');
    } finally {
      setSavingSurveyUrl(false);
    }
  };

  const handlePolishFrontendTranscript = async (textOverride = null, silentIfEmpty = false) => {
    const raw = (textOverride !== null ? textOverride : voiceQuickText || '').trim();
    if (!raw) {
      if (!silentIfEmpty) alert('請先進行語音辨識或輸入文字後再執行詞句修正！');
      return;
    }
    setPolishingVoice(true);
    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'polish_transcript',
          transcript: raw
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.correctedTranscript) {
        setVoiceBeforePolish(raw);
        setVoiceQuickText(data.correctedTranscript);
        latestVoiceTextRef.current = data.correctedTranscript;
        setVoiceCorrections(data.corrections || []);
        showToast(data.message || '✨ 已自動完成同音錯別字校正與詞句潤飾！');
      }
    } catch (err) {
      console.error('Polish transcript error:', err);
    } finally {
      setPolishingVoice(false);
    }
  };

  const toggleFrontendVoiceRecognition = () => {
    if (isVoiceListening) {
      if (speechRecRef.current) {
        try {
          speechRecRef.current.stop();
        } catch {}
      }
      setIsVoiceListening(false);
      setVoiceInterimText('');
      // 講完停止錄音時，自動觸發「智慧修正錯別字與潤飾詞句」
      if (latestVoiceTextRef.current?.trim()) {
        handlePolishFrontendTranscript(latestVoiceTextRef.current, true);
      }
      return;
    }

    if (typeof window === 'undefined') return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('您的瀏覽器不支援即時語音辨識，建議使用 Chrome 或 Edge 瀏覽器，或直接於下方文字框輸入內容。');
      return;
    }

    latestVoiceTextRef.current = voiceQuickText;
    const rec = new SpeechRec();
    rec.lang = 'zh-TW';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalChunk += t + '。';
        } else {
          interimChunk += t;
        }
      }
      setVoiceInterimText(interimChunk);
      if (finalChunk) {
        setVoiceQuickText((prev) => {
          const next = prev ? `${prev}\n${finalChunk}` : finalChunk;
          latestVoiceTextRef.current = next;
          return next;
        });
      }
    };
    rec.onerror = () => {
      setIsVoiceListening(false);
      setVoiceInterimText('');
    };
    rec.onend = () => {
      setIsVoiceListening(false);
      setVoiceInterimText('');
    };
    speechRecRef.current = rec;
    rec.start();
    setIsVoiceListening(true);
  };

  const handleRunFrontendAiStructuring = async () => {
    if (!voiceQuickText.trim()) {
      alert('請先點選「🎙️ 開始語音辨識」說話，或在文字框輸入幾句會議重點！');
      return;
    }
    if (!staffDraftMeeting) return;
    setAiStructuringLoading(true);
    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: voiceQuickText,
          category: staffDraftMeeting.category || 'dept',
          meetingTitle: staffDraftMeeting.title || ''
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.result) {
        const r = data.result;
        if (data.correctedTranscript) {
          setVoiceQuickText(data.correctedTranscript);
        }
        if (data.corrections?.length) {
          setVoiceCorrections(data.corrections);
        }
        setStaffDraftMeeting((prev) => ({
          ...prev,
          title: prev.title?.trim() ? prev.title : r.title || prev.title,
          agendaItems: r.agendaItems?.length ? r.agendaItems : prev.agendaItems,
          discussionSections: r.discussionSections?.length ? r.discussionSections : prev.discussionSections,
          resolutions: r.resolutions?.length ? r.resolutions : prev.resolutions,
          actionItems: r.actionItems?.length ? r.actionItems : prev.actionItems,
          rawTranscript: data.correctedTranscript || voiceQuickText
        }));
        showToast('✨ 已先自動校正同音錯別字，並轉換填入下方議程、討論與決議！');
      } else {
        alert(data.error || '轉換失敗');
      }
    } catch (err) {
      alert('轉換發生錯誤');
    } finally {
      setAiStructuringLoading(false);
    }
  };

  // 【E】支援上傳現場照片（自動壓縮）以及 PDF / Word / Excel / PPTX / CSV 等佐證文件檔案
  const handleStaffUploadPhoto = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !staffDraftMeeting) return;

    files.forEach((file) => {
      const isImg = (file.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (isImg) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxW = 1000;
            let w = img.width;
            let h = img.height;
            if (w > maxW) {
              h = Math.round((h * maxW) / w);
              w = maxW;
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const compressedUrl = canvas.toDataURL('image/jpeg', 0.8);
            setStaffDraftMeeting((prev) => ({
              ...prev,
              attachments: [
                ...(prev.attachments || []),
                {
                  id: `ATT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  title: file.name,
                  fileName: file.name,
                  mimeType: 'image/jpeg',
                  fileSize: file.size || 0,
                  url: compressedUrl,
                  caption: `${currentUser?.name || ''} 上傳之會議照片`
                }
              ]
            }));
          };
          img.src = ev.target.result;
        } else {
          // PDF / Word / Excel / PPTX / CSV 等佐證附件檔案
          setStaffDraftMeeting((prev) => ({
            ...prev,
            attachments: [
              ...(prev.attachments || []),
              {
                id: `ATT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: file.name,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                fileSize: file.size || 0,
                url: ev.target.result,
                caption: `${currentUser?.name || ''} 上傳之佐證檔案`
              }
            ]
          }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSaveStaffMeeting = async (e) => {
    if (e) e.preventDefault();
    if (!staffDraftMeeting?.title?.trim()) {
      alert('請輸入會議正式標題！');
      return;
    }

    setSavingStaffMeeting(true);
    try {
      const cleanedSections = (staffDraftMeeting.discussionSections || []).map((sec) => ({
        heading: sec.heading || '討論事項',
        bullets: (sec.bullets || []).filter((b) => String(b).trim() !== '')
      }));

      const payloadMeeting = {
        ...staffDraftMeeting,
        title: staffDraftMeeting.title.trim(),
        agendaItems: (staffDraftMeeting.agendaItems || []).filter((a) => String(a).trim() !== ''),
        discussionSections:
          cleanedSections.length > 0
            ? cleanedSections
            : [{ heading: '1. 會議討論事項', bullets: ['詳如會議決議事項。'] }],
        resolutions: (staffDraftMeeting.resolutions || []).filter((r) => String(r).trim() !== '')
      };

      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'staff_create_meeting',
          initiatedBy: currentUser?.name || payloadMeeting.recorder,
          meeting: payloadMeeting
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        if (data.savedMeeting) {
          setActiveMeetingId(data.savedMeeting.id);
          if (data.savedMeeting.isArchived) {
            setActiveZone('history');
          } else {
            setActiveZone('home');
          }
        }
        setShowCreateModal(false);
        setStaffDraftMeeting(null);
        showToast(data.message || '✅ 會議紀錄已成功發起！');
      } else {
        alert(data.error || '儲存會議紀錄失敗');
      }
    } catch (err) {
      alert('網路連線異常，請稍後再試');
    } finally {
      setSavingStaffMeeting(false);
    }
  };

  const activeStaffList = staffList.filter((s) => s.status !== '離職');
  const filteredLoginStaff =
    selectedGroupFilter === 'ALL'
      ? activeStaffList
      : activeStaffList.filter((s) => (s.groups || []).includes(selectedGroupFilter));

  const getCategoryBadge = (catId) => {
    const cat = (settings.meetingCategories || []).find((c) => c.id === catId);
    if (!cat) return { name: catId, shortName: catId, color: '#2563eb', badgeBg: '#dbeafe' };
    return cat;
  };

  const getStatusBadge = (m) => {
    if (m.isArchived) {
      return { label: '📦 已結案歸檔（歷史專區）', bg: '#e2e8f0', color: '#334155' };
    }
    switch (m.status) {
      case 'published':
        return { label: '✅ 開放簽閱中', bg: '#d1fae5', color: '#065f46' };
      case 'pending_director':
        return { label: '⏳ 待科主任最終核准', bg: '#fef3c7', color: '#92400e' };
      case 'pending_chair':
        return { label: '⏳ 待會議主席覆核', bg: '#e0e7ff', color: '#3730a3' };
      default:
        return { label: '📝 紀錄整理草稿', bg: '#f1f5f9', color: '#475569' };
    }
  };

  // 提取某場會議中含有關鍵字的摘要句子（供歷史專區搜尋結果顯示）
  const getSearchMatchSnippet = (m, kw) => {
    const q = (kw || '').trim().toLowerCase();
    if (!q) return null;
    const allTexts = [
      ...(m.agendaItems || []),
      ...(m.discussionSections || []).flatMap((s) => [s.heading, ...(s.bullets || [])]),
      ...(m.resolutions || []),
      ...(m.actionItems || []).map((a) => `${a.assignee}: ${a.task}`)
    ];
    const hit = allTexts.find((t) => String(t || '').toLowerCase().includes(q));
    return hit || null;
  };

  // 分流計算：首頁（待簽閱） vs 歷史紀錄專區（已簽核或已歸檔）
  const homePendingMeetings = currentUser
    ? meetings.filter((m) => isMeetingPendingForUser(m, currentUser))
    : [];

  const historyMeetingsAll = currentUser
    ? meetings.filter((m) => isMeetingInHistoryForUser(m, currentUser))
    : [];

  // 歷史紀錄專區可用的民國年度清單 (如 115, 114, 113)
  const availableRocYears = Array.from(new Set(historyMeetingsAll.map((m) => getRocYear(m)))).sort(
    (a, b) => Number(b) - Number(a)
  );

  // 計算單場會議的已簽核與未簽核人數
  const getMeetingSignCounts = (m) => {
    const signedMap = m.signatures || {};
    const signedCount = Object.keys(signedMap).length;
    const inServiceNames = staffList.filter((s) => s.status === '在職').map((s) => s.name);
    const targetPool =
      m.isArchived && (m.reopenedForStaff || []).length === 0
        ? Array.from(new Set([...(m.presentStaffNames || []), ...Object.keys(signedMap)]))
        : Array.from(new Set([...inServiceNames, ...(m.presentStaffNames || [])]));
    const unsignedCount = Math.max(0, targetPool.filter((n) => !signedMap[n]).length);
    return { signedCount, unsignedCount };
  };

  // 【G】切換列表欄位排序
  const toggleListSort = (col) => {
    if (listSortBy === col) {
      setListSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setListSortBy(col);
      setListSortDir(col === 'title' || col === 'category' ? 'asc' : 'desc');
    }
  };

  // 根據當前所在的專區 (`home` 或 `history`) 進行種類、年度與全文關鍵字過濾，並依點擊表頭排序
  const baseZoneMeetings = activeZone === 'home' ? homePendingMeetings : historyMeetingsAll;

  const visibleMeetings = baseZoneMeetings
    .filter((m) => {
      if (categoryFilter !== 'ALL' && m.category !== categoryFilter) {
        return false;
      }
      if (activeZone === 'history' && yearFilter !== 'ALL' && getRocYear(m) !== yearFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const inTitle = (m.title || '').toLowerCase().includes(q);
        const inChair = (m.chair || '').toLowerCase().includes(q);
        const inRecorder = (m.recorder || '').toLowerCase().includes(q);
        const inAgenda = JSON.stringify(m.agendaItems || []).toLowerCase().includes(q);
        const inDiscussion = JSON.stringify(m.discussionSections || []).toLowerCase().includes(q);
        const inResolutions = JSON.stringify(m.resolutions || []).toLowerCase().includes(q);
        const inActions = JSON.stringify(m.actionItems || []).toLowerCase().includes(q);
        const inPresent = JSON.stringify(m.presentStaffNames || []).toLowerCase().includes(q);
        return inTitle || inChair || inRecorder || inAgenda || inDiscussion || inResolutions || inActions || inPresent;
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      const dir = listSortDir === 'asc' ? 1 : -1;
      if (listSortBy === 'category') {
        const catA = getCategoryBadge(a.category).shortName || a.category || '';
        const catB = getCategoryBadge(b.category).shortName || b.category || '';
        return catA.localeCompare(catB, 'zh-Hant') * dir;
      }
      if (listSortBy === 'title') {
        return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant') * dir;
      }
      if (listSortBy === 'unsigned') {
        const cA = getMeetingSignCounts(a);
        const cB = getMeetingSignCounts(b);
        if (cA.unsignedCount !== cB.unsignedCount) {
          return (cA.unsignedCount - cB.unsignedCount) * dir;
        }
        return (cA.signedCount - cB.signedCount) * dir;
      }
      // default: date + time
      const dtA = `${a.date || ''} ${a.time || ''}`;
      const dtB = `${b.date || ''} ${b.time || ''}`;
      return dtA.localeCompare(dtB) * dir;
    });

  // 只有當使用者點選某場會議卡片時才顯示該場會議完整內容（首頁預設保持乾淨列表）
  const activeMeeting = activeMeetingId
    ? visibleMeetings.find((m) => m.id === activeMeetingId) || meetings.find((m) => m.id === activeMeetingId) || null
    : null;

  const mySignedCount = currentUser
    ? meetings.filter((m) => Boolean(m.signatures?.[currentUser.name])).length
    : 0;

  const myAssignedTasks = [];
  if (currentUser) {
    meetings.forEach((m) => {
      (m.actionItems || []).forEach((item) => {
        if ((item.assignee || '').includes(currentUser.name)) {
          myAssignedTasks.push({
            ...item,
            meetingId: m.id,
            meetingTitle: m.title
          });
        }
      });
    });
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '90vh' }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary-color)' }}>
            正在載入新樓醫院影像醫學科會議整合系統...
          </div>
        </div>
      </div>
    );
  }

  // ==================== 未登入時：手機快速登入首頁 ====================
  if (!currentUser) {
    const checkinTargetMtg = checkinMeetingId ? meetings.find((m) => m.id === checkinMeetingId) : null;

    return (
      <div
        className="animate-fade-in"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '94vh',
          padding: '1rem'
        }}
      >
        <div className="glass-panel" style={{ maxWidth: '540px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: '#dbeafe',
                color: '#1e40af',
                padding: '0.35rem 0.9rem',
                borderRadius: '999px',
                fontSize: '0.82rem',
                fontWeight: 700,
                marginBottom: '0.75rem'
              }}
            >
              🏥 {settings.hospitalName || '新樓基督教醫院'}・{settings.departmentName || '影像醫學科'}
            </div>
            <h1 style={{ fontSize: '1.65rem', color: '#0f172a', marginBottom: '0.4rem' }}>
              影像醫學科會議整合系統
            </h1>
            <p className="subtitle" style={{ margin: 0 }}>
              手機快速查閱待簽會議、手寫電子簽核與歷年會議紀錄檢索專區
            </p>
          </div>

          {checkinTargetMtg && (
            <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <QrCode size={18} /> 會議現場 QR Code 掃碼簽到模式
              </div>
              <div style={{ marginTop: '0.25rem', fontSize: '0.88rem' }}>
                目標會議：<strong>{checkinTargetMtg.title}</strong>
                <br />
                請於下方選擇您的姓名或輸入代號，即可一鍵完成現場出席簽到！
              </div>
            </div>
          )}

          <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
            <strong>💡 簡易登入說明：</strong>
            <br />
            請直接從下方<strong>點選您的姓名</strong>，或輸入您的<strong>員工編號 / 姓名</strong>（例如：<code>3137</code>、<code>4813</code>、<code>7260</code>、<code>潘俊儒</code>、<code>林宜蓁</code>）即可直接進入。
          </div>

          <form onSubmit={(e) => handleStaffLogin(e)}>
            <div className="form-group">
              <label>依組別篩選人員名單（手機快速點選）</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.65rem' }}>
                {['ALL', ...(settings.availableGroups || ['主管/行政', '一般科會', '教學/臨床教師', '品保會議', '跨領域會議'])].map(
                  (grp) => (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setSelectedGroupFilter(grp)}
                      style={{
                        padding: '0.3rem 0.65rem',
                        borderRadius: '999px',
                        border: selectedGroupFilter === grp ? '1px solid #2563eb' : '1px solid #cbd5e1',
                        background: selectedGroupFilter === grp ? '#2563eb' : '#ffffff',
                        color: selectedGroupFilter === grp ? '#ffffff' : '#475569',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {grp === 'ALL' ? '全部同仁' : grp}
                    </button>
                  )
                )}
              </div>

              <select
                value={selectedDropdownStaff}
                onChange={(e) => {
                  setSelectedDropdownStaff(e.target.value);
                  setLoginInput(e.target.value);
                }}
              >
                <option value="">-- 請點選您的姓名 ({filteredLoginStaff.length} 人) --</option>
                {filteredLoginStaff.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name} — {s.title} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="codeOrName">或直接輸入您的員工編號 / 姓名</label>
              <input
                id="codeOrName"
                type="text"
                placeholder="例如：3137、4813、7260、潘俊儒、林宜蓁..."
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '1.1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.45rem', fontWeight: 600 }}>
                ⚡ 點擊姓名一鍵快速登入：
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '115px', overflowY: 'auto', padding: '0.2rem' }}>
                {filteredLoginStaff.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleStaffLogin(null, s.name)}
                    style={{
                      padding: '0.35rem 0.7rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#1e293b',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="rememberMe" style={{ margin: 0, fontWeight: 500, fontSize: '0.88rem', cursor: 'pointer' }}>
                在此手機/裝置記住我的身分（下次開啟自動登入）
              </label>
            </div>

            {loginError && <div className="alert alert-error">{loginError}</div>}

            <button type="submit" className="btn" style={{ width: '100%', padding: '0.85rem', fontSize: '1.02rem' }} disabled={loggingIn}>
              {loggingIn
                ? '驗證登入中...'
                : checkinTargetMtg
                ? '📲 立即登入並完成現場簽到'
                : '🚀 進入會議紀錄與簽核系統'}
            </button>
          </form>

          <div
            style={{
              marginTop: '1.6rem',
              paddingTop: '1.1rem',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}
          >
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              目前共有 <strong>{meetings.length}</strong> 場歷年與近期會議紀錄
            </span>
            <Link
              href="/admin/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#2563eb',
                textDecoration: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '8px',
                background: '#eff6ff'
              }}
            >
              <ShieldCheck size={16} /> 後台管理 / 歷史專區維護登入
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ==================== 已登入：首頁（待簽閱專區）& 📚 歷史紀錄專區 ====================
  const isCurrentMeetingSigned = Boolean(activeMeeting?.signatures?.[currentUser.name]);
  const mySignatureRecord = activeMeeting?.signatures?.[currentUser.name] || null;
  const isReopenedForMe = Boolean(activeMeeting && (activeMeeting.reopenedForStaff || []).includes(currentUser.name));
  const reopenReason = activeMeeting?.reopenReasonMap?.[currentUser.name] || '';

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '1rem' }}>
      {toastMsg && (
        <div
          className="no-print animate-fade-in"
          style={{
            position: 'fixed',
            bottom: '1.25rem',
            right: '1.25rem',
            zIndex: 9999,
            background: '#0f172a',
            color: '#ffffff',
            padding: '0.85rem 1.25rem',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            fontWeight: 600,
            fontSize: '0.92rem'
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* 頂部導覽與個人身分列 */}
      <div
        className="glass-panel no-print"
        style={{
          padding: '1rem 1.35rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge" style={{ background: '#dbeafe', color: '#1e40af', fontSize: '0.78rem' }}>
              🏥 {settings.hospitalName || '新樓基督教醫院'} {settings.departmentName || '影像醫學科'}
            </span>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>行動會議紀錄與歷史檢索平台</h2>
          </div>
          <div style={{ fontSize: '0.86rem', color: '#475569', marginTop: '0.3rem' }}>
            目前登入：<strong>{currentUser.name}</strong>（{currentUser.title}・代號 <code>{currentUser.code}</code>）
            {' ｜ '}組別：{(currentUser.groups || []).join('、')}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => openStaffMeetingCreator()}
            className="btn btn-success"
            style={{ padding: '0.52rem 1rem', fontSize: '0.9rem' }}
          >
            <Plus size={17} /> ➕ 發起會議紀錄
          </button>
          <button
            type="button"
            onClick={() => openSurveyCenter(activeMeeting)}
            className="btn"
            style={{
              padding: '0.5rem 0.95rem',
              fontSize: '0.86rem',
              background: '#0d9488',
              color: '#ffffff'
            }}
            title="前往您自製的問卷調查系統（支援自動帶入登入姓名、代號與本場會議資訊）"
          >
            📝 問卷系統
          </button>
          <Link href="/admin/login" className="btn btn-purple" style={{ padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}>
            <ShieldCheck size={16} /> 後台管理 / 歷史專區維護
          </Link>
          <button
            type="button"
            onClick={handleLogoutStaff}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
          >
            <LogOut size={16} /> 切換人員
          </button>
        </div>
      </div>

      {/* ==================== 核心雙專區大切換鈕：首頁（待簽閱） vs 📚 歷史紀錄專區 ==================== */}
      <div
        className="no-print"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1rem'
        }}
      >
        {/* 專區一：首頁（待我簽閱專區）— 簽過即不顯示於此 */}
        <div
          onClick={() => {
            setActiveZone('home');
            setCategoryFilter('ALL');
            setActiveMeetingId(null);
          }}
          className="card"
          style={{
            cursor: 'pointer',
            border: activeZone === 'home' ? '3px solid #2563eb' : '1px solid #cbd5e1',
            background: activeZone === 'home' ? '#eff6ff' : '#ffffff',
            padding: '1.1rem 1.25rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span
                  className="badge"
                  style={{
                    background: homePendingMeetings.length > 0 ? '#dc2626' : '#059669',
                    color: '#ffffff'
                  }}
                >
                  {activeZone === 'home' ? '📍 目前所在專區' : '點此切換'}
                </span>
                <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 700 }}>已簽核項目自動移出首頁</span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: '0.4rem' }}>
                ✍️ 首頁・待我簽閱專區（{homePendingMeetings.length} 筆）
              </div>
              <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.25rem' }}>
                {homePendingMeetings.length > 0
                  ? `您尚有 ${homePendingMeetings.length} 場會議待簽閱，點選卡片即可進入閱讀與簽核`
                  : '🎉 目前所有會議皆已簽閱完成！首頁無待辦簽核'}
              </div>
            </div>
            <BellRing size={34} color={homePendingMeetings.length > 0 ? '#dc2626' : '#059669'} />
          </div>
        </div>

        {/* 專區二：📚 歷史紀錄專區（依會議種類分類 + 內容全文搜尋） */}
        <div
          onClick={() => {
            setActiveZone('history');
            setCategoryFilter('ALL');
            setActiveMeetingId(null);
          }}
          className="card"
          style={{
            cursor: 'pointer',
            border: activeZone === 'history' ? '3px solid #7c3aed' : '1px solid #cbd5e1',
            background: activeZone === 'history' ? '#faf5ff' : '#ffffff',
            padding: '1.1rem 1.25rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span
                  className="badge"
                  style={{
                    background: activeZone === 'history' ? '#7c3aed' : '#ede9fe',
                    color: activeZone === 'history' ? '#ffffff' : '#5b21b6'
                  }}
                >
                  {activeZone === 'history' ? '📍 目前所在專區' : '點此進入'}
                </span>
                <span style={{ fontSize: '0.82rem', color: '#5b21b6', fontWeight: 700 }}>
                  已簽閱 {mySignedCount} 筆 ／ 歷年歸檔
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#3b0764', marginTop: '0.4rem' }}>
                📚 歷史紀錄專區（共 {historyMeetingsAll.length} 筆）
              </div>
              <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.25rem' }}>
                支援依「會議種類」、「年度(113~115年)」與「會議內容關鍵字」搜尋所有已簽核與歷年紀錄
              </div>
            </div>
            <BookOpen size={34} color="#7c3aed" />
          </div>
        </div>
      </div>

      {/* 若有指派給該同仁的待辦事項，於首頁顯示快速回報面板 */}
      {activeZone === 'home' && myAssignedTasks.filter((t) => t.status !== '已完成').length > 0 && (
        <div className="card no-print" style={{ marginBottom: '1rem', background: '#faf5ff', borderColor: '#e9d5ff' }}>
          <div style={{ fontWeight: 700, color: '#5b21b6', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ListChecks size={18} /> 📌 指派給您（{currentUser.name}）進行中的會議待辦事項：
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {myAssignedTasks
              .filter((t) => t.status !== '已完成')
              .map((task) => (
                <div
                  key={task.id}
                  style={{
                    background: '#ffffff',
                    padding: '0.65rem 0.9rem',
                    borderRadius: '10px',
                    border: '1px solid #e9d5ff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{task.task}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      來源：{task.meetingTitle} ｜ 預計完成日：{task.dueDate || '未定'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {['未開始', '進行中', '已完成'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleUpdateMyTaskStatus(task.meetingId, task.id, st)}
                        style={{
                          padding: '0.3rem 0.65rem',
                          borderRadius: '999px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: task.status === st ? 'none' : '1px solid #cbd5e1',
                          background:
                            task.status === st
                              ? st === '已完成'
                                ? '#059669'
                                : st === '進行中'
                                ? '#2563eb'
                                : '#475569'
                              : '#f8fafc',
                          color: task.status === st ? '#ffffff' : '#475569'
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ==================== 會議紀錄種類分類列 + 年度篩選 + 會議內容全文搜尋框 ==================== */}
      <div
        className="card no-print"
        style={{
          marginBottom: '1rem',
          padding: '1.1rem',
          background: activeZone === 'history' ? '#faf5ff' : '#ffffff',
          borderColor: activeZone === 'history' ? '#d8b4fe' : '#e2e8f0'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: activeZone === 'history' ? '#5b21b6' : '#1e3a8a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            {activeZone === 'history' ? (
              <>
                <BookOpen size={20} /> 📚 歷史紀錄專區 — 依會議種類分類與全文內容檢索
              </>
            ) : (
              <>
                <BellRing size={20} /> ✍️ 首頁・待我簽閱會議清單（完成簽核後自動移入歷史紀錄專區）
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {activeZone === 'history' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#5b21b6' }}>📅 民國年度：</span>
                <button
                  type="button"
                  onClick={() => setYearFilter('ALL')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    borderRadius: '999px',
                    border: yearFilter === 'ALL' ? 'none' : '1px solid #cbd5e1',
                    background: yearFilter === 'ALL' ? '#5b21b6' : '#ffffff',
                    color: yearFilter === 'ALL' ? '#ffffff' : '#334155',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  全部年度
                </button>
                {availableRocYears.map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setYearFilter(yr)}
                    style={{
                      padding: '0.3rem 0.7rem',
                      borderRadius: '999px',
                      border: yearFilter === yr ? 'none' : '1px solid #cbd5e1',
                      background: yearFilter === yr ? '#5b21b6' : '#ffffff',
                      color: yearFilter === yr ? '#ffffff' : '#334155',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {yr} 年度
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => openStaffMeetingCreator()}
              className="btn btn-success"
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.84rem' }}
            >
              <Plus size={15} /> ➕ 發起會議紀錄
            </button>
          </div>
        </div>

        {/* 1. 會議紀錄種類分類頁籤（含各種類筆數統計） */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.85rem' }}>
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '999px',
              border: categoryFilter === 'ALL' ? 'none' : '1px solid #cbd5e1',
              background: categoryFilter === 'ALL' ? '#0f172a' : '#ffffff',
              color: categoryFilter === 'ALL' ? '#ffffff' : '#334155',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            全部會議種類 ({baseZoneMeetings.length})
          </button>

          {(settings.meetingCategories || []).map((cat) => {
            const countInCat = baseZoneMeetings.filter((m) => m.category === cat.id).length;
            const isSelected = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '999px',
                  border: isSelected ? 'none' : '1px solid #cbd5e1',
                  background: isSelected ? cat.color : '#ffffff',
                  color: isSelected ? '#ffffff' : '#334155',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <span>{cat.shortName || cat.name}</span>
                <span
                  style={{
                    background: isSelected ? 'rgba(255,255,255,0.25)' : cat.badgeBg,
                    color: isSelected ? '#ffffff' : cat.color,
                    padding: '0.08rem 0.45rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem'
                  }}
                >
                  {countInCat}
                </span>
              </button>
            );
          })}
        </div>

        {/* 2. 會議紀錄內容全文搜尋框 */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
            <input
              type="text"
              placeholder="🔍 搜尋會議紀錄內容（可輸入標題、討論內文關鍵字如 EPA、ACR假體、換管球、GE高階CT、吳思霈、實習生...）"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                paddingLeft: '1rem',
                fontSize: '0.92rem',
                border: searchQuery.trim() ? '2px solid #7c3aed' : '1px solid #cbd5e1'
              }}
            />
          </div>
          {searchQuery.trim() && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="btn btn-secondary"
              style={{ padding: '0.6rem 0.95rem', fontSize: '0.85rem' }}
            >
              清除搜尋
            </button>
          )}
        </div>
      </div>

      {/* ==================== 乾淨的「會議清單模式」 vs 點進去才顯示的「會議紀錄內容模式」 ==================== */}
      {!activeMeeting ? (
        activeZone === 'home' && homePendingMeetings.length === 0 ? (
          <div className="glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <CheckCircle2 size={54} color="#059669" style={{ marginBottom: '0.75rem' }} />
            <h2 style={{ fontSize: '1.45rem', color: '#065f46', marginBottom: '0.5rem' }}>
              🎉 太棒了！{currentUser.name}，您目前已無任何待簽閱的會議紀錄！
            </h2>
            <p className="subtitle" style={{ maxWidth: '560px', margin: '0 auto 1.4rem auto' }}>
              所有您已簽認過的會議紀錄以及歷年歸檔會議（共 <strong>{historyMeetingsAll.length}</strong> 筆），皆已自動收納於「<strong>📚 歷史紀錄專區</strong>」，不會佔用您的首頁版面。
            </p>
            <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => openStaffMeetingCreator()}
                className="btn btn-success"
                style={{ padding: '0.85rem 1.6rem', fontSize: '1.02rem' }}
              >
                <Plus size={19} /> ➕ 發起新會議紀錄（含語音轉紀錄）
              </button>
              <button
                type="button"
                onClick={() => setActiveZone('history')}
                className="btn btn-purple"
                style={{ padding: '0.85rem 1.6rem', fontSize: '1.02rem' }}
              >
                <BookOpen size={19} /> 📚 立即前往「歷史紀錄專區」查閱與搜尋會議紀錄
              </button>
            </div>
          </div>
        ) : (
          /* 首頁／歷史專區以極簡列表呈現（僅顯示：分類、標題、時間），點選整列即可開啟完整會議紀錄 */
          <div className="no-print animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', padding: '0 0.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#334155' }}>
                {activeZone === 'home'
                  ? `✍️ 待您簽閱的會議清單（共 ${visibleMeetings.length} 筆，點選列即可開啟）：`
                  : `📚 歷史紀錄專區列表（共 ${visibleMeetings.length} 筆，點選列即可開啟會議紀錄）：`}
              </div>
            </div>

            {visibleMeetings.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: '2.5rem' }}>
                沒有符合「{searchQuery || '目前分類'}」的會議紀錄
              </div>
            ) : (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
                }}
              >
                {/* 【G】列表表頭（支援點擊依「會議分類」、「標題」、「已簽核/未簽核」、「開會時間」正序/倒序排序） */}
                <div
                  className="meeting-list-grid meeting-list-header-mobile-hide"
                  style={{
                    padding: '0.75rem 1.2rem',
                    background: '#f8fafc',
                    borderBottom: '1px solid #cbd5e1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#475569',
                    userSelect: 'none'
                  }}
                >
                  <div
                    onClick={() => toggleListSort('category')}
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                    title="點擊依會議分類排序"
                  >
                    會議分類
                    <span style={{ color: listSortBy === 'category' ? '#2563eb' : '#94a3b8', fontSize: '0.78rem' }}>
                      {listSortBy === 'category' ? (listSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </div>
                  <div
                    onClick={() => toggleListSort('title')}
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                    title="點擊依會議標題排序"
                  >
                    會議紀錄標題
                    <span style={{ color: listSortBy === 'title' ? '#2563eb' : '#94a3b8', fontSize: '0.78rem' }}>
                      {listSortBy === 'title' ? (listSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </div>
                  <div
                    onClick={() => toggleListSort('unsigned')}
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="點擊依未簽核人數排序"
                  >
                    <span style={{ color: '#059669' }}>已簽核</span> / <span style={{ color: '#dc2626' }}>未簽核</span>
                    <span style={{ color: listSortBy === 'unsigned' ? '#2563eb' : '#94a3b8', fontSize: '0.78rem', marginLeft: '0.25rem' }}>
                      {listSortBy === 'unsigned' ? (listSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </div>
                  <div
                    onClick={() => toggleListSort('date')}
                    style={{ textAlign: 'right', cursor: 'pointer' }}
                    title="點擊依開會時間新舊排序"
                  >
                    開會時間
                    <span style={{ color: listSortBy === 'date' ? '#2563eb' : '#94a3b8', fontSize: '0.78rem', marginLeft: '0.25rem' }}>
                      {listSortBy === 'date' ? (listSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </div>
                </div>

                {/* 列表每一列（分類、標題、已簽核/未簽核顏色與數字、時間） */}
                {visibleMeetings.map((m, idx) => {
                  const cat = getCategoryBadge(m.category);
                  const snippet = searchQuery.trim() ? getSearchMatchSnippet(m, searchQuery) : null;
                  const signedMap = m.signatures || {};
                  const isSignedByMe = Boolean(currentUser && signedMap[currentUser.name]);
                  const signedCount = Object.keys(signedMap).length;
                  const inServiceNames = staffList.filter((s) => s.status === '在職').map((s) => s.name);
                  const targetPool =
                    m.isArchived && (m.reopenedForStaff || []).length === 0
                      ? Array.from(new Set([...(m.presentStaffNames || []), ...Object.keys(signedMap)]))
                      : Array.from(new Set([...inServiceNames, ...(m.presentStaffNames || [])]));
                  const unsignedCount = Math.max(0, targetPool.filter((n) => !signedMap[n]).length);

                  return (
                    <div
                      key={m.id}
                      className="meeting-list-grid"
                      onClick={() => {
                        setActiveMeetingId(m.id);
                        setShowSigPad(false);
                        if (typeof window !== 'undefined') {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }}
                      style={{
                        padding: '0.9rem 1.2rem',
                        borderBottom: idx === visibleMeetings.length - 1 ? 'none' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        background: '#ffffff',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#ffffff';
                      }}
                    >
                      {/* 1. 分類 */}
                      <div>
                        <span
                          className="badge"
                          style={{
                            background: cat.badgeBg,
                            color: cat.color,
                            fontSize: '0.8rem',
                            padding: '0.28rem 0.7rem'
                          }}
                        >
                          {cat.shortName || cat.name}
                        </span>
                      </div>

                      {/* 2. 標題（若有搜尋關鍵字則附帶一行命中預覽） */}
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '1rem',
                            color: '#0f172a',
                            lineHeight: 1.4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            flexWrap: 'wrap'
                          }}
                        >
                          <span
                            style={{
                              width: '9px',
                              height: '9px',
                              borderRadius: '50%',
                              background: isSignedByMe ? '#10b981' : '#ef4444',
                              display: 'inline-block',
                              flexShrink: 0
                            }}
                            title={isSignedByMe ? '您已簽核' : '您尚未簽核'}
                          />
                          <HighlightText text={m.title} keyword={searchQuery} />
                        </div>
                        {snippet && (
                          <div
                            style={{
                              marginTop: '0.3rem',
                              fontSize: '0.78rem',
                              color: '#854d0e',
                              background: '#fefce8',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              display: 'inline-block'
                            }}
                          >
                            🔍 <HighlightText text={snippet} keyword={searchQuery} />
                          </div>
                        )}
                      </div>

                      {/* 3. 已簽核 / 未簽核（僅顯示數字與顏色） */}
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem' }}>
                        <span
                          style={{
                            background: '#d1fae5',
                            color: '#059669',
                            fontWeight: 800,
                            fontSize: '0.88rem',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            minWidth: '34px',
                            textAlign: 'center'
                          }}
                          title={`已簽核 ${signedCount} 人`}
                        >
                          {signedCount}
                        </span>
                        <span style={{ color: '#cbd5e1', fontWeight: 700 }}>/</span>
                        <span
                          style={{
                            background: unsignedCount > 0 ? '#fee2e2' : '#f1f5f9',
                            color: unsignedCount > 0 ? '#dc2626' : '#94a3b8',
                            fontWeight: 800,
                            fontSize: '0.88rem',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            minWidth: '34px',
                            textAlign: 'center'
                          }}
                          title={`未簽核 ${unsignedCount} 人`}
                        >
                          {unsignedCount}
                        </span>
                      </div>

                      {/* 4. 時間 */}
                      <div
                        style={{
                          textAlign: 'right',
                          fontSize: '0.88rem',
                          color: '#475569',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {m.date} {m.time}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      ) : (
        /* ==================== 點進去後才顯示：單篇會議紀錄完整檢視與簽核專區 ==================== */
        <div className="glass-panel animate-fade-in" style={{ minWidth: '0' }}>
          {/* 頂部返回列表按鈕列 */}
          <div className="no-print" style={{ marginBottom: '0.9rem' }}>
            <button
              type="button"
              onClick={() => {
                setActiveMeetingId(null);
                setShowSigPad(false);
              }}
              className="btn btn-secondary"
              style={{
                padding: '0.5rem 1.05rem',
                fontSize: '0.9rem',
                fontWeight: 700,
                background: '#eff6ff',
                color: '#1e40af',
                borderColor: '#93c5fd'
              }}
            >
              ⬅️ 返回{activeZone === 'home' ? '「首頁・待簽閱清單」' : '「📚 歷史紀錄專區清單」'}
            </button>
          </div>

          {/* 若為管理員退回重簽，顯示醒目提醒 */}
          {isReopenedForMe && (
            <div className="alert alert-warning no-print" style={{ marginBottom: '1rem' }}>
              <strong>↩️ 重啟簽核通知：</strong> {reopenReason || '管理員已重新開啟您對本場會議紀錄的簽核，請再次詳閱內容後完成簽認。'}
            </div>
          )}

          {/* 頂部操作列 */}
          <div
            className="no-print"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.6rem',
              paddingBottom: '1rem',
              marginBottom: '1.1rem',
              borderBottom: '1px solid #e2e8f0'
            }}
          >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span
                    className="badge"
                    style={{
                      background: getCategoryBadge(activeMeeting.category).badgeBg,
                      color: getCategoryBadge(activeMeeting.category).color
                    }}
                  >
                    {getCategoryBadge(activeMeeting.category).name}
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: getStatusBadge(activeMeeting).bg,
                      color: getStatusBadge(activeMeeting).color
                    }}
                  >
                    {getStatusBadge(activeMeeting).label}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {!isCurrentMeetingSigned && (
                    <button
                      type="button"
                      onClick={() => handleSignMeeting(activeMeeting.id, 'sign', null, '已詳閱並確認會議紀錄')}
                      className="btn btn-success"
                      disabled={signingLoading}
                      style={{ padding: '0.5rem 0.95rem', fontSize: '0.86rem' }}
                    >
                      <Check size={16} /> ⚡ 一鍵簽認已閱（簽完移入歷史專區）
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSigPad(!showSigPad)}
                    className="btn"
                    style={{ padding: '0.5rem 0.95rem', fontSize: '0.86rem' }}
                  >
                    <PenTool size={16} /> {isCurrentMeetingSigned ? '更新手寫簽名/意見' : '✍️ 手寫電子簽名'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openSurveyCenter(activeMeeting)}
                    className="btn"
                    style={{
                      padding: '0.5rem 0.95rem',
                      fontSize: '0.86rem',
                      background: '#0d9488',
                      color: '#ffffff'
                    }}
                  >
                    📝 {activeMeeting.surveyUrl ? activeMeeting.surveyTitle || '填寫本場會議問卷' : '前往問卷系統'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openStaffMeetingCreator(activeMeeting)}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 0.9rem', fontSize: '0.86rem', color: '#1e40af', borderColor: '#93c5fd', background: '#eff6ff' }}
                  >
                    <Edit3 size={16} /> 編輯此會議 / 改標題
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportWord(activeMeeting)}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 0.9rem', fontSize: '0.86rem' }}
                  >
                    <Download size={16} /> 匯出公版 Word
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 0.9rem', fontSize: '0.86rem' }}
                  >
                    <Printer size={16} /> 列印 / 存成 PDF
                  </button>
                </div>
              </div>

              {/* 醫院正式公版抬頭 */}
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569', letterSpacing: '0.08em' }}>
                  {settings.hospitalName || '新樓基督教醫院'}　{settings.departmentName || '影像醫學科'}
                </div>
                <h1 style={{ fontSize: '1.5rem', color: '#0f172a', margin: '0.35rem 0 0 0' }}>
                  <HighlightText text={activeMeeting.title} keyword={searchQuery} />
                </h1>
              </div>

              {/* 會議基本資料公版表格 */}
              <div
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  marginBottom: '1.4rem',
                  background: '#ffffff'
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    borderBottom: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b', fontSize: '0.84rem', fontWeight: 600 }}>📅 開會時間：</span>
                    <strong style={{ fontSize: '0.92rem' }}>
                      {activeMeeting.displayDate || `${activeMeeting.date} ${activeMeeting.time}`}
                    </strong>
                  </div>
                  <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b', fontSize: '0.84rem', fontWeight: 600 }}>📍 開會地點：</span>
                    <strong style={{ fontSize: '0.92rem' }}>{activeMeeting.location}</strong>
                  </div>
                  <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b', fontSize: '0.84rem', fontWeight: 600 }}>👤 會議主席：</span>
                    <strong style={{ fontSize: '0.92rem' }}>
                      <HighlightText text={activeMeeting.chair} keyword={searchQuery} />
                    </strong>
                  </div>
                  <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b', fontSize: '0.84rem', fontWeight: 600 }}>📝 會議記錄：</span>
                    <strong style={{ fontSize: '0.92rem' }}>
                      <HighlightText text={activeMeeting.recorder} keyword={searchQuery} />
                    </strong>
                  </div>
                </div>

                <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.88rem' }}>
                  <strong>📊 出席統計：</strong>
                  應到 <strong>{activeMeeting.expectedCount || (activeMeeting.presentStaffNames || []).length}</strong> 人 ／
                  實到 <strong>{(activeMeeting.presentStaffNames || []).length}</strong> 人 ／
                  出席率{' '}
                  <strong>
                    {Math.round(
                      (((activeMeeting.presentStaffNames || []).length || 1) /
                        (activeMeeting.expectedCount || (activeMeeting.presentStaffNames || []).length || 1)) *
                        100
                    )}
                    %
                  </strong>
                  {' ｜ '}
                  <span style={{ color: '#059669', fontWeight: 700 }}>
                    線上已簽閱：{Object.keys(activeMeeting.signatures || {}).length} 人
                  </span>
                </div>

                <div style={{ padding: '0.75rem 1rem', fontSize: '0.86rem', lineHeight: 1.6 }}>
                  <div>
                    <strong style={{ color: '#334155' }}>👥 出席人員（{(activeMeeting.presentStaffNames || []).length} 人）：</strong>
                    <HighlightText text={(activeMeeting.presentStaffNames || []).join('、') || '—'} keyword={searchQuery} />
                  </div>
                  {(activeMeeting.leaveStaffNames || []).length > 0 && (
                    <div style={{ marginTop: '0.3rem', color: '#b45309' }}>
                      <strong>🌙 值班 / 休假人員（未出席，{activeMeeting.leaveStaffNames.length} 人）：</strong>
                      <HighlightText text={activeMeeting.leaveStaffNames.join('、')} keyword={searchQuery} />
                    </div>
                  )}
                </div>
              </div>

              {/* 議程主題 */}
              {activeMeeting.agendaItems && activeMeeting.agendaItems.length > 0 && (
                <div style={{ marginBottom: '1.35rem' }}>
                  <h3 style={{ fontSize: '1.08rem', color: '#1e3a8a', borderBottom: '2px solid #dbeafe', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
                    壹、會議議程與討論主題
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingLeft: '0.25rem' }}>
                    {activeMeeting.agendaItems.map((item, i) => (
                      <div key={i} style={{ fontSize: '0.94rem', fontWeight: 600, color: '#1e293b' }}>
                        <HighlightText text={item} keyword={searchQuery} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 會議討論內容 */}
              <div style={{ marginBottom: '1.4rem' }}>
                <h3 style={{ fontSize: '1.08rem', color: '#1e3a8a', borderBottom: '2px solid #dbeafe', paddingBottom: '0.4rem', marginBottom: '0.85rem' }}>
                  貳、會議討論內容與紀錄
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {(activeMeeting.discussionSections || []).map((sec, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '1rem 1.15rem'
                      }}
                    >
                      <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '1rem', color: '#0f172a' }}>
                        <HighlightText text={sec.heading} keyword={searchQuery} />
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.7, color: '#334155', fontSize: '0.93rem' }}>
                        {(sec.bullets || []).map((b, bIdx) => (
                          <li key={bIdx} style={{ marginBottom: '0.35rem' }}>
                            <HighlightText text={b} keyword={searchQuery} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* 會議決議事項 */}
              {activeMeeting.resolutions && activeMeeting.resolutions.length > 0 && (
                <div style={{ marginBottom: '1.4rem' }}>
                  <h3 style={{ fontSize: '1.08rem', color: '#065f46', borderBottom: '2px solid #d1fae5', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
                    參、會議重要決議事項
                  </h3>
                  <div
                    style={{
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      borderRadius: '12px',
                      padding: '1rem 1.25rem'
                    }}
                  >
                    <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.7, color: '#064e3b', fontWeight: 600, fontSize: '0.94rem' }}>
                      {activeMeeting.resolutions.map((res, idx) => (
                        <li key={idx} style={{ marginBottom: '0.35rem' }}>
                          <HighlightText text={res} keyword={searchQuery} />
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {/* 待辦追蹤事項 (Action Items) */}
              {activeMeeting.actionItems && activeMeeting.actionItems.length > 0 && (
                <div style={{ marginBottom: '1.4rem' }}>
                  <h3 style={{ fontSize: '1.08rem', color: '#5b21b6', borderBottom: '2px solid #ede9fe', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
                    肆、待辦追蹤事項 (Action Items)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {activeMeeting.actionItems.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#0f172a' }}>
                            {idx + 1}. <HighlightText text={item.task} keyword={searchQuery} />
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                            負責人員：<strong><HighlightText text={item.assignee} keyword={searchQuery} /></strong> ｜ 預計完成日：{item.dueDate || '—'}
                          </div>
                        </div>
                        <span
                          className="badge"
                          style={{
                            background:
                              item.status === '已完成' ? '#d1fae5' : item.status === '進行中' ? '#dbeafe' : '#f1f5f9',
                            color:
                              item.status === '已完成' ? '#065f46' : item.status === '進行中' ? '#1e40af' : '#475569'
                          }}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 【E】相關照片與佐證附件檔案紀錄（支援圖片放大預覽 + PDF/Word/Excel/PPTX/CSV 檔案下載） */}
              {activeMeeting.attachments && activeMeeting.attachments.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.08rem', color: '#1e3a8a', borderBottom: '2px solid #dbeafe', paddingBottom: '0.4rem', marginBottom: '0.85rem' }}>
                    伍、相關照片與佐證附件檔案紀錄（共 {activeMeeting.attachments.length} 件）
                  </h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                      gap: '0.85rem'
                    }}
                  >
                    {activeMeeting.attachments.map((att, idx) => {
                      const isImg = isImageAttachment(att);
                      const fileBadge = getFileTypeBadge(att);
                      return (
                        <div
                          key={att.id || idx}
                          style={{
                            border: '1px solid #cbd5e1',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            background: '#ffffff',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}
                        >
                          {isImg ? (
                            <div
                              onClick={() => setPreviewImage(att)}
                              style={{
                                height: '160px',
                                overflow: 'hidden',
                                background: '#f8fafc',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                              }}
                              title="點擊放大預覽圖片"
                            >
                              <img
                                src={att.url}
                                alt={att.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>
                          ) : (
                            <div
                              style={{
                                height: '130px',
                                background: '#f8fafc',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0.75rem',
                                gap: '0.45rem'
                              }}
                            >
                              <span
                                className="badge"
                                style={{
                                  background: fileBadge.bg,
                                  color: fileBadge.color,
                                  fontSize: '0.84rem',
                                  padding: '0.35rem 0.75rem'
                                }}
                              >
                                {fileBadge.label}
                              </span>
                              <div style={{ fontSize: '0.78rem', color: '#64748b', textAlign: 'center', wordBreak: 'break-all' }}>
                                {att.fileName || att.title}
                              </div>
                            </div>
                          )}

                          <div style={{ padding: '0.6rem 0.75rem', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1e293b', wordBreak: 'break-word' }}>
                              {att.title}
                            </div>
                            <div className="no-print" style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                              {isImg && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(att)}
                                  className="btn btn-secondary"
                                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                                >
                                  🔍 放大檢視
                                </button>
                              )}
                              <a
                                href={att.url}
                                download={att.fileName || att.title || `附件_${idx + 1}`}
                                className="btn btn-secondary"
                                style={{
                                  padding: '0.25rem 0.65rem',
                                  fontSize: '0.75rem',
                                  textDecoration: 'none',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  borderColor: '#bfdbfe'
                                }}
                              >
                                ⬇️ 下載檔案
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ==================== 同仁手機簽到與手寫電子簽名專區 ==================== */}
              <div
                className="no-print"
                style={{
                  background: isCurrentMeetingSigned ? '#ecfdf5' : '#eff6ff',
                  border: isCurrentMeetingSigned ? '2px solid #10b981' : '2px solid #3b82f6',
                  borderRadius: '14px',
                  padding: '1.25rem',
                  marginBottom: '1.4rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: isCurrentMeetingSigned ? '#065f46' : '#1e3a8a' }}>
                      {isCurrentMeetingSigned
                        ? `✅ ${currentUser.name}，您已簽核過本場會議紀錄（已歸檔於歷史紀錄專區）`
                        : `✍️ ${currentUser.name}，請確認簽閱本場會議紀錄（簽完即自動移入歷史紀錄專區）`}
                    </h3>
                    {mySignatureRecord ? (
                      <div style={{ fontSize: '0.85rem', color: '#047857', marginTop: '0.3rem' }}>
                        簽核方式：<strong>{mySignatureRecord.method}</strong> ｜ 時間：
                        {new Date(mySignatureRecord.signedAt).toLocaleString('zh-TW')}
                        {mySignatureRecord.comment ? ` ｜ 備註：${mySignatureRecord.comment}` : ''}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.3rem' }}>
                        點擊「一鍵快速簽認（已閱）」或使用「手寫電子簽名板」完成簽核後，本紀錄即自動從首頁收進歷史紀錄專區。
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {!isCurrentMeetingSigned && (
                      <button
                        type="button"
                        onClick={() => handleSignMeeting(activeMeeting.id, 'sign', null, '已詳閱並確認會議紀錄')}
                        className="btn btn-success"
                        disabled={signingLoading}
                      >
                        <Check size={18} /> ⚡ 一鍵快速簽認（已閱）
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSigPad(!showSigPad)}
                      className="btn"
                      style={{ background: '#1e3a8a' }}
                    >
                      <PenTool size={17} /> {showSigPad ? '收起簽名板' : isCurrentMeetingSigned ? '重新手寫簽名 / 補充意見' : '開啟手寫電子簽名板'}
                    </button>
                  </div>
                </div>

                {mySignatureRecord?.signatureDataUrl && (
                  <div style={{ marginTop: '0.85rem', background: '#ffffff', padding: '0.6rem 1rem', borderRadius: '10px', display: 'inline-block', border: '1px solid #a7f3d0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>已存檔之手寫電子簽名：</div>
                    <img
                      src={mySignatureRecord.signatureDataUrl}
                      alt="手寫簽名"
                      style={{ height: '54px', objectFit: 'contain' }}
                    />
                  </div>
                )}
              </div>

              {/* 彈出式手寫電子簽名板視窗（筆電滑鼠 / 觸控板 / 手機觸控皆可立即簽名，不需往下捲動尋找） */}
              {showSigPad && (
                <div
                  className="no-print animate-fade-in"
                  onClick={() => setShowSigPad(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.72)',
                    zIndex: 9998,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: '#ffffff',
                      borderRadius: '18px',
                      width: '100%',
                      maxWidth: '600px',
                      padding: '1.35rem 1.5rem',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                      border: '2px solid #2563eb'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <PenTool size={20} /> ✍️ 手寫電子簽名板（{currentUser.name}）
                        </h3>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                          會議：{activeMeeting.title}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSigPad(false)}
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
                      >
                        ✕ 關閉
                      </button>
                    </div>

                    <div style={{ marginBottom: '0.85rem' }}>
                      <label style={{ fontSize: '0.85rem' }}>💬 簽閱意見或回饋（選填，預設為「已詳閱會議紀錄」）：</label>
                      <input
                        type="text"
                        placeholder="例如：已閱，配合辦理相關事項..."
                        value={signComment}
                        onChange={(e) => setSignComment(e.target.value)}
                      />
                    </div>

                    <div style={{ marginBottom: '0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.45rem' }}>
                        <label style={{ margin: 0, fontSize: '0.86rem', color: '#0f172a' }}>
                          👇 請於下方白色方框內<strong>按住滑鼠左鍵 / 觸控板拖曳</strong>或<strong>手指觸控</strong>簽名：
                        </label>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={applyLaptopSignatureStamp}
                            className="btn btn-purple"
                            style={{ padding: '0.32rem 0.75rem', fontSize: '0.78rem' }}
                            title="若筆電無外接滑鼠不方便手寫，可一鍵套用正式手寫體簽名章"
                          >
                            🖋️ 筆電一鍵帶入簽名章
                          </button>
                          <button
                            type="button"
                            onClick={clearSignatureCanvas}
                            className="btn btn-secondary"
                            style={{ padding: '0.32rem 0.75rem', fontSize: '0.78rem' }}
                          >
                            <RotateCcw size={13} /> 清除重簽
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          border: '2px dashed #2563eb',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          background: '#ffffff',
                          touchAction: 'none',
                          userSelect: 'none'
                        }}
                      >
                        <canvas
                          ref={canvasRef}
                          width={540}
                          height={180}
                          style={{
                            width: '100%',
                            height: '180px',
                            display: 'block',
                            cursor: 'crosshair',
                            touchAction: 'none'
                          }}
                          onPointerDown={startDrawing}
                          onPointerMove={draw}
                          onPointerUp={stopDrawing}
                          onPointerCancel={stopDrawing}
                          onPointerLeave={stopDrawing}
                        />
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '0.35rem' }}>
                        💡 筆電操作提示：按住<strong>滑鼠左鍵</strong>（或壓住筆電觸控板左下角）即可直接書寫；若使用觸控板不順手，也可點選右上角「<strong>🖋️ 筆電一鍵帶入簽名章</strong>」。
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setShowSigPad(false)}
                        className="btn btn-secondary"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={signingLoading}
                        onClick={() => {
                          let sigUrl = null;
                          if (hasDrawnSignature && canvasRef.current) {
                            sigUrl = canvasRef.current.toDataURL('image/png');
                          }
                          handleSignMeeting(activeMeeting.id, 'sign', sigUrl, signComment || '已詳閱會議紀錄');
                        }}
                        className="btn btn-success"
                        style={{ padding: '0.65rem 1.35rem', fontSize: '0.95rem' }}
                      >
                        <CheckCircle2 size={18} /> 儲存手寫簽名並移入歷史專區
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 已簽閱人員名單一覽 */}
              <div>
                <h3 style={{ fontSize: '1.05rem', color: '#1e3a8a', borderBottom: '2px solid #dbeafe', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
                  陸、全科同仁線上簽到與簽閱紀錄（已簽核 {Object.keys(activeMeeting.signatures || {}).length} 人）
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '0.6rem'
                  }}
                >
                  {Object.values(activeMeeting.signatures || {}).map((sig, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.84rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{sig.name}</strong>
                        <span className="badge" style={{ background: '#d1fae5', color: '#065f46', fontSize: '0.72rem' }}>
                          {sig.method || '已簽閱'}
                        </span>
                      </div>
                      {sig.signatureDataUrl && (
                        <div style={{ marginTop: '0.35rem', background: '#f8fafc', padding: '0.25rem', borderRadius: '6px', textAlign: 'center' }}>
                          <img
                            src={sig.signatureDataUrl}
                            alt={`${sig.name}簽名`}
                            style={{ height: '38px', objectFit: 'contain' }}
                          />
                        </div>
                      )}
                      {sig.comment && (
                        <div style={{ color: '#334155', marginTop: '0.25rem', fontSize: '0.8rem' }}>
                          💬 {sig.comment}
                        </div>
                      )}
                      <div style={{ color: '#94a3b8', fontSize: '0.74rem', marginTop: '0.2rem' }}>
                        🕒 {sig.signedAt ? new Date(sig.signedAt).toLocaleString('zh-TW') : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 底部返回清單按鈕 */}
              <div className="no-print" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMeetingId(null);
                    setShowSigPad(false);
                    if (typeof window !== 'undefined') {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '0.65rem 1.5rem', fontSize: '0.95rem' }}
                >
                  ⬅️ 返回{activeZone === 'home' ? '「首頁・待簽閱清單」' : '「📚 歷史紀錄專區清單」'}
                </button>
              </div>
            </div>
          )}

      {/* ==================== 全員可用：發起會議紀錄 / 編輯會議紀錄彈出視窗 ==================== */}
      {showCreateModal && staffDraftMeeting && (
        <div
          className="no-print animate-fade-in"
          onClick={() => setShowCreateModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.76)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '18px',
              width: '100%',
              maxWidth: '940px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '1.5rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '2px solid #059669'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.1rem', paddingBottom: '0.8rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <span className="badge" style={{ background: '#d1fae5', color: '#065f46', marginBottom: '0.25rem' }}>
                  發起人員：{currentUser?.name}（{currentUser?.title}）
                </span>
                <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a' }}>
                  {staffDraftMeeting.id ? `✏️ 編輯會議紀錄：${staffDraftMeeting.title}` : '➕ 發起新會議紀錄（含語音轉會議紀錄）'}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleSaveStaffMeeting}
                  disabled={savingStaffMeeting}
                  className="btn btn-success"
                >
                  <Save size={16} /> {savingStaffMeeting ? '儲存中...' : staffDraftMeeting.id ? '儲存會議修改' : '🚀 確認發起會議紀錄'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  ✕ 關閉
                </button>
              </div>
            </div>

            {/* 🎙️ 現場語音 / 口語重點一鍵轉結構化會議紀錄 */}
            <div className="card" style={{ marginBottom: '1.15rem', background: '#faf5ff', borderColor: '#d8b4fe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div style={{ fontWeight: 700, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Mic size={18} /> 🎙️ 語音轉文字 ＆ 講完後自動修正詞句（支援影醫科人名與專有名詞同音校正）
                </div>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={toggleFrontendVoiceRecognition}
                    className={`btn ${isVoiceListening ? 'recording-pulse' : ''}`}
                    style={{
                      background: isVoiceListening ? '#dc2626' : '#2563eb',
                      padding: '0.38rem 0.85rem',
                      fontSize: '0.82rem'
                    }}
                  >
                    {isVoiceListening ? (
                      <>
                        <MicOff size={15} /> 停止錄音（並自動校正詞句）
                      </>
                    ) : (
                      <>
                        <Mic size={15} /> 1. 開始麥克風語音轉文字
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePolishFrontendTranscript()}
                    disabled={polishingVoice}
                    className="btn btn-secondary"
                    style={{
                      padding: '0.38rem 0.85rem',
                      fontSize: '0.82rem',
                      background: '#ecfdf5',
                      color: '#065f46',
                      borderColor: '#6ee7b7'
                    }}
                  >
                    🪄 {polishingVoice ? '校正中...' : '2. 講完後：智慧修正錯別字與詞句'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRunFrontendAiStructuring}
                    disabled={aiStructuringLoading}
                    className="btn btn-purple"
                    style={{ padding: '0.38rem 0.9rem', fontSize: '0.82rem' }}
                  >
                    <Sparkles size={15} /> {aiStructuringLoading ? '轉換中...' : '3. ✨ 一鍵轉成正式議程與決議'}
                  </button>
                </div>
              </div>

              {isVoiceListening && (
                <div
                  style={{
                    marginBottom: '0.5rem',
                    padding: '0.45rem 0.75rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    fontSize: '0.83rem',
                    color: '#991b1b',
                    fontWeight: 600
                  }}
                >
                  🎙️ 正在即時聽寫中（講完按「停止錄音」即會自動修正同音錯字與通順詞句）：
                  <span style={{ color: '#0f172a', marginLeft: '0.35rem' }}>{voiceInterimText || '請開始說話...'}</span>
                </div>
              )}

              {voiceCorrections.length > 0 && (
                <div
                  style={{
                    marginBottom: '0.5rem',
                    padding: '0.45rem 0.75rem',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    color: '#065f46',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.4rem'
                  }}
                >
                  <span>
                    ✨ <strong>智慧校正已完成：</strong> {voiceCorrections.join('、')}
                  </span>
                  {voiceBeforePolish && (
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceQuickText(voiceBeforePolish);
                        setVoiceCorrections([]);
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '0.18rem 0.55rem', fontSize: '0.73rem' }}
                    >
                      ↩️ 還原修正前原文
                    </button>
                  )}
                </div>
              )}

              <textarea
                rows={4}
                value={voiceQuickText}
                onChange={(e) => {
                  setVoiceQuickText(e.target.value);
                  latestVoiceTextRef.current = e.target.value;
                }}
                placeholder="點擊「1. 開始麥克風語音轉文字」直接說話，講完可點「2. 🪄 智慧修正錯別字與詞句」（自動修正如：林怡貞➔林宜蓁、評保➔品保、千屏風➔鉛屏風、梅那麼➔沒那麼），也可以直接在這裡手動修改任何字句！"
                style={{ fontSize: '0.88rem' }}
              />
            </div>

            {/* 【D】一鍵帶入上一場同類別會議範本（或任選過往會議作為範本） */}
            <div
              className="card"
              style={{
                marginBottom: '1rem',
                padding: '0.85rem 1rem',
                background: '#eff6ff',
                border: '1px solid #93c5fd',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.6rem'
              }}
            >
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e3a8a' }}>
                📋 快速套用過往會議範本（自動帶入議程架構、討論段落標題、決議格式、地點與出席/休假名單）：
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    const sameCat = meetings.filter(
                      (m) => m.id !== staffDraftMeeting.id && m.category === staffDraftMeeting.category
                    );
                    const target = sameCat[0] || meetings.find((m) => m.id !== staffDraftMeeting.id);
                    if (target) {
                      applyMeetingTemplateToDraft(target);
                    } else {
                      alert('目前尚無可套用的過往會議紀錄');
                    }
                  }}
                  className="btn btn-primary"
                  style={{ padding: '0.38rem 0.85rem', fontSize: '0.82rem' }}
                >
                  📋 一鍵帶入上一場同類別會議範本
                </button>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const found = meetings.find((m) => m.id === e.target.value);
                    if (found) applyMeetingTemplateToDraft(found);
                    e.target.value = '';
                  }}
                  style={{
                    padding: '0.36rem 0.7rem',
                    fontSize: '0.82rem',
                    borderRadius: '8px',
                    border: '1px solid #93c5fd',
                    maxWidth: '280px'
                  }}
                >
                  <option value="">-- 或任選一場過往會議作為範本 --</option>
                  {meetings
                    .filter((m) => m.id !== staffDraftMeeting.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        [{m.date}] {m.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* 基本資料與自由修改標題 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.9rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.35rem' }}>
                  <label style={{ margin: 0 }}>✍️ 會議正式標題（可自行輸入或修改任何名稱） *</label>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setStaffDraftMeeting({ ...staffDraftMeeting, title: '' })}
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.74rem' }}
                    >
                      🧹 清空自填
                    </button>
                    {[
                      '115年 影像醫學科科務會議紀錄',
                      '115年 醫事放射師教學暨CCC會議紀錄',
                      '115年 電腦斷層暨乳房攝影品保會議紀錄',
                      '115年 影像醫學科輻射防護會議紀錄',
                      '115年 影像醫學科病安暨跨領域會議紀錄'
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setStaffDraftMeeting({ ...staffDraftMeeting, title: preset })}
                        className="btn btn-secondary"
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
                      >
                        套用：{preset.replace('115年 ', '').replace('紀錄', '')}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={staffDraftMeeting.title}
                  onChange={(e) => setStaffDraftMeeting({ ...staffDraftMeeting, title: e.target.value })}
                  placeholder="請輸入會議正式標題（例如：115年新樓醫院影像醫學科 臨時專案討論會議紀錄）"
                  style={{ fontWeight: 700, fontSize: '1.02rem', borderColor: '#2563eb' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>會議紀錄種類（含「其它會議」） *</label>
                <select
                  value={staffDraftMeeting.category}
                  onChange={(e) => setStaffDraftMeeting({ ...staffDraftMeeting, category: e.target.value })}
                >
                  {(settings.meetingCategories || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>發起後狀態 *</label>
                <select
                  value={staffDraftMeeting.isArchived ? 'ARCHIVED' : staffDraftMeeting.status}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'ARCHIVED') {
                      setStaffDraftMeeting({ ...staffDraftMeeting, status: 'published', isArchived: true });
                    } else {
                      setStaffDraftMeeting({ ...staffDraftMeeting, status: v, isArchived: false });
                    }
                  }}
                >
                  <option value="published">✅ 立即開放全科同仁於首頁簽閱</option>
                  <option value="pending_chair">⏳ 呈報會議主席覆核</option>
                  <option value="pending_director">⏳ 呈報科主任核准</option>
                  <option value="ARCHIVED">📦 直接歸檔至「歷史紀錄專區」</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>開會日期</label>
                <input
                  type="date"
                  value={staffDraftMeeting.date}
                  onChange={(e) => {
                    const d = e.target.value;
                    const y = parseInt((d || '2026').slice(0, 4), 10) || 2026;
                    const roc = String(y > 1911 ? y - 1911 : y);
                    setStaffDraftMeeting({
                      ...staffDraftMeeting,
                      date: d,
                      rocYear: roc,
                      displayDate: `${roc} 年 ${d.slice(5, 7)} 月 ${d.slice(8, 10)} 日 ${staffDraftMeeting.time || '12:30'}`
                    });
                  }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>開會時間</label>
                <input
                  type="time"
                  value={staffDraftMeeting.time}
                  onChange={(e) => setStaffDraftMeeting({ ...staffDraftMeeting, time: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>開會地點</label>
                <input
                  type="text"
                  value={staffDraftMeeting.location}
                  onChange={(e) => setStaffDraftMeeting({ ...staffDraftMeeting, location: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>會議主席</label>
                <input
                  type="text"
                  value={staffDraftMeeting.chair}
                  onChange={(e) => setStaffDraftMeeting({ ...staffDraftMeeting, chair: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>會議記錄人</label>
                <input
                  type="text"
                  value={staffDraftMeeting.recorder}
                  onChange={(e) => setStaffDraftMeeting({ ...staffDraftMeeting, recorder: e.target.value })}
                />
              </div>
            </div>

            {/* 出席人員 & 值班/休假人員 雙向相反連動面板（支援手動新增出席人員） */}
            {(() => {
              const baseStaffNames = activeStaffList.map((s) => s.name);
              const curPresent = staffDraftMeeting.presentStaffNames || [];
              const rawLeave = staffDraftMeeting.leaveStaffNames || [];
              const customNames = [...curPresent, ...rawLeave].filter(
                (n, i, arr) => n && !baseStaffNames.includes(n) && arr.indexOf(n) === i
              );
              const allCandidateNames = [...baseStaffNames, ...customNames];
              const curLeave = Array.from(
                new Set([...rawLeave, ...allCandidateNames.filter((n) => !curPresent.includes(n))].filter((n) => !curPresent.includes(n)))
              );

              const togglePersonAttendance = (personName, setAsPresent) => {
                let nextPresent;
                let nextLeave;
                if (setAsPresent) {
                  nextPresent = Array.from(new Set([...curPresent, personName]));
                  nextLeave = curLeave.filter((n) => n !== personName);
                } else {
                  nextPresent = curPresent.filter((n) => n !== personName);
                  nextLeave = Array.from(new Set([...curLeave, personName]));
                }
                setStaffDraftMeeting({
                  ...staffDraftMeeting,
                  presentStaffNames: nextPresent,
                  leaveStaffNames: nextLeave,
                  expectedCount: Math.max(Number(staffDraftMeeting.expectedCount) || 0, nextPresent.length + nextLeave.length)
                });
              };

              const handleAddCustomAttendee = () => {
                const raw = (customAttendeeInput || '').trim();
                if (!raw) return;
                const namesToAdd = raw
                  .split(/[,，、\s]+/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (namesToAdd.length === 0) return;

                const nextPresent = Array.from(new Set([...curPresent, ...namesToAdd]));
                const nextLeave = curLeave.filter((n) => !namesToAdd.includes(n));
                setStaffDraftMeeting({
                  ...staffDraftMeeting,
                  presentStaffNames: nextPresent,
                  leaveStaffNames: nextLeave,
                  expectedCount: Math.max(Number(staffDraftMeeting.expectedCount) || 0, nextPresent.length + nextLeave.length)
                });
                setCustomAttendeeInput('');
                showToast(`✅ 已手動新增出席人員：${namesToAdd.join('、')}`);
              };

              const handleRemoveCustomPerson = (personName) => {
                const nextPresent = curPresent.filter((n) => n !== personName);
                const nextLeave = curLeave.filter((n) => n !== personName);
                setStaffDraftMeeting({
                  ...staffDraftMeeting,
                  presentStaffNames: nextPresent,
                  leaveStaffNames: nextLeave
                });
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1rem' }}>
                  {/* 1. 出席人員點選 + 手動新增輸入框 */}
                  <div className="card" style={{ marginBottom: 0, background: '#f8fafc', padding: '0.95rem', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
                      <label style={{ margin: 0, color: '#1e3a8a', fontSize: '0.92rem' }}>
                        👥 出席人員點選（已勾選 {curPresent.length} 人，取消勾選即自動歸入下方「值班/休假」）：
                      </label>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setStaffDraftMeeting({
                              ...staffDraftMeeting,
                              presentStaffNames: [...allCandidateNames],
                              leaveStaffNames: [],
                              expectedCount: allCandidateNames.length
                            })
                          }
                          className="btn btn-secondary"
                          style={{ padding: '0.22rem 0.65rem', fontSize: '0.76rem' }}
                        >
                          全選在職同仁 ({allCandidateNames.length}人皆出席)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setStaffDraftMeeting({
                              ...staffDraftMeeting,
                              presentStaffNames: [],
                              leaveStaffNames: [...allCandidateNames]
                            })
                          }
                          className="btn btn-secondary"
                          style={{ padding: '0.22rem 0.65rem', fontSize: '0.76rem' }}
                        >
                          清空重選 (全設為未出席)
                        </button>
                      </div>
                    </div>

                    {/* 手動輸入新增出席人員名稱 */}
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.45rem',
                        alignItems: 'center',
                        marginBottom: '0.65rem',
                        background: '#ffffff',
                        padding: '0.45rem 0.6rem',
                        borderRadius: '10px',
                        border: '1px dashed #93c5fd',
                        flexWrap: 'wrap'
                      }}
                    >
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                        ✍️ 手動新增出席人員：
                      </span>
                      <input
                        type="text"
                        value={customAttendeeInput}
                        onChange={(e) => setCustomAttendeeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomAttendee();
                          }
                        }}
                        placeholder="輸入姓名（多位可用逗號或空白分隔，如：王醫師、實習生陳小明）按 Enter 或點新增..."
                        style={{
                          flex: '1 1 240px',
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.82rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px'
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomAttendee}
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                      >
                        <Plus size={14} /> 新增至出席名單
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.38rem' }}>
                      {allCandidateNames.map((name) => {
                        const checked = curPresent.includes(name);
                        const isCustom = !baseStaffNames.includes(name);
                        return (
                          <div key={`present-${name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            <button
                              type="button"
                              onClick={() => togglePersonAttendance(name, !checked)}
                              style={{
                                padding: '0.3rem 0.65rem',
                                borderRadius: isCustom ? '8px 0 0 8px' : '8px',
                                border: checked ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                background: checked ? '#dbeafe' : '#ffffff',
                                color: checked ? '#1e40af' : '#64748b',
                                fontWeight: checked ? 700 : 500,
                                fontSize: '0.81rem',
                                cursor: 'pointer',
                                transition: 'all 0.12s ease'
                              }}
                              title={checked ? '點擊改為「值班/休假（不會出席）」' : '點擊勾選為「出席人員」'}
                            >
                              {checked ? '✓ ' : ''}
                              {name}
                              {isCustom ? ' (手輸)' : ''}
                            </button>
                            {isCustom && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCustomPerson(name)}
                                title={`刪除手動新增的「${name}」`}
                                style={{
                                  padding: '0.3rem 0.42rem',
                                  borderRadius: '0 8px 8px 0',
                                  border: '1px solid #fca5a5',
                                  borderLeft: 'none',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  fontWeight: 800,
                                  fontSize: '0.78rem',
                                  cursor: 'pointer'
                                }}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. 值班 / 休假人員點選（勾選後不會出席，與出席人員相反） */}
                  <div className="card" style={{ marginBottom: 0, background: '#fffbeb', padding: '0.95rem', border: '1px solid #fde68a' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.55rem' }}>
                      <label style={{ margin: 0, color: '#92400e', fontSize: '0.92rem' }}>
                        🌙 值班 / 休假人員點選（不會出席，已勾選 {curLeave.length} 人 — 與出席人員相反連動）：
                      </label>
                      <span style={{ fontSize: '0.77rem', color: '#b45309', fontWeight: 600 }}>
                        💡 在此勾選值班或休假同仁，上方「出席人員」會自動取消勾選
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.38rem' }}>
                      {allCandidateNames.map((name) => {
                        const isLeave = curLeave.includes(name);
                        return (
                          <button
                            key={`leave-${name}`}
                            type="button"
                            onClick={() => togglePersonAttendance(name, isLeave)}
                            style={{
                              padding: '0.3rem 0.65rem',
                              borderRadius: '8px',
                              border: isLeave ? '1.5px solid #d97706' : '1px solid #e2e8f0',
                              background: isLeave ? '#fef3c7' : '#ffffff',
                              color: isLeave ? '#92400e' : '#94a3b8',
                              fontWeight: isLeave ? 700 : 500,
                              fontSize: '0.81rem',
                              cursor: 'pointer',
                              transition: 'all 0.12s ease'
                            }}
                            title={isLeave ? '目前為「值班/休假（不出席）」，點擊改回「出席」' : '點擊勾選為「值班/休假（不會出席）」'}
                          >
                            {isLeave ? '✓ 🌙 ' : ''}
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 議程主題 */}
            <div className="card" style={{ marginBottom: '1rem', padding: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ margin: 0 }}>📌 壹、會議議程主題</label>
                <button
                  type="button"
                  onClick={() =>
                    setStaffDraftMeeting({
                      ...staffDraftMeeting,
                      agendaItems: [...(staffDraftMeeting.agendaItems || []), `${(staffDraftMeeting.agendaItems || []).length + 1}. 新增議程主題`]
                    })
                  }
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                >
                  <Plus size={14} /> 新增議程列
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {(staffDraftMeeting.agendaItems || []).map((ag, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="text"
                      value={ag}
                      onChange={(e) => {
                        const list = [...staffDraftMeeting.agendaItems];
                        list[idx] = e.target.value;
                        setStaffDraftMeeting({ ...staffDraftMeeting, agendaItems: list });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const list = staffDraftMeeting.agendaItems.filter((_, i) => i !== idx);
                        setStaffDraftMeeting({ ...staffDraftMeeting, agendaItems: list });
                      }}
                      className="btn btn-danger"
                      style={{ padding: '0.35rem 0.6rem' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 討論事項段落 */}
            <div className="card" style={{ marginBottom: '1rem', padding: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <label style={{ margin: 0 }}>📝 貳、討論事項內容</label>
                <button
                  type="button"
                  onClick={() =>
                    setStaffDraftMeeting({
                      ...staffDraftMeeting,
                      discussionSections: [
                        ...(staffDraftMeeting.discussionSections || []),
                        { heading: `${(staffDraftMeeting.discussionSections || []).length + 1}. 新增討論主題`, bullets: [''] }
                      ]
                    })
                  }
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                >
                  <Plus size={14} /> 新增討論段落
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(staffDraftMeeting.discussionSections || []).map((sec, sIdx) => (
                  <div key={sIdx} style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.45rem' }}>
                      <input
                        type="text"
                        value={sec.heading}
                        onChange={(e) => {
                          const secs = [...staffDraftMeeting.discussionSections];
                          secs[sIdx] = { ...secs[sIdx], heading: e.target.value };
                          setStaffDraftMeeting({ ...staffDraftMeeting, discussionSections: secs });
                        }}
                        placeholder="段落標題（例如：1. 臨床業務討論）"
                        style={{ fontWeight: 700 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const secs = staffDraftMeeting.discussionSections.filter((_, i) => i !== sIdx);
                          setStaffDraftMeeting({ ...staffDraftMeeting, discussionSections: secs });
                        }}
                        className="btn btn-danger"
                        style={{ padding: '0.35rem 0.6rem' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={(sec.bullets || []).join('\n')}
                      onChange={(e) => {
                        const secs = [...staffDraftMeeting.discussionSections];
                        secs[sIdx] = { ...secs[sIdx], bullets: e.target.value.split('\n') };
                        setStaffDraftMeeting({ ...staffDraftMeeting, discussionSections: secs });
                      }}
                      placeholder="請輸入本段討論細節（換行即自動分列條目）..."
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 決議與追蹤事項 */}
            <div className="card" style={{ marginBottom: '1rem', padding: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ margin: 0 }}>✅ 參、決議與執行事項</label>
                <button
                  type="button"
                  onClick={() =>
                    setStaffDraftMeeting({
                      ...staffDraftMeeting,
                      resolutions: [...(staffDraftMeeting.resolutions || []), '']
                    })
                  }
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                >
                  <Plus size={14} /> 新增決議列
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {(staffDraftMeeting.resolutions || []).map((resText, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="text"
                      value={resText}
                      onChange={(e) => {
                        const list = [...staffDraftMeeting.resolutions];
                        list[idx] = e.target.value;
                        setStaffDraftMeeting({ ...staffDraftMeeting, resolutions: list });
                      }}
                      placeholder={`決議事項 ${idx + 1}...`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const list = staffDraftMeeting.resolutions.filter((_, i) => i !== idx);
                        setStaffDraftMeeting({ ...staffDraftMeeting, resolutions: list });
                      }}
                      className="btn btn-danger"
                      style={{ padding: '0.35rem 0.6rem' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 【問卷系統連動】本場會議專屬問卷或課後測驗連結（選填） */}
            <div className="card" style={{ marginBottom: '1rem', padding: '0.9rem', background: '#f0fdfa', borderColor: '#99f6e4' }}>
              <label style={{ margin: '0 0 0.4rem 0', color: '#0f766e', display: 'block' }}>
                📝 連動本場會議問卷 / 課後測驗網址（選填，未填則預設使用全科問卷系統網址）
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={staffDraftMeeting.surveyTitle || ''}
                  onChange={(e) => setStaffDraftMeeting({ ...staffDraftMeeting, surveyTitle: e.target.value })}
                  placeholder="問卷按鈕標題（如：填寫課後滿意度問卷）"
                  style={{ flex: '1 1 200px' }}
                />
                <input
                  type="url"
                  value={staffDraftMeeting.surveyUrl || ''}
                  onChange={(e) => setStaffDraftMeeting({ ...staffDraftMeeting, surveyUrl: e.target.value })}
                  placeholder="貼上您的問卷系統網址（如 http://localhost:3001 或 Google表單 / 自製問卷網址）..."
                  style={{ flex: '2 1 320px' }}
                />
              </div>
            </div>

            {/* 【E】會議現場照片與佐證文件檔案上傳（支援圖片、PDF、Word、Excel、PPTX、CSV） */}
            <div className="card" style={{ marginBottom: '1.2rem', padding: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <label style={{ margin: 0 }}>
                  📎 會議現場照片或 PDF / Word / Excel / PPTX 佐證附件（選填，已附加 {(staffDraftMeeting.attachments || []).length} 件）
                </label>
                <label className="btn btn-secondary" style={{ margin: 0, padding: '0.38rem 0.85rem', fontSize: '0.8rem', cursor: 'pointer', background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' }}>
                  <Upload size={14} /> 上傳照片或 PDF/Word/Excel 檔案
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
                    multiple
                    onChange={handleStaffUploadPhoto}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              {(staffDraftMeeting.attachments || []).length > 0 && (
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
                  {staffDraftMeeting.attachments.map((att, idx) => {
                    const isImg = isImageAttachment(att);
                    const badge = getFileTypeBadge(att);
                    return (
                      <div
                        key={att.id || idx}
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '0.4rem',
                          width: '150px',
                          textAlign: 'center',
                          background: '#ffffff'
                        }}
                      >
                        {isImg ? (
                          <img src={att.url} alt={att.title} style={{ width: '100%', height: '68px', objectFit: 'cover', borderRadius: '6px' }} />
                        ) : (
                          <div
                            style={{
                              height: '68px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: '#f8fafc',
                              borderRadius: '6px',
                              padding: '0.25rem'
                            }}
                          >
                            <span className="badge" style={{ background: badge.bg, color: badge.color, fontSize: '0.72rem' }}>
                              {badge.label}
                            </span>
                          </div>
                        )}
                        <div style={{ fontSize: '0.73rem', color: '#334155', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={att.title}>
                          {att.title}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = staffDraftMeeting.attachments.filter((_, i) => i !== idx);
                            setStaffDraftMeeting({ ...staffDraftMeeting, attachments: next });
                          }}
                          className="btn btn-danger"
                          style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem', marginTop: '0.25rem' }}
                        >
                          移除
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveStaffMeeting}
                disabled={savingStaffMeeting}
                className="btn btn-success"
                style={{ padding: '0.7rem 1.5rem', fontSize: '1rem' }}
              >
                <Save size={18} /> {savingStaffMeeting ? '儲存中...' : staffDraftMeeting.id ? '儲存會議修改' : '🚀 確認發起並發布會議紀錄'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 【問卷系統連結與內嵌整合視窗】 ==================== */}
      {showSurveyModal && (
        <div
          className="no-print animate-fade-in"
          onClick={() => setShowSurveyModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.78)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '18px',
              width: '100%',
              maxWidth: '980px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '1.35rem 1.5rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '2px solid #0d9488'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', paddingBottom: '0.85rem', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <span className="badge" style={{ background: '#ccfbf1', color: '#0f766e', marginBottom: '0.25rem' }}>
                  🔗 外部問卷系統整合模組（自動帶入登入人員：{currentUser?.name} / {currentUser?.code}）
                </span>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                  📝 {activeSurveyTarget.title || settings.surveySystemTitle || '影像醫學科問卷調查系統'}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {activeSurveyTarget.url && (
                  <a
                    href={activeSurveyTarget.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                    style={{
                      background: '#0d9488',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '0.45rem 0.95rem',
                      fontSize: '0.85rem'
                    }}
                  >
                    🚀 於新分頁開啟問卷系統 ↗
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShowSurveyUrlEditor(!showSurveyUrlEditor)}
                  className="btn btn-secondary"
                  style={{ padding: '0.45rem 0.85rem', fontSize: '0.84rem' }}
                >
                  ⚙️ {showSurveyUrlEditor ? '收起網址設定' : '設定 / 修改問卷系統網址'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSurveyModal(false)}
                  className="btn btn-secondary"
                  style={{ padding: '0.45rem 0.85rem', fontSize: '0.84rem' }}
                >
                  ✕ 關閉
                </button>
              </div>
            </div>

            {showSurveyUrlEditor && (
              <form
                onSubmit={handleSaveSurveySystemUrl}
                className="card"
                style={{ marginBottom: '1rem', background: '#f0fdfa', borderColor: '#99f6e4', padding: '1rem' }}
              >
                <div style={{ fontWeight: 700, color: '#0f766e', marginBottom: '0.5rem', fontSize: '0.92rem' }}>
                  🔗 綁定您做的「問卷系統」網址（設定後全科同仁點選「📝 問卷系統」即可直接開啟或內嵌填寫）：
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '0.75rem' }}>
                  💡 系統轉跳時會自動在網址後方附上目前登入同仁參數：
                  <code>?staffName={currentUser?.name}&staffCode={currentUser?.code}&staffTitle={currentUser?.title}</code>
                  {activeMeeting ? <code>&meetingId={activeMeeting.id}&meetingTitle={activeMeeting.title}</code> : ''}
                  ，方便您的問卷系統自動帶入填答人身分！
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.82rem' }}>問卷系統顯示名稱</label>
                    <input
                      type="text"
                      value={surveyTitleInput}
                      onChange={(e) => setSurveyTitleInput(e.target.value)}
                      placeholder="例如：影像醫學科問卷調查系統"
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '0.82rem' }}>問卷系統網址 (URL) *</label>
                    <input
                      type="url"
                      required
                      value={surveyConfigInput}
                      onChange={(e) => setSurveyConfigInput(e.target.value)}
                      placeholder="請貼上您製作的問卷系統網址（例如 http://localhost:3001 或 https://...）"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="submit" disabled={savingSurveyUrl} className="btn btn-success" style={{ padding: '0.45rem 1.1rem', fontSize: '0.86rem' }}>
                    <Save size={15} /> {savingSurveyUrl ? '儲存中...' : '💾 儲存並連動問卷系統'}
                  </button>
                </div>
              </form>
            )}

            {activeSurveyTarget.url ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#475569' }}>
                  <span>
                    📍 目前連線問卷網址：<code>{activeSurveyTarget.url}</code>
                  </span>
                  <span>（若外部網站限制內嵌框架，請點選右上角「🚀 於新分頁開啟問卷系統 ↗」）</span>
                </div>
                <div
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    height: '62vh',
                    background: '#f8fafc'
                  }}
                >
                  <iframe
                    src={activeSurveyTarget.url}
                    title="問卷系統內嵌視窗"
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2.2rem 1rem', color: '#64748b' }}>
                尚未設定問卷系統網址，請於上方輸入框貼上您製作的問卷系統網址並點擊「💾 儲存並連動問卷系統」。
              </div>
            )}
          </div>
        </div>
      )}

      {/* 圖片點擊放大檢視 Lightbox */}
      {previewImage && (
        <div
          className="no-print"
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.82)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              padding: '1rem',
              borderRadius: '14px',
              maxWidth: '900px',
              maxHeight: '90vh',
              overflow: 'auto',
              textAlign: 'center'
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '1.05rem' }}>{previewImage.title}</div>
            <img
              src={previewImage.url}
              alt={previewImage.title}
              style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: '8px' }}
            />
            <div style={{ marginTop: '0.85rem' }}>
              <button type="button" onClick={() => setPreviewImage(null)} className="btn">
                關閉預覽
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
