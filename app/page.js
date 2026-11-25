'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
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

// 將搜尋關鍵字轉為容許中英文之間有無空白之正規表達式（例如輸入「ACR假體」可同時命中「ACR 假體」與「ACR假體」）
function buildFlexibleKeywordRegex(rawKeyword, flags = 'gi') {
  const tokens = String(rawKeyword || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const patterns = tokens.map((t) =>
    t
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1\\s*$2')
      .replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1\\s*$2')
  );
  return new RegExp(`(${patterns.join('|')})`, flags);
}

function matchesAllKeywords(text, rawKeyword) {
  const tokens = String(rawKeyword || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const lower = String(text || '').toLowerCase();
  const noSpace = lower.replace(/\s+/g, '');
  return tokens.every((t) => lower.includes(t) || noSpace.includes(t));
}

function matchesAnyKeyword(text, rawKeyword) {
  const regex = buildFlexibleKeywordRegex(rawKeyword, 'i');
  if (!regex) return false;
  return regex.test(String(text || ''));
}

// 關鍵字高亮元件：支援單一、多重關鍵字及中英夾雜自動忽略空白差異醒目提示
function HighlightText({ text, keyword }) {
  const str = String(text || '');
  const regex = buildFlexibleKeywordRegex(keyword, 'gi');
  if (!regex) return <>{str}</>;

  try {
    const parts = str.split(regex);
    const testRegex = buildFlexibleKeywordRegex(keyword, 'i');
    return (
      <>
        {parts.map((part, i) =>
          part && testRegex && testRegex.test(part) ? (
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
  const [sigPadMode, setSigPadMode] = useState('sign'); // 'sign' (會後查閱簽認) | 'checkin' (會議進行中現場簽到)
  const [signComment, setSignComment] = useState('');
  const [signingLoading, setSigningLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);

  // Lightbox image preview & QR Code modal
  const [previewImage, setPreviewImage] = useState(null);
  const [qrModalMeeting, setQrModalMeeting] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [checkinUrl, setCheckinUrl] = useState('');

  // 同仁前台「發起新會議 (initiate)」與「點選進入執行會議紀錄 (record)」State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalMode, setModalMode] = useState('initiate'); // 'initiate' (發起會議開放簽到) | 'record' (執行會議紀錄/修改退回資料)
  const [staffDraftMeeting, setStaffDraftMeeting] = useState(null);
  const [customAttendeeInput, setCustomAttendeeInput] = useState('');
  const [savingStaffMeeting, setSavingStaffMeeting] = useState(false);
  const [directorReviewReason, setDirectorReviewReason] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [voiceQuickText, setVoiceQuickText] = useState('');
  const [voiceInterimText, setVoiceInterimText] = useState('');
  const [voiceBeforePolish, setVoiceBeforePolish] = useState('');
  const [voiceCorrections, setVoiceCorrections] = useState([]);
  const [polishingVoice, setPolishingVoice] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('idle'); // 'idle' | 'starting' | 'listening' | 'paused' | 'keyboard_mode'
  const [voiceTimerSeconds, setVoiceTimerSeconds] = useState(0);
  const [mobileVoiceHint, setMobileVoiceHint] = useState('');
  const [frontendAudioBase64, setFrontendAudioBase64] = useState(null);
  const [frontendAudioMime, setFrontendAudioMime] = useState('audio/mp4');
  const [frontendAudioName, setFrontendAudioName] = useState('');
  const [frontendAudioUrl, setFrontendAudioUrl] = useState(null);
  const [isFrontendAudioRecording, setIsFrontendAudioRecording] = useState(false);
  const [frontendAudioSeconds, setFrontendAudioSeconds] = useState(0);
  const [aiStructuringLoading, setAiStructuringLoading] = useState(false);
  const [frontendHandwrittenImages, setFrontendHandwrittenImages] = useState([]);
  const [savingFrontendDraftInbox, setSavingFrontendDraftInbox] = useState(false);
  const speechRecRef = useRef(null);
  const wantVoiceListeningRef = useRef(false);
  const voiceTimerRef = useRef(null);
  const sessionBaseTextRef = useRef('');
  const voiceTextareaRef = useRef(null);
  const frontendMediaRecorderRef = useRef(null);
  const frontendAudioTimerRef = useRef(null);
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
    setTimeout(() => setToastMsg(''), 4500);
  };

  const getRocYear = (m) => {
    if (m.rocYear) return String(m.rocYear);
    const y = parseInt((m.date || '2026').slice(0, 4), 10) || 2026;
    return String(y > 1911 ? y - 1911 : y);
  };

  // 判斷登入者是否為「技術主任 / 主管」（可確認無誤按「公布」或「退回記錄人修改」）
  const isTechDirectorOrSupervisor = (user) => {
    if (!user) return false;
    if (user.role === 'chair' || user.role === 'director') return true;
    if ((user.title || '').includes('主任')) return true;
    if (['林宜蓁', '鄭義成', '許志賢'].includes(user.name)) return true;
    return false;
  };

  // 判斷登入者是否為本場會議之「記錄人 / 發起人 / 主席 / 主任」（可於會議進行中或退回時執行會議紀錄與結束會議）
  const isRecorderOrInitiator = (m, user) => {
    if (!m || !user) return false;
    return (
      user.name === m.recorder ||
      user.name === m.initiatedBy ||
      user.name === m.chair ||
      isTechDirectorOrSupervisor(user)
    );
  };

  // 判斷登入者是否可查閱該場會議之完整會議紀錄內容（待技術主任確認無誤按「公布」後，其他人員才能去查閱）
  const canViewMeetingMinutesContent = (m, user) => {
    if (!m) return false;
    if (m.status === 'published' || !m.status) return true;
    return isRecorderOrInitiator(m, user) || isTechDirectorOrSupervisor(user);
  };

  // 判斷某場會議對該名同仁而言，是否顯示於「首頁」或「歷史紀錄專區」
  const isMeetingPendingForUser = (m, user) => {
    if (!user || !m) return false;
    // 1. 會議進行中 (in_progress)：全員皆可在首頁看到並點選進入（同仁先做現場簽到，記錄人點選進入執行會議紀錄）
    if (m.status === 'in_progress') {
      return true;
    }
    // 2. 技術主任退回修改中 (returned)：僅記錄人 / 發起人 / 主席 / 主任在首頁看到並進入修改資料（其他人員不可查閱）
    if (m.status === 'returned') {
      return isRecorderOrInitiator(m, user);
    }
    // 3. 已結束會議・待技術主任確認公布 (pending_review / pending_chair / pending_director)：僅技術主任/主管與記錄人可見（其他人員待公布後才能查閱）
    if (m.status === 'pending_review' || m.status === 'pending_chair' || m.status === 'pending_director') {
      return isTechDirectorOrSupervisor(user) || isRecorderOrInitiator(m, user);
    }
    // 4. 技術主任已確認公布 (published)：開放全科同仁查閱與簽認
    const isSignedByMe = Boolean(m.signatures?.[user.name]);
    if (isSignedByMe) return false; // 已簽核過的就不會顯示在首頁！
    const isReopenedForMe = (m.reopenedForStaff || []).includes(user.name);
    if (isReopenedForMe) return true; // 管理員退回重簽，強制顯示於首頁
    if (m.isArchived) return false; // 已結案歸檔至歷史專區
    return m.status === 'published' || !m.status;
  };

  const isMeetingInHistoryForUser = (m, user) => {
    if (!m) return false;
    // 尚未經技術主任確認公布的會議（in_progress / returned / pending_review），不列入歷史紀錄專區
    if (m.status && m.status !== 'published') return false;
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
              setSelectedDropdownStaff(refreshed.name);
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
        setCheckinMeetingId(null);

        if (mode === 'checkin' && data.meeting?.status && data.meeting.status !== 'published') {
          // 會議進行中 (in_progress) 現場出席簽到：保留於當前頁面或返回首頁顯示已簽到狀態
          setActiveZone('home');
          showToast(
            `✅ ${user.name} 已完成【${data.meeting.title}】現場出席簽到（已自動列入出席人員名單）！`
          );
        } else {
          // 【A】正式公布後之簽閱完成後「自動返回首頁列表」
          setActiveZone('home');
          setActiveMeetingId(null);
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          showToast(
            mode === 'checkin'
              ? `✅ ${user.name} 已完成【${data.meeting.title}】現場出席簽到，已自動返回首頁列表！`
              : `✅ 簽核成功！已自動返回首頁待簽列表（本筆紀錄已移入「📚 歷史紀錄專區」）`
          );
        }
      } else {
        alert(data.error || '簽核失敗');
      }
    } catch (err) {
      alert('網路錯誤，請稍後再試');
    } finally {
      setSigningLoading(false);
    }
  };

  // QR Code 專屬精簡簽到（停留在精簡簽到畫面並即時顯示「✅ 已簽到」，不跳進複雜系統首頁）
  const handleQrMinimalCheckin = async (e) => {
    if (e) e.preventDefault();
    const chosenName = (selectedDropdownStaff || '').trim();
    if (!chosenName) {
      setLoginError('請先選取簽到人員');
      return;
    }
    const member = activeStaffList.find((s) => s.name === chosenName) || {
      id: chosenName,
      name: chosenName,
      title: '科內同仁'
    };

    setSigningLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/meetings/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: checkinMeetingId,
          staffId: member.id,
          staffName: member.name,
          mode: 'checkin',
          comment: '現場QR掃碼簽到'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        setCurrentUser(member);
        if (typeof window !== 'undefined') {
          localStorage.setItem('rad_mtg_staff_user', JSON.stringify(member));
        }
      } else {
        setLoginError(data.error || '簽到失敗');
      }
    } catch (err) {
      setLoginError('網路連線異常，請稍後再試');
    } finally {
      setSigningLoading(false);
    }
  };

  // 開啟現場簽到 QR Code 彈窗（發起會議後即可供現場與會同仁手機掃碼簽到）
  const openFrontendQrModal = async (meeting) => {
    if (!meeting) return;
    setQrModalMeeting(meeting);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const url = `${origin}/?checkin=${encodeURIComponent(meeting.id)}`;
    setCheckinUrl(url);
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error(err);
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

  // ==================== 同仁前台「STEP 1：發起新會議 (initiate)」與「STEP 2：點選進入執行會議紀錄 (record)」功能 ====================
  const openStaffMeetingCreator = (existingMeeting = null, targetMode = null) => {
    const allActiveNames = staffList.filter((s) => s.status !== '離職').map((s) => s.name);
    const activeNames = staffList.filter((s) => s.status === '在職').map((s) => s.name);
    const defaultLeaveNames = allActiveNames.filter((n) => !activeNames.includes(n));
    const todayStr = new Date().toISOString().slice(0, 10);
    const rocYr = String(new Date().getFullYear() - 1911);
    const defaultCat = categoryFilter !== 'ALL' ? categoryFilter : 'dept';
    setCustomAttendeeInput('');

    if (existingMeeting) {
      const copy = JSON.parse(JSON.stringify(existingMeeting));
      const checkedInNames = Object.keys(copy.checkins || {});
      const curPresent = Array.from(new Set([...(copy.presentStaffNames || []), ...checkedInNames]));
      copy.presentStaffNames = curPresent;
      const rawLeave = Array.isArray(copy.leaveStaffNames) ? copy.leaveStaffNames : [];
      copy.leaveStaffNames = Array.from(
        new Set([...rawLeave, ...allActiveNames.filter((n) => !curPresent.includes(n))].filter((n) => !curPresent.includes(n)))
      );
      setStaffDraftMeeting(copy);
      setVoiceQuickText(existingMeeting.rawTranscript || '');
      setModalMode(targetMode || 'record');
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
        chair: '林宜蓁',
        recorder: currentUser?.name || '潘俊儒',
        status: 'in_progress',
        isArchived: false,
        targetGroups: ['全科人員'],
        expectedCount: allActiveNames.length || activeNames.length || 22,
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
      setModalMode(targetMode || 'initiate');
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

  const handleFrontendHandwrittenUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawDataUrl = ev.target.result;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 960;
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
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
          const base64 = String(compressedDataUrl).split(',')[1] || '';
          setFrontendHandwrittenImages((prev) => [
            ...prev,
            {
              id: `FHW-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: file.name,
              mimeType: 'image/jpeg',
              base64,
              dataUrl: compressedDataUrl
            }
          ]);
        };
        img.onerror = () => {
          // 若瀏覽器無法以 canvas 轉碼（如部分手機格式），仍保留原始檔案供儲存
          const b64 = String(rawDataUrl || '').split(',')[1] || '';
          setFrontendHandwrittenImages((prev) => [
            ...prev,
            {
              id: `FHW-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: file.name,
              mimeType: file.type || 'image/jpeg',
              base64: b64,
              dataUrl: rawDataUrl
            }
          ]);
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });

    showToast(`📷 已載入 ${files.length} 張手寫稿照片（儲存會議紀錄或暫存雲端時將一併保存）！`);
    e.target.value = '';
  };

  const handlePolishFrontendTranscript = async (textOverride = null, silentIfEmpty = false) => {
    const raw = (textOverride !== null ? textOverride : voiceQuickText || '').trim();
    if (!raw && frontendHandwrittenImages.length === 0) {
      if (!silentIfEmpty) alert('請先上傳手寫稿照片、進行語音辨識或輸入文字後再執行詞句修正潤飾！');
      return;
    }
    setPolishingVoice(true);
    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: frontendHandwrittenImages.length > 0 ? 'extract_handwritten' : 'polish_transcript',
          transcript: raw,
          handwrittenImages: frontendHandwrittenImages.map((img) => ({
            base64: img.base64,
            mimeType: img.mimeType,
            name: img.name
          }))
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.correctedTranscript) {
        setVoiceBeforePolish(raw);
        setVoiceQuickText(data.correctedTranscript);
        latestVoiceTextRef.current = data.correctedTranscript;
        setVoiceCorrections(data.corrections || []);
        showToast(data.message || '✨ 已自動完成手寫稿/同音錯別字校正與詞句潤飾！');
      } else if (!res.ok && data.error && !silentIfEmpty) {
        alert(data.error);
      }
    } catch (err) {
      console.error('Polish transcript error:', err);
    } finally {
      setPolishingVoice(false);
    }
  };

  const stopVoiceTimer = () => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  const activateMobileKeyboardDictation = (reasonMsg = '') => {
    stopVoiceTimer();
    wantVoiceListeningRef.current = false;
    setIsVoiceListening(false);
    setVoiceStatus('keyboard_mode');
    setMobileVoiceHint(
      reasonMsg ||
        '🟢【手機鍵盤語音模式作用中】下方文字框已點開！請直接點擊您「手機鍵盤右下角（或空白鍵旁）的 🎤 麥克風圖示」開始說話（使用手機原生語音輸入，免權限、不斷線且最準確）！'
    );
    // 必須於使用者點擊事件中同步執行 focus()，手機虛擬鍵盤才會立刻彈出
    if (voiceTextareaRef.current) {
      try {
        voiceTextareaRef.current.focus();
      } catch {}
    }
  };

  const toggleFrontendPureAudioRecorder = async () => {
    if (isFrontendAudioRecording) {
      if (frontendAudioTimerRef.current) {
        clearInterval(frontendAudioTimerRef.current);
        frontendAudioTimerRef.current = null;
      }
      if (frontendMediaRecorderRef.current && frontendMediaRecorderRef.current.state !== 'inactive') {
        try {
          frontendMediaRecorderRef.current.stop();
        } catch {}
      }
      setIsFrontendAudioRecording(false);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      activateMobileKeyboardDictation(
        '📱 目前瀏覽器環境（如非 HTTPS 區網網址或 LINE 內建瀏覽器）不開放網頁直接錄音，已自動為您切換為「🟢 手機鍵盤 🎤 語音輸入模式」：請直接按手機鍵盤上的 🎤 麥克風說話，或點選「📂 選取手機錄音檔」！'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('audio/mp4')
          ? 'audio/mp4'
          : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : '';
      let mr;
      try {
        mr = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 32000 })
          : new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      } catch {
        mr = new MediaRecorder(stream);
      }

      const chunks = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => {
        const actualMime = mr.mimeType || preferredMime || 'audio/mp4';
        const ext = actualMime.includes('mp4') || actualMime.includes('aac') ? 'm4a' : 'webm';
        const blob = new Blob(chunks, { type: actualMime });
        const url = URL.createObjectURL(blob);
        setFrontendAudioUrl(url);
        setFrontendAudioMime(actualMime);
        setFrontendAudioName(`手機會議錄音_${new Date().toISOString().slice(0, 10)}.${ext}`);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const b64 = String(ev.target.result || '').split(',')[1] || '';
          setFrontendAudioBase64(b64);
          showToast('🎵 手機語音錄製完成！可點選「☁️ 暫存至雲端」回電腦用 IDE 分析，或直接轉換！');
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mr.start();
      frontendMediaRecorderRef.current = mr;
      setFrontendAudioSeconds(0);
      setIsFrontendAudioRecording(true);
      frontendAudioTimerRef.current = setInterval(() => {
        setFrontendAudioSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      activateMobileKeyboardDictation(
        '📱 您的手機瀏覽器限制網頁直接存取麥克風，已自動為您切換為「🟢 手機鍵盤 🎤 語音輸入模式」：請直接按「手機鍵盤右下角的 🎤 麥克風」講話，或點選「📂 選取手機錄音檔」！'
      );
    }
  };

  const handleFrontendAudioFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFrontendAudioName(file.name);
    setFrontendAudioMime(file.type || 'audio/mp4');
    const url = URL.createObjectURL(file);
    setFrontendAudioUrl(url);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = String(ev.target.result || '').split(',')[1] || '';
      setFrontendAudioBase64(b64);
      showToast(`🎵 已載入錄音檔「${file.name}」，可點選「☁️ 暫存至雲端（回電腦用 IDE 整理）」！`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toggleFrontendVoiceRecognition = () => {
    if (isVoiceListening || wantVoiceListeningRef.current) {
      wantVoiceListeningRef.current = false;
      stopVoiceTimer();
      if (speechRecRef.current) {
        try {
          speechRecRef.current.stop();
        } catch {}
      }
      setIsVoiceListening(false);
      setVoiceStatus('idle');
      setVoiceInterimText('');
      // 講完停止錄音時，自動觸發「智慧修正錯別字與潤飾詞句」
      if (latestVoiceTextRef.current?.trim()) {
        handlePolishFrontendTranscript(latestVoiceTextRef.current, true);
      }
      return;
    }

    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isLineOrIosChrome = /Line\/|CriOS\/|FBIOS\//i.test(ua);
    const isNonHttpsRemote =
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (isNonHttpsRemote) {
      activateMobileKeyboardDictation(
        `🟢【手機鍵盤語音模式作用中】因目前為區網網址 (${window.location.origin})，手機規定僅 HTTPS 正式網址可開啟網頁麥克風；已自動為您點開下方文字框，請直接按「手機鍵盤右下角的 🎤 麥克風」說話（效果完全一樣且更準）！`
      );
      return;
    }

    if (!SpeechRec || isLineOrIosChrome) {
      activateMobileKeyboardDictation(
        '🟢【手機鍵盤語音模式作用中】偵測到您使用 LINE 或 iOS Chrome（Apple 限制網頁麥克風 API），已自動為您點開下方文字框：請直接點選「手機鍵盤右下角的 🎤 麥克風」說話（辨識最準確！），或點選「📂 選取手機錄音檔」！'
      );
      return;
    }

    sessionBaseTextRef.current = (voiceQuickText || '').trim();
    latestVoiceTextRef.current = voiceQuickText;
    wantVoiceListeningRef.current = true;
    setMobileVoiceHint('');
    setIsVoiceListening(true);
    setVoiceStatus('starting');
    setVoiceTimerSeconds(0);
    stopVoiceTimer();
    voiceTimerRef.current = setInterval(() => {
      setVoiceTimerSeconds((s) => s + 1);
    }, 1000);

    const rec = new SpeechRec();
    rec.lang = 'zh-TW';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      setVoiceStatus('listening');
    };

    rec.onaudiostart = () => {
      setVoiceStatus('listening');
    };

    rec.onresult = (event) => {
      setVoiceStatus('listening');
      const finalPieces = [];
      let interimChunk = '';
      for (let i = 0; i < event.results.length; i++) {
        const t = (event.results[i][0].transcript || '').trim();
        if (!t) continue;
        if (event.results[i].isFinal) {
          // 防止部分 Android 手機在 continuous 模式下回傳累積重複字串
          const prevPiece = finalPieces.length > 0 ? finalPieces[finalPieces.length - 1] : '';
          const cleanPrev = prevPiece.replace(/[。！？]$/, '');
          if (cleanPrev && t.startsWith(cleanPrev) && t.length >= cleanPrev.length) {
            finalPieces[finalPieces.length - 1] = /[。！？]$/.test(t) ? t : `${t}。`;
          } else if (t !== cleanPrev) {
            finalPieces.push(/[。！？]$/.test(t) ? t : `${t}。`);
          }
        } else {
          interimChunk += t;
        }
      }
      setVoiceInterimText(interimChunk);
      if (finalPieces.length > 0) {
        const sessionJoined = finalPieces.join('');
        const base = sessionBaseTextRef.current;
        const combined = base ? `${base}\n${sessionJoined}` : sessionJoined;
        setVoiceQuickText(combined);
        latestVoiceTextRef.current = combined;
      }
    };

    rec.onerror = (event) => {
      const errCode = event?.error || 'unknown';
      if (errCode === 'no-speech') {
        return;
      }
      wantVoiceListeningRef.current = false;
      stopVoiceTimer();
      setIsVoiceListening(false);
      setVoiceInterimText('');
      activateMobileKeyboardDictation(
        `🟢【已自動切換為手機鍵盤語音模式】您的手機瀏覽器回報網頁麥克風受限 (${errCode})，已為您點開下方文字框：請直接按「手機鍵盤右下角的 🎤 麥克風」說話，或點選「🎵 錄製語音檔 / 📂 選取手機錄音檔」！`
      );
    };

    rec.onend = () => {
      if (wantVoiceListeningRef.current) {
        try {
          sessionBaseTextRef.current = (latestVoiceTextRef.current || '').trim();
          rec.start();
          setVoiceStatus('listening');
        } catch {
          wantVoiceListeningRef.current = false;
          stopVoiceTimer();
          setIsVoiceListening(false);
          setVoiceStatus('paused');
          setVoiceInterimText('');
        }
      } else {
        stopVoiceTimer();
        setIsVoiceListening(false);
        setVoiceInterimText('');
      }
    };

    speechRecRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      wantVoiceListeningRef.current = false;
      stopVoiceTimer();
      setIsVoiceListening(false);
      activateMobileKeyboardDictation();
    }
  };

  const handleSaveFrontendDraftInbox = async () => {
    if (!voiceQuickText.trim() && frontendHandwrittenImages.length === 0 && !frontendAudioBase64) {
      alert('請先使用語音輸入、錄製/上傳手機錄音檔、輸入速記內容或上傳手寫稿照片後再暫存至雲端！');
      return;
    }
    setSavingFrontendDraftInbox(true);
    try {
      const res = await fetch('/api/draft-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_draft',
          category: staffDraftMeeting?.category || 'dept',
          meetingTitle: staffDraftMeeting?.title || '',
          date: staffDraftMeeting?.date || new Date().toISOString().slice(0, 10),
          createdBy: currentUser?.name || staffDraftMeeting?.recorder || '科內紀錄人',
          transcript: voiceQuickText,
          handwrittenImages: frontendHandwrittenImages.map((img) => ({
            id: img.id,
            name: img.name,
            mimeType: img.mimeType,
            dataUrl: img.dataUrl
          })),
          audioBase64: frontendAudioBase64,
          audioMimeType: frontendAudioMime,
          audioFileName: frontendAudioName
        })
      });
      if (res.status === 413) {
        alert('上傳的圖片或錄音檔總容量超過單次上限 (4.5MB)，請減少單次照片張數或分批上傳！');
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || '☁️ 已成功暫存至雲端草稿匣！回電腦打開 IDE 即可請 AI 直接抓取分析。');
      } else {
        alert(data.error || '暫存失敗');
      }
    } catch (err) {
      alert('暫存至雲端發生錯誤');
    } finally {
      setSavingFrontendDraftInbox(false);
    }
  };

  const handleRunFrontendAiStructuring = async () => {
    if (!voiceQuickText.trim() && frontendHandwrittenImages.length === 0 && !frontendAudioBase64) {
      alert('請先點選語音輸入說話、上傳手寫稿照片、上傳錄音檔，或在文字框輸入幾句會議重點！');
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
          meetingTitle: staffDraftMeeting.title || '',
          audioBase64: frontendAudioBase64,
          audioMimeType: frontendAudioMime,
          handwrittenImages: frontendHandwrittenImages.map((img) => ({
            base64: img.base64,
            mimeType: img.mimeType,
            name: img.name
          }))
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.result) {
        const r = data.result;
        if (data.correctedTranscript) {
          setVoiceQuickText(data.correctedTranscript);
          latestVoiceTextRef.current = data.correctedTranscript;
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
        showToast('✨ 已先自動校正與潤飾，並轉換填入下方議程、討論與決議！');
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
        const rawDataUrl = ev.target.result;
        if (isImg) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxW = 960;
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
            const compressedUrl = canvas.toDataURL('image/jpeg', 0.72);
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
          img.onerror = () => {
            setStaffDraftMeeting((prev) => ({
              ...prev,
              attachments: [
                ...(prev.attachments || []),
                {
                  id: `ATT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  title: file.name,
                  fileName: file.name,
                  mimeType: file.type || 'image/jpeg',
                  fileSize: file.size || 0,
                  url: rawDataUrl,
                  caption: `${currentUser?.name || ''} 上傳之會議照片`
                }
              ]
            }));
          };
          img.src = rawDataUrl;
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

  const handleSaveStaffMeeting = async (e, targetStatusOverride = null) => {
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

      const nextStatus =
        targetStatusOverride ||
        (modalMode === 'initiate' && !staffDraftMeeting.id
          ? 'in_progress'
          : staffDraftMeeting.status || 'in_progress');

      // 將上方「📷 上傳手寫稿」載入的圖片也一併合併存入會議附件 (attachments)，避免按「暫存紀錄資料」或「結束會議」時圖片遺失
      const existingAttachments = Array.isArray(staffDraftMeeting.attachments) ? staffDraftMeeting.attachments : [];
      const existingUrls = new Set(existingAttachments.map((a) => a.url));
      const handwrittenAsAttachments = (frontendHandwrittenImages || [])
        .filter((img) => img?.dataUrl && !existingUrls.has(img.dataUrl))
        .map((img, idx) => ({
          id: img.id || `ATT-HW-${Date.now()}-${idx}`,
          title: `手寫稿照片 - ${img.name || idx + 1}`,
          fileName: img.name || `handwritten_${idx + 1}.jpg`,
          mimeType: img.mimeType || 'image/jpeg',
          url: img.dataUrl,
          caption: `${currentUser?.name || ''} 上傳之手寫稿照片`
        }));

      const payloadMeeting = {
        ...staffDraftMeeting,
        title: staffDraftMeeting.title.trim(),
        status: nextStatus,
        rawTranscript: voiceQuickText || staffDraftMeeting.rawTranscript || '',
        attachments: [...existingAttachments, ...handwrittenAsAttachments],
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
      if (res.status === 413) {
        alert('本次上傳的圖片或附件總容量超過伺服器上限 (4.5MB)，請分批上傳或減少照片張數後再儲存！');
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        setFrontendHandwrittenImages([]);
        if (data.savedMeeting) {
          if (modalMode === 'initiate') {
            // STEP 1 發起完成後返回首頁列表，讓與會同仁可點選進去簽到，記錄人點選進去執行會議紀錄！
            setActiveZone('home');
            setActiveMeetingId(null);
          } else {
            // STEP 2 執行會議紀錄暫存或結束會議送審後，停留在該場會議檢視最新狀態
            setActiveMeetingId(data.savedMeeting.id);
            if (data.savedMeeting.isArchived) {
              setActiveZone('history');
            } else {
              setActiveZone('home');
            }
          }
        }
        setShowCreateModal(false);
        setStaffDraftMeeting(null);
        showToast(data.message || '✅ 會議資料已成功儲存！');
      } else {
        alert(data.error || '儲存會議紀錄失敗');
      }
    } catch (err) {
      alert('網路連線異常，請稍後再試');
    } finally {
      setSavingStaffMeeting(false);
    }
  };

  // STEP 2 ➔ STEP 3：記錄人完成會議後按「結束會議」（結束資料登錄，送交技術主任確認無誤後按公布）
  const handleFinishMeetingRecord = async (meeting) => {
    if (!meeting) return;
    setSavingStaffMeeting(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finish_meeting_record',
          id: meeting.id,
          recorderName: currentUser?.name || meeting.recorder
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        showToast(
          data.message || '🏁 已結束會議並完成資料登錄！正待技術主任確認無誤後按「公布」。'
        );
      } else {
        alert(data.error || '結束會議失敗');
      }
    } catch (err) {
      alert('網路連線異常');
    } finally {
      setSavingStaffMeeting(false);
    }
  };

  // STEP 3 ➔ STEP 4（或退回 STEP 2）：技術主任確認無誤按「公布」 OR 退回記錄人修改資料（保留已維護資料內容退回上一步）
  const handleDirectorReviewMeeting = async (meetingId, decision, customReason = null) => {
    let reasonText = customReason !== null ? customReason : directorReviewReason.trim();
    if (decision === 'return' && !reasonText) {
      const prompted = window.prompt(
        '請輸入退回記錄人修改的原因或補充說明（系統將完整保留所有已維護之會議紀錄內容退回上一步）：',
        '請記錄人補充或修正會議紀錄內容後，再次按結束會議送出確認'
      );
      if (prompted === null) return;
      reasonText = prompted.trim() || '請記錄人補充或修正會議紀錄內容後，再次送出確認';
    }

    setReviewSubmitting(true);
    try {
      const reviewerLabel = currentUser?.name
        ? `${currentUser.name}（${currentUser.title || '技術主任'}）`
        : '林宜蓁（技術主任）';
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'director_review_meeting',
          id: meetingId,
          decision,
          reviewerName: reviewerLabel,
          reason: reasonText
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        setDirectorReviewReason('');
        showToast(data.message);
      } else {
        alert(data.error || '審核操作失敗');
      }
    } catch (err) {
      alert('網路連線異常');
    } finally {
      setReviewSubmitting(false);
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
      case 'in_progress':
        return { label: '🟢 會議進行中（開放現場簽到 & 點選執行會議紀錄）', bg: '#dcfce7', color: '#15803d' };
      case 'returned':
        return { label: '🟠 技術主任退回修改中（已保留原維護資料內容）', bg: '#ffedd5', color: '#c2410c' };
      case 'pending_review':
      case 'pending_director':
      case 'pending_chair':
        return { label: '⏳ 已結束會議・待技術主任確認公布', bg: '#fef3c7', color: '#b45309' };
      case 'published':
      default:
        return { label: '✅ 技術主任已公布・開放查閱簽閱中', bg: '#d1fae5', color: '#065f46' };
    }
  };

  // 提取某場會議中含有關鍵字的所有命中段落明細（標註命中位置如 [議程]、[討論內容]、[決議事項]、[待辦事項] 等）
  const getMeetingSearchMatches = (m, kw) => {
    const tokens = String(kw || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return [];

    const candidates = [
      { section: '會議資訊', text: `${m.displayDate || m.date || ''} ｜ 地點：${m.location || ''} ｜ 主席：${m.chair || ''} ｜ 紀錄：${m.recorder || ''}` },
      ...(m.agendaItems || []).map((a) => ({ section: '議程', text: String(a || '') })),
      ...(m.discussionSections || []).flatMap((s) => [
        { section: '討論標題', text: String(s.heading || '') },
        ...(s.bullets || []).map((b) => ({ section: '討論內容', text: String(b || '') }))
      ]),
      ...(m.resolutions || []).map((r) => ({ section: '決議事項', text: String(r || '') })),
      ...(m.actionItems || []).map((a) => ({
        section: '待辦追蹤',
        text: `${a.assignee || ''}：${a.task || ''}（期限：${a.dueDate || '未定'}｜${a.status || ''}）`
      })),
      ...(m.attachments || []).map((att) => ({
        section: '會議附件',
        text: `${att.title || ''} (${att.fileName || att.category || ''})`
      })),
      {
        section: '出席與請假名單',
        text: `出席：${(m.presentStaffNames || []).join('、')}${
          (m.leaveStaffNames || []).length ? ` ｜ 請假/值班：${(m.leaveStaffNames || []).join('、')}` : ''
        }`
      }
    ];

    if (m.rawTranscript) {
      candidates.push({ section: '語音/手寫逐字稿', text: String(m.rawTranscript) });
    }

    return candidates.filter((c) => matchesAnyKeyword(c.text, kw));
  };

  const getSearchMatchSnippet = (m, kw) => {
    const matches = getMeetingSearchMatches(m, kw);
    return matches.length > 0 ? `[${matches[0].section}] ${matches[0].text}` : null;
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

  // 根據當前所在的專區 (`home` 或 `history`) 進行過濾；若使用者輸入搜尋關鍵字，僅檢索該同仁有權限查閱之會議（未公布前一般同仁無法搜尋未公開內容）
  const isSearchingKeyword = Boolean(searchQuery.trim());
  const baseZoneMeetings = isSearchingKeyword
    ? meetings.filter((m) => canViewMeetingMinutesContent(m, currentUser))
    : activeZone === 'home'
    ? homePendingMeetings
    : historyMeetingsAll;

  const visibleMeetings = baseZoneMeetings
    .filter((m) => {
      if (categoryFilter !== 'ALL' && m.category !== categoryFilter) {
        return false;
      }
      if ((activeZone === 'history' || isSearchingKeyword) && yearFilter !== 'ALL' && getRocYear(m) !== yearFilter) {
        return false;
      }
      if (isSearchingKeyword) {
        const fullCorpus = [
          m.title || '',
          m.date || '',
          m.displayDate || '',
          m.location || '',
          m.chair || '',
          m.recorder || '',
          JSON.stringify(m.agendaItems || []),
          JSON.stringify(m.discussionSections || []),
          JSON.stringify(m.resolutions || []),
          JSON.stringify(m.actionItems || []),
          JSON.stringify(m.presentStaffNames || []),
          JSON.stringify(m.leaveStaffNames || []),
          JSON.stringify((m.attachments || []).map((a) => `${a.title} ${a.fileName || ''}`)),
          m.rawTranscript || ''
        ].join(' ');
        return matchesAllKeywords(fullCorpus, searchQuery);
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

  // ==================== 專屬精簡畫面：QR Code 現場掃碼簽到（僅呈現會議名稱、選取簽到人員、簽到按鈕與已簽到狀態） ====================
  if (checkinMeetingId) {
    const checkinTargetMtg = meetings.find((m) => m.id === checkinMeetingId) || null;
    const selectedName = (selectedDropdownStaff || '').trim();
    const checkinRecord =
      selectedName && checkinTargetMtg
        ? checkinTargetMtg.checkins?.[selectedName] || checkinTargetMtg.signatures?.[selectedName] || null
        : null;
    const isAlreadyCheckedIn = Boolean(checkinRecord);
    const checkedInNames = checkinTargetMtg
      ? Array.from(
          new Set([
            ...Object.keys(checkinTargetMtg.checkins || {}),
            ...Object.keys(checkinTargetMtg.signatures || {})
          ])
        )
      : [];

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
        <div className="glass-panel" style={{ maxWidth: '440px', width: '100%', padding: '1.75rem 1.5rem' }}>
          {/* 1. 會議名稱 */}
          <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
            <span
              className="badge"
              style={{
                background: '#dcfce7',
                color: '#15803d',
                fontSize: '0.82rem',
                padding: '0.3rem 0.85rem',
                marginBottom: '0.6rem'
              }}
            >
              📲 會議現場簽到
            </span>
            <h1 style={{ fontSize: '1.35rem', color: '#0f172a', margin: '0.2rem 0 0.35rem 0', lineHeight: 1.4 }}>
              {checkinTargetMtg ? checkinTargetMtg.title : '找不到該場會議'}
            </h1>
            {checkinTargetMtg && (
              <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                {checkinTargetMtg.displayDate || `${checkinTargetMtg.date} ${checkinTargetMtg.time}`}
              </div>
            )}
          </div>

          {checkinTargetMtg && (
            <form onSubmit={handleQrMinimalCheckin}>
              {/* 2. 選取簽到人員 */}
              <div className="form-group" style={{ marginBottom: '1.15rem' }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.45rem' }}>
                  選取簽到人員
                </label>
                <select
                  value={selectedDropdownStaff}
                  onChange={(e) => {
                    setSelectedDropdownStaff(e.target.value);
                    setLoginError('');
                  }}
                  style={{
                    fontSize: '1.02rem',
                    fontWeight: 700,
                    padding: '0.75rem 0.9rem',
                    borderRadius: '10px',
                    border: '2px solid #2563eb'
                  }}
                >
                  <option value="">-- 請選擇您的姓名 --</option>
                  {activeStaffList.map((s) => {
                    const done = Boolean(
                      checkinTargetMtg.checkins?.[s.name] || checkinTargetMtg.signatures?.[s.name]
                    );
                    return (
                      <option key={s.id} value={s.name}>
                        {s.name}（{s.title}）{done ? ' ✓ 已簽到' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {loginError && (
                <div className="alert alert-error" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>
                  {loginError}
                </div>
              )}

              {/* 3. 簽到的按鈕 */}
              <button
                type="submit"
                disabled={signingLoading || !selectedName || isAlreadyCheckedIn}
                className="btn"
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  fontSize: '1.08rem',
                  fontWeight: 800,
                  borderRadius: '12px',
                  background: isAlreadyCheckedIn ? '#16a34a' : '#2563eb',
                  opacity: !selectedName ? 0.6 : 1
                }}
              >
                {signingLoading
                  ? '簽到處理中...'
                  : isAlreadyCheckedIn
                  ? `✅ ${selectedName} 已簽到`
                  : '📲 簽到'}
              </button>
            </form>
          )}

          {/* 4. 顯示已簽到狀態 */}
          {isAlreadyCheckedIn && (
            <div
              className="animate-fade-in"
              style={{
                marginTop: '1.15rem',
                padding: '1rem',
                borderRadius: '12px',
                background: '#ecfdf5',
                border: '2px solid #10b981',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#065f46' }}>
                ✅ {selectedName} 已完成簽到
              </div>
              {(checkinRecord?.checkedInAt || checkinRecord?.signedAt) && (
                <div style={{ fontSize: '0.82rem', color: '#047857', marginTop: '0.25rem' }}>
                  簽到時間：{new Date(checkinRecord.checkedInAt || checkinRecord.signedAt).toLocaleString('zh-TW')}
                </div>
              )}
            </div>
          )}

          {checkedInNames.length > 0 && (
            <div
              style={{
                marginTop: '1.15rem',
                paddingTop: '0.9rem',
                borderTop: '1px solid #e2e8f0',
                fontSize: '0.84rem',
                color: '#334155'
              }}
            >
              <div style={{ fontWeight: 700, color: '#065f46', marginBottom: '0.35rem' }}>
                ✅ 已簽到人員（{checkedInNames.length} 人）：
              </div>
              <div style={{ lineHeight: 1.6 }}>{checkedInNames.join('、')}</div>
            </div>
          )}

          {/* 右下角小連結：點選進入完整會議紀錄系統 */}
          <div style={{ marginTop: '1.1rem', textAlign: 'right' }}>
            <button
              type="button"
              onClick={() => {
                if (selectedName && !currentUser) {
                  const found = activeStaffList.find((s) => s.name === selectedName);
                  if (found) {
                    setCurrentUser(found);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('rad_mtg_staff_user', JSON.stringify(found));
                    }
                  }
                }
                setCheckinMeetingId(null);
                setActiveMeetingId(null);
                if (typeof window !== 'undefined' && window.history?.replaceState) {
                  window.history.replaceState({}, '', '/');
                }
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '0.2rem 0.3rem'
              }}
            >
              進入會議紀錄系統 →
            </button>
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
            onClick={() => openStaffMeetingCreator(null, 'initiate')}
            className="btn btn-success"
            style={{ padding: '0.52rem 1rem', fontSize: '0.9rem' }}
          >
            <Plus size={17} /> ➕ 發起新會議
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
              onClick={() => openStaffMeetingCreator(null, 'initiate')}
              className="btn btn-success"
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.84rem' }}
            >
              <Plus size={15} /> ➕ 發起新會議
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

        {/* 2. 歷史與全庫會議紀錄內容全文搜尋框 */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
            <input
              type="text"
              placeholder="🔍 搜尋歷史會議紀錄關鍵字（支援多關鍵字空白分隔，如：EPA、ACR假體、換管球、GE高階CT、乳房攝影、實習生...）"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (activeMeetingId) setActiveMeetingId(null);
              }}
              style={{
                paddingLeft: '1rem',
                fontSize: '0.92rem',
                border: searchQuery.trim() ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                background: searchQuery.trim() ? '#faf5ff' : '#ffffff'
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
              ✕ 清除搜尋
            </button>
          )}
        </div>

        {/* 常用歷史關鍵字快速點選標籤 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b' }}>🔥 常用歷史關鍵字快速查找：</span>
          {['EPA', 'ACR假體', '換管球', 'GE高階CT', '乳房攝影', '輻射防護', '實習生', '品保', '當責 Q10'].map((kw) => {
            const activeKw = searchQuery.trim().toLowerCase() === kw.toLowerCase();
            return (
              <button
                key={kw}
                type="button"
                onClick={() => {
                  setSearchQuery(activeKw ? '' : kw);
                  setActiveMeetingId(null);
                }}
                style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '999px',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: activeKw ? '1px solid #7c3aed' : '1px solid #cbd5e1',
                  background: activeKw ? '#7c3aed' : '#f8fafc',
                  color: activeKw ? '#ffffff' : '#475569'
                }}
              >
                #{kw}
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================== 乾淨的「會議清單模式」 vs 點進去才顯示的「會議紀錄內容模式」 ==================== */}
      {!activeMeeting ? (
        activeZone === 'home' && homePendingMeetings.length === 0 && !isSearchingKeyword ? (
          <div className="glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <CheckCircle2 size={54} color="#059669" style={{ marginBottom: '0.75rem' }} />
            <h2 style={{ fontSize: '1.45rem', color: '#065f46', marginBottom: '0.5rem' }}>
              🎉 太棒了！{currentUser.name}，您目前已無任何待簽閱的會議紀錄！
            </h2>
            <p className="subtitle" style={{ maxWidth: '560px', margin: '0 auto 1.4rem auto' }}>
              所有您已簽認過的會議紀錄以及歷年歸檔會議（共 <strong>{historyMeetingsAll.length}</strong> 筆），皆已自動收納於「<strong>📚 歷史紀錄專區</strong>」，您也可以直接在上方搜尋框輸入關鍵字查找任何一份歷史會議紀錄！
            </p>
            <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => openStaffMeetingCreator(null, 'initiate')}
                className="btn btn-success"
                style={{ padding: '0.85rem 1.6rem', fontSize: '1.02rem' }}
              >
                <Plus size={19} /> ➕ 發起新會議（開啟現場簽到）
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
          /* 首頁／歷史專區／關鍵字檢索結果列表，點選整列即可開啟完整會議紀錄 */
          <div className="no-print animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', padding: '0 0.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: isSearchingKeyword ? '#5b21b6' : '#334155' }}>
                {isSearchingKeyword
                  ? `🔍 歷史與全庫會議關鍵字「${searchQuery}」搜尋結果（共找到 ${visibleMeetings.length} 份會議紀錄，點選即可開啟該份紀錄）：`
                  : activeZone === 'home'
                  ? `✍️ 待您簽閱的會議清單（共 ${visibleMeetings.length} 筆，點選列即可開啟）：`
                  : `📚 歷史紀錄專區列表（共 ${visibleMeetings.length} 筆，點選列即可開啟會議紀錄）：`}
              </div>
            </div>

            {visibleMeetings.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: '2.5rem' }}>
                找不到含有關鍵字「<strong>{searchQuery || '目前分類'}</strong>」的會議紀錄，請嘗試其他關鍵字或點擊「清除搜尋」
              </div>
            ) : (
              <div
                style={{
                  background: '#ffffff',
                  border: isSearchingKeyword ? '2px solid #a855f7' : '1px solid #cbd5e1',
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
                    background: isSearchingKeyword ? '#faf5ff' : '#f8fafc',
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
                    會議紀錄標題 {isSearchingKeyword && '（含關鍵字命中段落明細）'}
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

                {/* 列表每一列（分類、標題與流程狀態／關鍵字命中段落明細、已簽核/未簽核顏色與數字、時間） */}
                {visibleMeetings.map((m, idx) => {
                  const cat = getCategoryBadge(m.category);
                  const searchMatches = isSearchingKeyword ? getMeetingSearchMatches(m, searchQuery) : [];
                  const signedMap = m.signatures || {};
                  const checkinsMap = m.checkins || {};
                  const isSignedByMe = Boolean(currentUser && signedMap[currentUser.name]);
                  const isCheckedInByMe = Boolean(currentUser && checkinsMap[currentUser.name]);
                  const checkinCount = Object.keys(checkinsMap).length;
                  const signedCount = Object.keys(signedMap).length;
                  const inServiceNames = staffList.filter((s) => s.status === '在職').map((s) => s.name);
                  const targetPool =
                    m.isArchived && (m.reopenedForStaff || []).length === 0
                      ? Array.from(new Set([...(m.presentStaffNames || []), ...Object.keys(signedMap)]))
                      : Array.from(new Set([...inServiceNames, ...(m.presentStaffNames || [])]));
                  const unsignedCount = Math.max(0, targetPool.filter((n) => !signedMap[n]).length);
                  const isPendingTechReview =
                    m.status === 'pending_review' || m.status === 'pending_chair' || m.status === 'pending_director';

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
                        background:
                          m.status === 'returned'
                            ? '#fff7ed'
                            : m.status === 'in_progress'
                            ? '#f0fdf4'
                            : isPendingTechReview
                            ? '#fffbeb'
                            : '#ffffff',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          m.status === 'returned'
                            ? '#fff7ed'
                            : m.status === 'in_progress'
                            ? '#f0fdf4'
                            : isPendingTechReview
                            ? '#fffbeb'
                            : '#ffffff';
                      }}
                    >
                      {/* 1. 分類 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
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
                        {isSearchingKeyword && (
                          <span style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 700, paddingLeft: '0.2rem' }}>
                            {getRocYear(m)}年度・{m.isArchived || isSignedByMe ? '📚歷史紀錄' : '✍️待簽閱'}
                          </span>
                        )}
                      </div>

                      {/* 2. 標題（附帶流程狀態標籤及關鍵字命中段落明細預覽） */}
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
                              background:
                                m.status === 'in_progress'
                                  ? '#16a34a'
                                  : m.status === 'returned'
                                  ? '#ea580c'
                                  : isPendingTechReview
                                  ? '#d97706'
                                  : isSignedByMe
                                  ? '#10b981'
                                  : '#ef4444',
                              display: 'inline-block',
                              flexShrink: 0
                            }}
                            title={getStatusBadge(m).label}
                          />
                          <HighlightText text={m.title} keyword={searchQuery} />

                          {/* 流程狀態醒目標籤 */}
                          {m.status === 'in_progress' && (
                            <>
                              <span
                                className="badge"
                                style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.74rem', padding: '0.16rem 0.55rem' }}
                              >
                                🟢 會議進行中（開放現場簽到）
                              </span>
                              {isCheckedInByMe && (
                                <span
                                  className="badge"
                                  style={{ background: '#d1fae5', color: '#065f46', fontSize: '0.72rem', padding: '0.14rem 0.5rem' }}
                                >
                                  ✅ 您已現場簽到
                                </span>
                              )}
                              {isRecorderOrInitiator(m, currentUser) && (
                                <span
                                  className="badge"
                                  style={{ background: '#2563eb', color: '#ffffff', fontSize: '0.73rem', padding: '0.16rem 0.55rem' }}
                                >
                                  📝 點此進入執行會議紀錄
                                </span>
                              )}
                            </>
                          )}

                          {m.status === 'returned' && (
                            <span
                              className="badge"
                              style={{ background: '#ea580c', color: '#ffffff', fontSize: '0.74rem', padding: '0.16rem 0.55rem' }}
                            >
                              🟠 技術主任退回修改（點此修改已保留之資料）
                            </span>
                          )}

                          {isPendingTechReview && (
                            <>
                              <span
                                className="badge"
                                style={{ background: '#fef3c7', color: '#b45309', fontSize: '0.74rem', padding: '0.16rem 0.55rem' }}
                              >
                                ⏳ 已結束會議・待技術主任確認公布
                              </span>
                              {isTechDirectorOrSupervisor(currentUser) && (
                                <span
                                  className="badge"
                                  style={{ background: '#7c3aed', color: '#ffffff', fontSize: '0.73rem', padding: '0.16rem 0.55rem' }}
                                >
                                  🛡️ 點此審核公布／退回修改
                                </span>
                              )}
                            </>
                          )}

                          {isSearchingKeyword && searchMatches.length > 0 && (
                            <span
                              className="badge"
                              style={{
                                background: '#ede9fe',
                                color: '#5b21b6',
                                fontSize: '0.72rem',
                                padding: '0.12rem 0.48rem'
                              }}
                            >
                              🎯 命中 {searchMatches.length} 處內文
                            </span>
                          )}
                        </div>
                        {m.status === 'returned' && m.returnReason && (
                          <div
                            style={{
                              marginTop: '0.35rem',
                              fontSize: '0.8rem',
                              color: '#9a3412',
                              background: '#ffedd5',
                              border: '1px solid #fdba74',
                              padding: '0.28rem 0.6rem',
                              borderRadius: '6px',
                              fontWeight: 600
                            }}
                          >
                            ↩️ 技術主任退回修改說明：{m.returnReason}
                          </div>
                        )}
                        {isSearchingKeyword && searchMatches.length > 0 && (
                          <div
                            style={{
                              marginTop: '0.4rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.25rem'
                            }}
                          >
                            {searchMatches.slice(0, 4).map((hit, hIdx) => (
                              <div
                                key={hIdx}
                                style={{
                                  fontSize: '0.8rem',
                                  color: '#334155',
                                  background: '#fefce8',
                                  border: '1px solid #fef08a',
                                  padding: '0.26rem 0.55rem',
                                  borderRadius: '6px',
                                  lineHeight: 1.45
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 800,
                                    color: '#7c3aed',
                                    marginRight: '0.35rem',
                                    fontSize: '0.75rem'
                                  }}
                                >
                                  [{hit.section}]
                                </span>
                                <HighlightText text={hit.text} keyword={searchQuery} />
                              </div>
                            ))}
                            {searchMatches.length > 4 && (
                              <div style={{ fontSize: '0.75rem', color: '#6d28d9', fontWeight: 600, paddingLeft: '0.2rem' }}>
                                ＋ 還有 {searchMatches.length - 4} 處命中內容，點擊此列開啟完整會議紀錄查看...
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 3. 已簽核 / 未簽核（進行中顯示現場簽到人數；已公布顯示已簽核/未簽核人數） */}
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem' }}>
                        {m.status && m.status !== 'published' ? (
                          <span
                            style={{
                              background: m.status === 'in_progress' ? '#dcfce7' : '#fef3c7',
                              color: m.status === 'in_progress' ? '#15803d' : '#b45309',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                              padding: '0.22rem 0.65rem',
                              borderRadius: '999px',
                              textAlign: 'center',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {m.status === 'in_progress'
                              ? `📲 現場簽到 ${checkinCount} 人`
                              : m.status === 'returned'
                              ? '🟠 待記錄人修改'
                              : '⏳ 待主任公布'}
                          </span>
                        ) : (
                          <>
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
                          </>
                        )}
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
              marginBottom: '1rem',
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
              {(activeMeeting.status === 'in_progress' || activeMeeting.status === 'returned') && (
                <button
                  type="button"
                  onClick={() => openFrontendQrModal(activeMeeting)}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 0.9rem', fontSize: '0.86rem', background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }}
                >
                  <QrCode size={16} /> 現場簽到 QR Code
                </button>
              )}

              {(activeMeeting.status === 'in_progress' || activeMeeting.status === 'returned') &&
                isRecorderOrInitiator(activeMeeting, currentUser) && (
                  <>
                    <button
                      type="button"
                      onClick={() => openStaffMeetingCreator(activeMeeting, 'record')}
                      className="btn"
                      style={{
                        padding: '0.5rem 0.95rem',
                        fontSize: '0.86rem',
                        background: activeMeeting.status === 'returned' ? '#ea580c' : '#2563eb'
                      }}
                    >
                      <Edit3 size={16} />{' '}
                      {activeMeeting.status === 'returned'
                        ? '✏️ 修改會議紀錄資料（已保留原維護內容）'
                        : '📝 進入執行會議紀錄'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFinishMeetingRecord(activeMeeting)}
                      disabled={savingStaffMeeting}
                      className="btn btn-purple"
                      style={{ padding: '0.5rem 0.95rem', fontSize: '0.86rem' }}
                    >
                      <CheckCircle2 size={16} /> 🏁 結束會議（完成登錄送技術主任確認）
                    </button>
                  </>
                )}

              {(!activeMeeting.status || activeMeeting.status === 'published') && (
                <>
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
                    onClick={() => {
                      setSigPadMode('sign');
                      setShowSigPad(!showSigPad);
                    }}
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
                  {isRecorderOrInitiator(activeMeeting, currentUser) && (
                    <button
                      type="button"
                      onClick={() => openStaffMeetingCreator(activeMeeting, 'record')}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 0.9rem', fontSize: '0.86rem', color: '#1e40af', borderColor: '#93c5fd', background: '#eff6ff' }}
                    >
                      <Edit3 size={16} /> 編輯此會議 / 改標題
                    </button>
                  )}
                </>
              )}

              {canViewMeetingMinutesContent(activeMeeting, currentUser) && (
                <>
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
                </>
              )}
            </div>
          </div>

          {/* ==================== 會議標準作業流程 4 階段進度條 ==================== */}
          {(() => {
            const st = activeMeeting.status || 'published';
            const isPendingRev = st === 'pending_review' || st === 'pending_chair' || st === 'pending_director';
            const steps = [
              {
                num: '1',
                title: '發起會議 & 現場簽到',
                desc: '建立會議場次，開放與會人員先簽到',
                done: true,
                active: st === 'in_progress'
              },
              {
                num: '2',
                title: '執行會議紀錄 & 結束會議',
                desc: st === 'returned' ? '🟠 主任退回修改中(保留原資料)' : '點選進去做會議紀錄，完成後結束會議',
                done: isPendingRev || st === 'published',
                active: st === 'in_progress' || st === 'returned',
                isReturned: st === 'returned'
              },
              {
                num: '3',
                title: '待技術主任確認公布',
                desc: '確認無誤按公布；如需修改退回記錄人',
                done: st === 'published',
                active: isPendingRev
              },
              {
                num: '4',
                title: '正式公布 & 全科查閱',
                desc: '公布後其他人員方能查閱與簽認',
                done: st === 'published',
                active: st === 'published'
              }
            ];

            return (
              <div
                className="no-print"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '0.6rem',
                  marginBottom: '1.15rem',
                  background: '#f8fafc',
                  padding: '0.85rem',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1'
                }}
              >
                {steps.map((s) => (
                  <div
                    key={s.num}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      background: s.isReturned
                        ? '#fff7ed'
                        : s.active
                        ? '#eff6ff'
                        : s.done
                        ? '#f0fdf4'
                        : '#ffffff',
                      border: s.isReturned
                        ? '2px solid #ea580c'
                        : s.active
                        ? '2px solid #2563eb'
                        : s.done
                        ? '1px solid #86efac'
                        : '1px solid #e2e8f0'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.86rem', color: s.isReturned ? '#c2410c' : s.active ? '#1d4ed8' : s.done ? '#15803d' : '#64748b' }}>
                      <span
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.76rem',
                          background: s.isReturned ? '#ea580c' : s.active ? '#2563eb' : s.done ? '#16a34a' : '#cbd5e1',
                          color: '#ffffff'
                        }}
                      >
                        {s.done && !s.active ? '✓' : s.num}
                      </span>
                      <span>STEP {s.num}・{s.title}</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.25rem', paddingLeft: '1.75rem' }}>
                      {s.desc}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ==================== STAGE 1 & 2 (in_progress)：現場出席簽到專區 ＆ 記錄人執行會議紀錄控制台 ==================== */}
          {activeMeeting.status === 'in_progress' && (
            <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem', marginBottom: '1.25rem' }}>
              {/* A. 全體與會人員：現場出席簽到區 */}
              {(() => {
                const myCheckin = activeMeeting.checkins?.[currentUser.name] || null;
                const checkinList = Object.values(activeMeeting.checkins || {});
                return (
                  <div
                    style={{
                      background: myCheckin ? '#ecfdf5' : '#f0fdf4',
                      border: myCheckin ? '2px solid #10b981' : '2px solid #22c55e',
                      borderRadius: '14px',
                      padding: '1.15rem 1.25rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div>
                        <span className="badge" style={{ background: '#16a34a', color: '#ffffff', marginBottom: '0.3rem' }}>
                          🟢 會議進行中・STEP 1 現場出席簽到
                        </span>
                        <h3 style={{ margin: 0, fontSize: '1.12rem', color: '#065f46' }}>
                          {myCheckin
                            ? `✅ ${currentUser.name}，您已完成本場會議【現場出席簽到】！`
                            : `📲 ${currentUser.name}，本場會議已發起，請先點選完成【現場出席簽到】`}
                        </h3>
                        {myCheckin && (
                          <div style={{ fontSize: '0.84rem', color: '#047857', marginTop: '0.25rem' }}>
                            {`簽到方式：${myCheckin.method} ｜ 簽到時間：${new Date(myCheckin.checkedInAt).toLocaleString('zh-TW')}`}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {!myCheckin && (
                          <button
                            type="button"
                            disabled={signingLoading}
                            onClick={() => handleSignMeeting(activeMeeting.id, 'checkin', null, '現場出席簽到')}
                            className="btn btn-success"
                            style={{ padding: '0.6rem 1.15rem', fontSize: '0.92rem' }}
                          >
                            <UserCheck size={18} /> 📲 立即完成現場出席簽到
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSigPadMode('checkin');
                            setShowSigPad(true);
                          }}
                          className="btn"
                          style={{ background: '#0f766e', padding: '0.6rem 1rem', fontSize: '0.88rem' }}
                        >
                          <PenTool size={16} /> {myCheckin ? '更新手寫簽到簽名' : '✍️ 手寫電子簽名簽到'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openFrontendQrModal(activeMeeting)}
                          className="btn btn-secondary"
                          style={{ padding: '0.6rem 0.95rem', fontSize: '0.86rem', background: '#ffffff', color: '#15803d', borderColor: '#86efac' }}
                        >
                          <QrCode size={16} /> 顯示簽到 QR Code
                        </button>
                      </div>
                    </div>

                    {checkinList.length > 0 && (
                      <div style={{ marginTop: '0.8rem', paddingTop: '0.7rem', borderTop: '1px dashed #86efac', fontSize: '0.83rem', color: '#065f46' }}>
                        <strong>🙌 目前已完成現場簽到同仁（{checkinList.length} 人）：</strong>
                        {checkinList.map((c) => c.name).join('、')}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* B. 記錄人 / 發起人 / 主席 / 主任專屬：點選進入執行會議紀錄 & 完成會議後結束會議 */}
              {isRecorderOrInitiator(activeMeeting, currentUser) && (
                <div
                  style={{
                    background: '#eff6ff',
                    border: '2px solid #2563eb',
                    borderRadius: '14px',
                    padding: '1.15rem 1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.85rem'
                  }}
                >
                  <div style={{ flex: '1 1 320px' }}>
                    <span className="badge" style={{ background: '#2563eb', color: '#ffffff', marginBottom: '0.3rem' }}>
                      📝 STEP 2・執行會議紀錄與結束資料登錄（記錄人：{activeMeeting.recorder}）
                    </span>
                    <h3 style={{ margin: 0, fontSize: '1.12rem', color: '#1e3a8a' }}>
                      點選「📝 進入執行會議紀錄」開始語音轉譯／登錄內容；完成會議後請按「🏁 結束會議」
                    </h3>
                    <div style={{ fontSize: '0.84rem', color: '#334155', marginTop: '0.25rem' }}>
                      會議進行期間可隨時暫存紀錄資料；當會議結束、按下「<strong>🏁 結束會議</strong>」後即結束資料登錄，並送交<strong>技術主任確認無誤後按「公布」</strong>。
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => openStaffMeetingCreator(activeMeeting, 'record')}
                      className="btn"
                      style={{ background: '#2563eb', padding: '0.68rem 1.25rem', fontSize: '0.95rem' }}
                    >
                      <Edit3 size={18} /> 📝 點此進入執行會議紀錄（語音轉譯／手寫稿／議程決議）
                    </button>
                    <button
                      type="button"
                      disabled={savingStaffMeeting}
                      onClick={() => handleFinishMeetingRecord(activeMeeting)}
                      className="btn btn-purple"
                      style={{ padding: '0.68rem 1.25rem', fontSize: '0.95rem' }}
                    >
                      <CheckCircle2 size={18} /> 🏁 結束會議（完成資料登錄，送技術主任確認）
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== STAGE 2-RETURNED (returned)：技術主任退回記錄人修改資料（保留已維護資料內容退回上一步） ==================== */}
          {activeMeeting.status === 'returned' && isRecorderOrInitiator(activeMeeting, currentUser) && (
            <div
              className="no-print"
              style={{
                background: '#fff7ed',
                border: '2.5px solid #ea580c',
                borderRadius: '14px',
                padding: '1.2rem 1.3rem',
                marginBottom: '1.25rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem' }}>
                <div style={{ flex: '1 1 320px' }}>
                  <span className="badge" style={{ background: '#ea580c', color: '#ffffff', marginBottom: '0.35rem' }}>
                    🟠 技術主任退回修改中（已 100% 保留原維護資料內容退回上一步）
                  </span>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#9a3412' }}>
                    ↩️ 退回修改通知（退回主管：{activeMeeting.returnedBy || '林宜蓁 技術主任'}）
                  </h3>
                  <div
                    style={{
                      marginTop: '0.45rem',
                      padding: '0.55rem 0.85rem',
                      background: '#ffedd5',
                      border: '1px solid #fdba74',
                      borderRadius: '8px',
                      color: '#7c2d12',
                      fontWeight: 700,
                      fontSize: '0.9rem'
                    }}
                  >
                    💬 需修改事項說明：{activeMeeting.returnReason || '請補充或修正會議紀錄資料後重新送交技術主任確認'}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#9a3412', marginTop: '0.35rem' }}>
                    💡 系統已完整保留您先前維護的所有議程、討論內容、決議、待辦事項、語音逐字稿與附件。請點選右側「<strong>✏️ 修改會議紀錄資料</strong>」修正後，再次按「<strong>🏁 修改完成・重送技術主任確認</strong>」！
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => openStaffMeetingCreator(activeMeeting, 'record')}
                    className="btn"
                    style={{ background: '#ea580c', padding: '0.68rem 1.25rem', fontSize: '0.95rem' }}
                  >
                    <Edit3 size={18} /> ✏️ 修改會議紀錄資料（已保留已維護資料內容）
                  </button>
                  <button
                    type="button"
                    disabled={savingStaffMeeting}
                    onClick={() => handleFinishMeetingRecord(activeMeeting)}
                    className="btn btn-purple"
                    style={{ padding: '0.68rem 1.25rem', fontSize: '0.95rem' }}
                  >
                    <CheckCircle2 size={18} /> 🏁 修改完成・結束登錄並重送技術主任確認
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== STAGE 3 (pending_review)：待技術主任確認無誤後按「公布」或「退回記錄人修改」 ==================== */}
          {(activeMeeting.status === 'pending_review' ||
            activeMeeting.status === 'pending_chair' ||
            activeMeeting.status === 'pending_director') && (
            <div className="no-print" style={{ marginBottom: '1.25rem' }}>
              {isTechDirectorOrSupervisor(currentUser) ? (
                <div
                  style={{
                    background: '#faf5ff',
                    border: '2.5px solid #7c3aed',
                    borderRadius: '14px',
                    padding: '1.25rem 1.35rem'
                  }}
                >
                  <div style={{ marginBottom: '0.85rem' }}>
                    <span className="badge" style={{ background: '#7c3aed', color: '#ffffff', marginBottom: '0.35rem' }}>
                      🛡️ STEP 3・技術主任審核確認專區（目前審核主管：{currentUser.name} {currentUser.title}）
                    </span>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#3b0764' }}>
                      記錄人（{activeMeeting.recorder}）已完成會議並結束資料登錄，請確認下方會議紀錄內容是否無誤：
                    </h3>
                    <div style={{ fontSize: '0.84rem', color: '#4c1d95', marginTop: '0.25rem' }}>
                      • 確認無誤後請按「<strong>✅ 確認無誤・正式公布</strong>」，其他人員才能開始查閱與簽閱本份會議紀錄。<br />
                      • 如需修改請於下方輸入修改說明並按「<strong>↩️ 退回記錄人修改資料</strong>」（系統將完整保留已維護資料內容退回上一步供記錄人修改）。
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={directorReviewReason}
                      onChange={(e) => setDirectorReviewReason(e.target.value)}
                      placeholder="輸入審核批示或退回修改說明（如退回記錄人修改，請填寫需修改或補充之處）..."
                      style={{ flex: '1 1 280px', background: '#ffffff', borderColor: '#c4b5fd' }}
                    />
                    <button
                      type="button"
                      disabled={reviewSubmitting}
                      onClick={() => handleDirectorReviewMeeting(activeMeeting.id, 'publish')}
                      className="btn btn-success"
                      style={{ padding: '0.68rem 1.3rem', fontSize: '0.95rem' }}
                    >
                      <CheckCircle2 size={18} /> ✅ 確認無誤・正式公布（開放其他人員查閱）
                    </button>
                    <button
                      type="button"
                      disabled={reviewSubmitting}
                      onClick={() => handleDirectorReviewMeeting(activeMeeting.id, 'return')}
                      className="btn btn-danger"
                      style={{ padding: '0.68rem 1.2rem', fontSize: '0.92rem', background: '#ea580c' }}
                    >
                      <RotateCcw size={17} /> ↩️ 退回記錄人修改資料（保留已維護內容退回上一步）
                    </button>
                    <button
                      type="button"
                      onClick={() => openStaffMeetingCreator(activeMeeting, 'record')}
                      className="btn btn-secondary"
                      style={{ padding: '0.65rem 1rem', fontSize: '0.86rem' }}
                    >
                      <Edit3 size={16} /> 主任直接微調內容
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '2px solid #f59e0b',
                    borderRadius: '14px',
                    padding: '1.1rem 1.25rem',
                    color: '#92400e'
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '1.02rem', marginBottom: '0.25rem' }}>
                    ⏳ 已結束會議並完成資料登錄 — 目前待「技術主任（林宜蓁）」確認無誤後按「公布」
                  </div>
                  <div style={{ fontSize: '0.86rem', lineHeight: 1.55 }}>
                    本場會議已由記錄人（<strong>{activeMeeting.recorder}</strong>）結束資料登錄。待技術主任確認無誤並按「<strong>公布</strong>」後，其他人員方能查閱本份會議紀錄；若技術主任退回修改，系統將完整保留您已維護的資料內容退回上一步供您修改。
                  </div>
                </div>
              )}
            </div>
          )}

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

              {!canViewMeetingMinutesContent(activeMeeting, currentUser) ? (
                <div
                  className="card no-print"
                  style={{
                    background: '#fffbeb',
                    border: '2px dashed #f59e0b',
                    borderRadius: '14px',
                    padding: '1.4rem 1.35rem',
                    textAlign: 'center',
                    marginBottom: '1.4rem'
                  }}
                >
                  <Clock size={34} color="#d97706" style={{ marginBottom: '0.4rem' }} />
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#92400e' }}>
                    🔒 會議紀錄內容尚未公布（待技術主任確認無誤後開放其他人員查閱）
                  </h3>
                </div>
              ) : (
                <>
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

                  {/* ==================== STEP 4 技術主任已公布後：同仁手機查閱簽認與手寫電子簽名專區 ==================== */}
                  {(!activeMeeting.status || activeMeeting.status === 'published') && (
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
                              : `✍️ ${currentUser.name}，請確認簽閱本場已公布之會議紀錄（簽完即自動移入歷史紀錄專區）`}
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
                            onClick={() => {
                              setSigPadMode('sign');
                              setShowSigPad(!showSigPad);
                            }}
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
                  )}
                </>
              )}

              {/* 彈出式手寫電子簽名板視窗（支援「現場出席簽到 checkin」與「會後查閱簽認 sign」） */}
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
                          <PenTool size={20} />{' '}
                          {sigPadMode === 'checkin'
                            ? `📲 現場出席簽到手寫簽名板（${currentUser.name}）`
                            : `✍️ 會議紀錄查閱手寫簽名板（${currentUser.name}）`}
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
                      <label style={{ fontSize: '0.85rem' }}>
                        💬 {sigPadMode === 'checkin' ? '簽到備註（選填，預設為「現場出席簽到」）' : '簽閱意見或回饋（選填，預設為「已詳閱會議紀錄」）'}：
                      </label>
                      <input
                        type="text"
                        placeholder={sigPadMode === 'checkin' ? '例如：準時出席...' : '例如：已閱，配合辦理相關事項...'}
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
                          handleSignMeeting(
                            activeMeeting.id,
                            sigPadMode,
                            sigUrl,
                            signComment || (sigPadMode === 'checkin' ? '現場出席簽到' : '已詳閱會議紀錄')
                          );
                        }}
                        className="btn btn-success"
                        style={{ padding: '0.65rem 1.35rem', fontSize: '0.95rem' }}
                      >
                        <CheckCircle2 size={18} />{' '}
                        {sigPadMode === 'checkin' ? '儲存手寫簽名並完成現場簽到' : '儲存手寫簽名並移入歷史專區'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 已簽到 / 已簽閱人員名單一覽 */}
              <div>
                <h3 style={{ fontSize: '1.05rem', color: '#1e3a8a', borderBottom: '2px solid #dbeafe', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
                  陸、全科同仁現場簽到與紀錄簽閱明細（現場簽到 {Object.keys(activeMeeting.checkins || {}).length} 人 ／ 會後簽閱 {Object.keys(activeMeeting.signatures || {}).length} 人）
                </h3>
                {(() => {
                  const combinedRecords = [
                    ...Object.values(activeMeeting.signatures || {}).map((s) => ({ ...s, recordType: 'sign' })),
                    ...Object.values(activeMeeting.checkins || {})
                      .filter((c) => !activeMeeting.signatures?.[c.name])
                      .map((c) => ({ ...c, signedAt: c.checkedInAt, recordType: 'checkin' }))
                  ];
                  return (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: '0.6rem'
                      }}
                    >
                      {combinedRecords.map((sig, idx) => (
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
                            <span
                              className="badge"
                              style={{
                                background: sig.recordType === 'checkin' ? '#dcfce7' : '#d1fae5',
                                color: sig.recordType === 'checkin' ? '#15803d' : '#065f46',
                                fontSize: '0.72rem'
                              }}
                            >
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
                  );
                })()}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.8rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <span
                  className="badge"
                  style={{
                    background: modalMode === 'initiate' ? '#dcfce7' : staffDraftMeeting.status === 'returned' ? '#ffedd5' : '#dbeafe',
                    color: modalMode === 'initiate' ? '#15803d' : staffDraftMeeting.status === 'returned' ? '#c2410c' : '#1e40af',
                    marginBottom: '0.25rem'
                  }}
                >
                  {modalMode === 'initiate'
                    ? `STEP 1・發起人員：${currentUser?.name}（${currentUser?.title}）`
                    : staffDraftMeeting.status === 'returned'
                    ? `🟠 技術主任退回修改（已完整保留原維護資料）｜記錄人：${staffDraftMeeting.recorder}`
                    : `STEP 2・執行會議紀錄｜記錄人：${staffDraftMeeting.recorder || currentUser?.name}`}
                </span>
                <h2 style={{ margin: 0, fontSize: '1.28rem', color: '#0f172a' }}>
                  {modalMode === 'initiate'
                    ? '➕ 發起新會議（開啟現場出席簽到）'
                    : staffDraftMeeting.status === 'returned'
                    ? `✏️ 修改會議紀錄資料：${staffDraftMeeting.title}`
                    : `📝 執行會議紀錄（語音轉譯 & 資料登錄）：${staffDraftMeeting.title}`}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {modalMode === 'initiate' ? (
                  <button
                    type="button"
                    onClick={(e) => handleSaveStaffMeeting(e, 'in_progress')}
                    disabled={savingStaffMeeting}
                    className="btn btn-success"
                  >
                    <Save size={16} /> {savingStaffMeeting ? '發起中...' : '🚀 確認發起會議（開放現場簽到）'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(e) =>
                        handleSaveStaffMeeting(
                          e,
                          staffDraftMeeting.status === 'returned'
                            ? 'returned'
                            : staffDraftMeeting.status === 'published'
                            ? 'published'
                            : 'in_progress'
                        )
                      }
                      disabled={savingStaffMeeting}
                      className="btn"
                      style={{ background: '#2563eb' }}
                    >
                      <Save size={16} /> {savingStaffMeeting ? '儲存中...' : '💾 暫存紀錄資料（稍後繼續）'}
                    </button>
                    {staffDraftMeeting.status !== 'published' && (
                      <button
                        type="button"
                        onClick={(e) => handleSaveStaffMeeting(e, 'pending_review')}
                        disabled={savingStaffMeeting}
                        className="btn btn-purple"
                      >
                        <CheckCircle2 size={16} /> 🏁 結束會議（完成登錄送技術主任確認）
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  ✕ 關閉
                </button>
              </div>
            </div>

            {modalMode === 'initiate' && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.85rem 1rem',
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: '10px',
                  fontSize: '0.86rem',
                  color: '#166534',
                  lineHeight: 1.55
                }}
              >
                <strong>💡 會議標準流程說明：</strong>
                <br />
                ① 先於下方填寫會議基本資訊並按「<strong>🚀 確認發起會議（開放現場簽到）</strong>」 ➔ ② 發起後與會同仁即可先點選該場會議進行<strong>現場簽到</strong>，記錄人亦從列表點選該會議進入「<strong>📝 執行會議紀錄</strong>」 ➔ ③ 完成會議後按「<strong>🏁 結束會議</strong>」結束資料登錄 ➔ ④ 待<strong>技術主任確認無誤按「公布」</strong>後，其他人員方能查閱。
              </div>
            )}

            {modalMode === 'record' && staffDraftMeeting.status === 'returned' && staffDraftMeeting.returnReason && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.85rem 1rem',
                  background: '#fff7ed',
                  border: '2px solid #ea580c',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  color: '#9a3412',
                  fontWeight: 700
                }}
              >
                🟠 技術主任（{staffDraftMeeting.returnedBy || '林宜蓁'}）退回修改說明：{staffDraftMeeting.returnReason}
                <div style={{ fontSize: '0.8rem', fontWeight: 500, marginTop: '0.2rem' }}>
                  （下方已完整保留您先前維護的所有資料內容，請修改後按右上角或底部「🏁 結束會議（完成登錄送技術主任確認）」）
                </div>
              </div>
            )}

            {/* 🎙️ 現場語音 / 手寫稿 / 口語重點一鍵轉結構化會議紀錄（僅於 STEP 2「點選進入執行會議紀錄」時顯示） */}
            {modalMode === 'record' && (
            <div className="card" style={{ marginBottom: '1.15rem', background: '#faf5ff', borderColor: '#d8b4fe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div style={{ fontWeight: 700, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Mic size={18} /> 🎙️ 語音轉譯、錄製語音檔 ＆ 📷 手寫稿智慧潤飾
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
                        <MicOff size={15} /> 🔴 停止語音轉譯 ({voiceTimerSeconds}秒)
                      </>
                    ) : (
                      <>
                        <Mic size={15} /> PC 語音轉譯
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => activateMobileKeyboardDictation()}
                    className="btn btn-secondary"
                    style={{
                      padding: '0.38rem 0.8rem',
                      fontSize: '0.82rem',
                      background: voiceStatus === 'keyboard_mode' ? '#10b981' : '#fffbeb',
                      color: voiceStatus === 'keyboard_mode' ? '#ffffff' : '#b45309',
                      borderColor: voiceStatus === 'keyboard_mode' ? '#059669' : '#fcd34d',
                      fontWeight: 700
                    }}
                    title="iPhone / Android / LINE 瀏覽器最推薦：點擊後直接按手機鍵盤右下角的 🎤 麥克風說話"
                  >
                    📱 {voiceStatus === 'keyboard_mode' ? '🟢 手機語音轉譯作用中' : '手機語音轉譯'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleFrontendPureAudioRecorder}
                    className={`btn btn-secondary ${isFrontendAudioRecording ? 'recording-pulse' : ''}`}
                    style={{
                      padding: '0.38rem 0.8rem',
                      fontSize: '0.82rem',
                      background: isFrontendAudioRecording ? '#dc2626' : '#f1f5f9',
                      color: isFrontendAudioRecording ? '#ffffff' : '#334155',
                      borderColor: isFrontendAudioRecording ? '#dc2626' : '#cbd5e1'
                    }}
                  >
                    {isFrontendAudioRecording ? `⏹️ 停止錄音 (${frontendAudioSeconds}秒)` : '🎵 錄製語音檔'}
                  </button>
                  <label
                    className="btn btn-secondary"
                    style={{
                      margin: 0,
                      cursor: 'pointer',
                      padding: '0.38rem 0.85rem',
                      fontSize: '0.82rem',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      borderColor: '#93c5fd'
                    }}
                  >
                    <Upload size={14} /> 📷 上傳手寫稿{frontendHandwrittenImages.length > 0 ? ` (${frontendHandwrittenImages.length})` : ''}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFrontendHandwrittenUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
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
                    🪄 {polishingVoice ? '校正中...' : '智慧修正潤飾'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRunFrontendAiStructuring}
                    disabled={aiStructuringLoading}
                    className="btn btn-purple"
                    style={{ padding: '0.38rem 0.9rem', fontSize: '0.82rem' }}
                  >
                    <Sparkles size={15} /> {aiStructuringLoading ? '轉換中...' : '轉成正式紀錄'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveFrontendDraftInbox}
                    disabled={savingFrontendDraftInbox}
                    className="btn"
                    style={{
                      padding: '0.38rem 0.85rem',
                      fontSize: '0.82rem',
                      background: '#0284c7',
                      color: '#ffffff'
                    }}
                  >
                    ☁️ {savingFrontendDraftInbox ? '暫存中...' : '暫存至雲端'}
                  </button>
                </div>
              </div>

              {/* 恆常顯示之「語音功能運作狀態指示列」：清楚標示目前是否正在收音或待命 */}
              <div
                style={{
                  marginBottom: '0.55rem',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '8px',
                  fontSize: '0.83rem',
                  fontWeight: 700,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  background:
                    isVoiceListening || isFrontendAudioRecording
                      ? '#fef2f2'
                      : voiceStatus === 'keyboard_mode'
                      ? '#ecfdf5'
                      : voiceStatus === 'paused'
                      ? '#fffbeb'
                      : '#f8fafc',
                  border:
                    isVoiceListening || isFrontendAudioRecording
                      ? '2px solid #ef4444'
                      : voiceStatus === 'keyboard_mode'
                      ? '2px solid #10b981'
                      : voiceStatus === 'paused'
                      ? '2px solid #f59e0b'
                      : '1px solid #cbd5e1',
                  color:
                    isVoiceListening || isFrontendAudioRecording
                      ? '#991b1b'
                      : voiceStatus === 'keyboard_mode'
                      ? '#065f46'
                      : voiceStatus === 'paused'
                      ? '#92400e'
                      : '#475569'
                }}
              >
                <div>
                  {isFrontendAudioRecording ? (
                    <>
                      🔴 <strong>語音狀態：【正在錄製語音檔（已錄 {frontendAudioSeconds} 秒）】</strong> — 請直接說話，錄完點上方「⏹️ 停止錄音」即可！
                    </>
                  ) : isVoiceListening ? (
                    <>
                      🔴 <strong>語音狀態：【PC 語音轉譯作用中（已啟動 {voiceTimerSeconds} 秒）】</strong> — 請直接說話！即時聽寫：
                      <span style={{ color: '#0f172a', marginLeft: '0.3rem', textDecoration: 'underline' }}>
                        {voiceInterimText || '正在聆聽您的聲音...'}
                      </span>
                    </>
                  ) : voiceStatus === 'keyboard_mode' ? (
                    <>
                      🟢 <strong>語音狀態：【手機語音轉譯作用中】</strong> — 下方輸入框已開啟，請直接點擊您<strong>手機鍵盤右下角的「🎤 麥克風」</strong>說話！
                    </>
                  ) : voiceStatus === 'paused' ? (
                    <>
                      ⏸️ <strong>語音狀態：【偵測到停頓已暫停收音】</strong> — 前段文字已保留，可點右側按鈕繼續說下一句，或改點「📱 手機語音轉譯」！
                    </>
                  ) : (
                    <>
                      ⚪ <strong>語音狀態：待命（尚未啟動）</strong> — 點選上方「PC 語音轉譯」、「📱 手機語音轉譯」或「🎵 錄製語音檔」即可開始
                    </>
                  )}
                </div>

                {voiceStatus === 'paused' && (
                  <button
                    type="button"
                    onClick={toggleFrontendVoiceRecognition}
                    className="btn"
                    style={{ padding: '0.25rem 0.7rem', fontSize: '0.78rem', background: '#dc2626', color: '#fff' }}
                  >
                    🎙️ 點此繼續收音
                  </button>
                )}
              </div>

              {mobileVoiceHint && (
                <div
                  style={{
                    marginBottom: '0.55rem',
                    padding: '0.55rem 0.8rem',
                    background: '#fffbeb',
                    border: '1.5px solid #f59e0b',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    color: '#92400e',
                    fontWeight: 600,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <span>{mobileVoiceHint}</span>
                  <button
                    type="button"
                    onClick={() => setMobileVoiceHint('')}
                    style={{ background: 'transparent', border: 'none', color: '#92400e', fontWeight: 800, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {frontendAudioUrl && (
                <div
                  style={{
                    marginBottom: '0.55rem',
                    padding: '0.45rem 0.75rem',
                    background: '#f0f9ff',
                    border: '1px solid #7dd3fc',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    fontSize: '0.82rem',
                    color: '#0369a1'
                  }}
                >
                  <span>🎵 已載入語音檔：<strong>{frontendAudioName}</strong></span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <audio src={frontendAudioUrl} controls style={{ height: '30px', maxWidth: '210px' }} />
                    <button
                      type="button"
                      onClick={() => {
                        setFrontendAudioUrl(null);
                        setFrontendAudioBase64(null);
                        setFrontendAudioName('');
                      }}
                      className="btn btn-danger"
                      style={{ padding: '0.18rem 0.5rem', fontSize: '0.74rem' }}
                    >
                      移除
                    </button>
                  </div>
                </div>
              )}

              {frontendHandwrittenImages.length > 0 && (
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.55rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e40af' }}>📷 已載入手寫稿：</span>
                  {frontendHandwrittenImages.map((img) => (
                    <div
                      key={img.id}
                      style={{
                        position: 'relative',
                        width: '54px',
                        height: '54px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid #3b82f6'
                      }}
                      title={img.name}
                    >
                      <img src={img.dataUrl} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => setFrontendHandwrittenImages((prev) => prev.filter((x) => x.id !== img.id))}
                        style={{
                          position: 'absolute',
                          top: '1px',
                          right: '1px',
                          background: 'rgba(220,38,38,0.9)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '16px',
                          height: '16px',
                          fontSize: '10px',
                          lineHeight: '16px',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
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
                ref={voiceTextareaRef}
                rows={4}
                value={voiceQuickText}
                onChange={(e) => {
                  setVoiceQuickText(e.target.value);
                  latestVoiceTextRef.current = e.target.value;
                }}
                placeholder="點選「PC 語音轉譯」或「📱 手機語音轉譯」直接說話，講完可點「🪄 智慧修正潤飾」（自動修正如：林怡貞➔林宜蓁、評保➔品保、千屏風➔鉛屏風），也可以直接在這裡手動修改任何字句！"
                style={{
                  fontSize: '0.9rem',
                  border:
                    isVoiceListening
                      ? '2.5px solid #ef4444'
                      : voiceStatus === 'keyboard_mode'
                      ? '2.5px solid #10b981'
                      : undefined,
                  background:
                    isVoiceListening
                      ? '#fff5f5'
                      : voiceStatus === 'keyboard_mode'
                      ? '#f0fdf4'
                      : '#ffffff'
                }}
              />
            </div>
            )}

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
                <label>目前流程階段</label>
                <input
                  type="text"
                  disabled
                  value={
                    modalMode === 'initiate'
                      ? '🟢 發起會議（開放現場出席簽到）'
                      : staffDraftMeeting.status === 'returned'
                      ? '🟠 技術主任退回修改中（保留原維護資料）'
                      : staffDraftMeeting.status === 'pending_review'
                      ? '⏳ 待技術主任確認公布'
                      : staffDraftMeeting.status === 'published'
                      ? '✅ 技術主任已確認公布'
                      : '🟢 會議進行中（執行會議紀錄）'
                  }
                  style={{ background: '#f8fafc', fontWeight: 700, color: '#1e3a8a' }}
                />
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

            {modalMode === 'record' && (
              <>
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

                {/* 肆、待辦追蹤事項 (Action Items) */}
                <div className="card" style={{ marginBottom: '1rem', padding: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ margin: 0 }}>📌 肆、待辦追蹤事項 (Action Items，選填)</label>
                    <button
                      type="button"
                      onClick={() =>
                        setStaffDraftMeeting({
                          ...staffDraftMeeting,
                          actionItems: [
                            ...(staffDraftMeeting.actionItems || []),
                            {
                              id: `ACT-${Date.now()}-${(staffDraftMeeting.actionItems || []).length + 1}`,
                              task: '',
                              assignee: currentUser?.name || '全科同仁',
                              dueDate: '',
                              status: '進行中'
                            }
                          ]
                        })
                      }
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                    >
                      <Plus size={14} /> 新增待辦追蹤
                    </button>
                  </div>
                  {(staffDraftMeeting.actionItems || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {staffDraftMeeting.actionItems.map((act, idx) => (
                        <div key={act.id || idx} style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={act.task || ''}
                            onChange={(e) => {
                              const list = [...staffDraftMeeting.actionItems];
                              list[idx] = { ...list[idx], task: e.target.value };
                              setStaffDraftMeeting({ ...staffDraftMeeting, actionItems: list });
                            }}
                            placeholder="待辦事項描述..."
                            style={{ flex: '2 1 220px' }}
                          />
                          <input
                            type="text"
                            value={act.assignee || ''}
                            onChange={(e) => {
                              const list = [...staffDraftMeeting.actionItems];
                              list[idx] = { ...list[idx], assignee: e.target.value };
                              setStaffDraftMeeting({ ...staffDraftMeeting, actionItems: list });
                            }}
                            placeholder="負責人（如：潘俊儒）"
                            style={{ flex: '1 1 110px' }}
                          />
                          <input
                            type="date"
                            value={act.dueDate || ''}
                            onChange={(e) => {
                              const list = [...staffDraftMeeting.actionItems];
                              list[idx] = { ...list[idx], dueDate: e.target.value };
                              setStaffDraftMeeting({ ...staffDraftMeeting, actionItems: list });
                            }}
                            style={{ width: '145px' }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const list = staffDraftMeeting.actionItems.filter((_, i) => i !== idx);
                              setStaffDraftMeeting({ ...staffDraftMeeting, actionItems: list });
                            }}
                            className="btn btn-danger"
                            style={{ padding: '0.35rem 0.6rem' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
                      📎 伍、會議現場照片或 PDF / Word / Excel / PPTX 佐證附件（選填，已附加 {(staffDraftMeeting.attachments || []).length} 件）
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
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                取消
              </button>
              {modalMode === 'initiate' ? (
                <button
                  type="button"
                  onClick={(e) => handleSaveStaffMeeting(e, 'in_progress')}
                  disabled={savingStaffMeeting}
                  className="btn btn-success"
                  style={{ padding: '0.7rem 1.5rem', fontSize: '1rem' }}
                >
                  <Save size={18} /> {savingStaffMeeting ? '發起中...' : '🚀 確認發起會議（開放現場簽到，點選進入做會議紀錄）'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={(e) =>
                      handleSaveStaffMeeting(
                        e,
                        staffDraftMeeting.status === 'returned'
                          ? 'returned'
                          : staffDraftMeeting.status === 'published'
                          ? 'published'
                          : 'in_progress'
                      )
                    }
                    disabled={savingStaffMeeting}
                    className="btn"
                    style={{ background: '#2563eb', padding: '0.7rem 1.25rem', fontSize: '0.95rem' }}
                  >
                    <Save size={18} /> {savingStaffMeeting ? '儲存中...' : '💾 暫存紀錄資料（稍後繼續登錄）'}
                  </button>
                  {staffDraftMeeting.status !== 'published' && (
                    <button
                      type="button"
                      onClick={(e) => handleSaveStaffMeeting(e, 'pending_review')}
                      disabled={savingStaffMeeting}
                      className="btn btn-purple"
                      style={{ padding: '0.7rem 1.45rem', fontSize: '0.98rem' }}
                    >
                      <CheckCircle2 size={18} /> 🏁 結束會議（完成資料登錄，送交技術主任確認）
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 會議進行中：現場簽到 QR Code 彈出視窗 ==================== */}
      {qrModalMeeting && (
        <div
          className="no-print animate-fade-in"
          onClick={() => setQrModalMeeting(null)}
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
              maxWidth: '460px',
              padding: '1.5rem',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '2px solid #16a34a'
            }}
          >
            <span className="badge" style={{ background: '#dcfce7', color: '#15803d', marginBottom: '0.4rem' }}>
              📲 會議現場出席簽到 QR Code
            </span>
            <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.2rem', color: '#0f172a' }}>
              {qrModalMeeting.title}
            </h3>
            <p style={{ margin: '0 0 0.9rem 0', fontSize: '0.84rem', color: '#64748b' }}>
              請與會同仁使用手機相機或 LINE 掃描下方 QR Code，選擇姓名即可一鍵完成現場出席簽到！
            </p>
            {qrDataUrl && (
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '12px', display: 'inline-block', border: '1px solid #cbd5e1', marginBottom: '0.85rem' }}>
                <img src={qrDataUrl} alt="簽到 QR Code" style={{ width: '250px', height: '250px', display: 'block' }} />
              </div>
            )}
            <div style={{ fontSize: '0.76rem', color: '#64748b', wordBreak: 'break-all', marginBottom: '1rem' }}>
              簽到網址：<code>{checkinUrl}</code>
            </div>
            <button
              type="button"
              onClick={() => setQrModalMeeting(null)}
              className="btn btn-secondary"
              style={{ width: '100%', padding: '0.65rem' }}
            >
              關閉 QR Code 視窗
            </button>
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
