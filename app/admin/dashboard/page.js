'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  FileText,
  Mic,
  MicOff,
  CheckCircle2,
  Users,
  BarChart3,
  Settings,
  Plus,
  Trash2,
  Edit3,
  Save,
  Download,
  Upload,
  QrCode,
  Copy,
  Sparkles,
  LogOut,
  ShieldCheck,
  Image as ImageIcon,
  RefreshCw,
  FileAudio,
  CloudUpload,
  Eye,
  BookOpen,
  Archive,
  RotateCcw,
  Tags,
  Search,
  ArrowUp,
  ArrowDown,
  Unlock
} from 'lucide-react';
import { generateMeetingDocxBlob } from '@/lib/exportDocx';
import { GOOGLE_APPS_SCRIPT_CODE } from '@/lib/googleAppsScriptTemplate';

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

const COLOR_PRESETS = [
  { label: '醫療藍', color: '#2563eb', badgeBg: '#dbeafe' },
  { label: '教學紫', color: '#7c3aed', badgeBg: '#ede9fe' },
  { label: '品保綠', color: '#059669', badgeBg: '#d1fae5' },
  { label: '輻防橘', color: '#d97706', badgeBg: '#fef3c7' },
  { label: '病安紅', color: '#dc2626', badgeBg: '#fee2e2' },
  { label: '青色', color: '#0891b2', badgeBg: '#cffafe' },
  { label: '靛藍', color: '#4f46e5', badgeBg: '#e0e7ff' },
  { label: '桃紅', color: '#db2777', badgeBg: '#fce7f3' }
];

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState(null);
  const [activeTab, setActiveTab] = useState('meetings'); // meetings | categories | voice | approvals | staff | analytics | settings
  const [toastMsg, setToastMsg] = useState('');

  // Core Data
  const [meetings, setMeetings] = useState([]);
  const [staff, setStaff] = useState([]);
  const [settings, setSettings] = useState({});
  const [loginRecords, setLoginRecords] = useState({});
  const [accountsInfo, setAccountsInfo] = useState({});

  // Tab 1: Meetings & Historical Zone Editor State
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [viewingAdminMeetingId, setViewingAdminMeetingId] = useState(null);
  const [customAttendeeInput, setCustomAttendeeInput] = useState('');
  const [quickEditMtgId, setQuickEditMtgId] = useState(null);
  const [quickEditTitle, setQuickEditTitle] = useState('');
  const [quickEditCategory, setQuickEditCategory] = useState('');
  const [filterCat, setFilterCat] = useState('ALL');
  const [filterYear, setFilterYear] = useState('ALL');
  const [filterArchiveMode, setFilterArchiveMode] = useState('ALL'); // ALL | ACTIVE | ARCHIVED
  const [meetingSearchQuery, setMeetingSearchQuery] = useState('');
  const [qrModalMeeting, setQrModalMeeting] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [checkinUrl, setCheckinUrl] = useState('');

  // 【G】維護中心列表欄位排序狀態
  const [adminSortBy, setAdminSortBy] = useState('date'); // 'date' | 'category' | 'title' | 'unsigned'
  const [adminSortDir, setAdminSortDir] = useState('desc'); // 'asc' | 'desc'

  // 【F】Power BI 連動狀態
  const [pushingPowerBi, setPushingPowerBi] = useState(false);

  // Tab: Categories Manager State (增減會議紀錄種類)
  const [newCatName, setNewCatName] = useState('');
  const [newCatShortName, setNewCatShortName] = useState('');
  const [newCatColorIdx, setNewCatColorIdx] = useState(0);
  const [newCatTemplate, setNewCatTemplate] = useState('dept');

  // Tab 2: Voice & AI Studio State
  const [voiceCategory, setVoiceCategory] = useState('ccc');
  const [voiceMeetingTitle, setVoiceMeetingTitle] = useState('');
  const [rawTranscript, setRawTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [transcriptBeforePolish, setTranscriptBeforePolish] = useState('');
  const [transcriptCorrections, setTranscriptCorrections] = useState([]);
  const [polishingTranscript, setPolishingTranscript] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState(null);
  const [uploadedAudioFile, setUploadedAudioFile] = useState(null);
  const [uploadedAudioBase64, setUploadedAudioBase64] = useState(null);
  const [uploadedAudioMime, setUploadedAudioMime] = useState('audio/mp3');
  const [uploadedHandwrittenImages, setUploadedHandwrittenImages] = useState([]);
  const [attachHandwrittenToMeeting, setAttachHandwrittenToMeeting] = useState(true);
  const [draftInboxItems, setDraftInboxItems] = useState([]);
  const [savingDraftInbox, setSavingDraftInbox] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiModeUsed, setAiModeUsed] = useState('');
  const [adminMobileVoiceHint, setAdminMobileVoiceHint] = useState('');
  const recognitionRef = useRef(null);
  const wantAdminVoiceRef = useRef(false);
  const adminVoiceTextareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const latestRawTranscriptRef = useRef('');

  // Tab 3: Approvals & Reopen Signing State
  const [selectedApprovalMtgId, setSelectedApprovalMtgId] = useState('');
  const [approvalApproverName, setApprovalApproverName] = useState('');
  const [approvalComment, setApprovalComment] = useState('');

  // Tab 4: Staff Management State
  const [editingStaff, setEditingStaff] = useState(null);
  const [newGroupTagInput, setNewGroupTagInput] = useState('');
  const [staffGroupFilter, setStaffGroupFilter] = useState('ALL');
  const [staffSearch, setStaffSearch] = useState('');
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Tab 6: Settings & Cloud Sync State
  const [targetRoleCred, setTargetRoleCred] = useState('manager');
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [showGasCodeModal, setShowGasCodeModal] = useState(false);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4200);
  };

  const getRocYear = (m) => {
    if (m.rocYear) return String(m.rocYear);
    const y = parseInt((m.date || '2026').slice(0, 4), 10) || 2026;
    return String(y > 1911 ? y - 1911 : y);
  };

  const loadDashboardData = async () => {
    try {
      const [resMtg, resSet, resInbox] = await Promise.all([
        fetch('/api/meetings'),
        fetch('/api/settings'),
        fetch('/api/draft-inbox').catch(() => null)
      ]);

      if (resSet.status === 401) {
        router.push('/admin/login');
        return;
      }

      const mtgData = await resMtg.json();
      const setData = await resSet.json();
      if (resInbox && resInbox.ok) {
        try {
          const inboxData = await resInbox.json();
          setDraftInboxItems(inboxData.items || []);
        } catch {}
      }

      const loadedMeetings = mtgData.meetings || [];
      setMeetings(loadedMeetings);
      setStaff(mtgData.staff || []);
      setSettings(setData.settings || mtgData.settings || {});
      setLoginRecords(mtgData.loginRecords || {});
      setAdminRole(setData.role || mtgData.adminRole);
      setAccountsInfo(setData.accounts || {});

      if (loadedMeetings.length > 0 && !selectedApprovalMtgId) {
        setSelectedApprovalMtgId(loadedMeetings[0].id);
      }

      if (setData.role === 'manager') {
        setApprovalApproverName('許志賢 科主任');
        setTargetRoleCred('manager');
        setCredUsername(setData.accounts?.manager?.username || 'x7260');
      } else if (setData.role === 'deputy') {
        setApprovalApproverName('林宜蓁 技術主任');
        setTargetRoleCred('deputy');
        setCredUsername(setData.accounts?.deputy?.username || 'x3137a');
      } else {
        setApprovalApproverName('潘俊儒');
        setTargetRoleCred('manager');
        setCredUsername(setData.accounts?.manager?.username || 'x7260');
      }
    } catch (err) {
      console.error('Load admin data error:', err);
      showToast('⚠️ 載入資料發生錯誤');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    return () => {
      stopVoiceRecording();
    };
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  // ==================== 會議 QR Code 產生器 ====================
  const openQrCodeModal = async (meeting) => {
    setQrModalMeeting(meeting);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const url = `${origin}/?checkin=${encodeURIComponent(meeting.id)}`;
    setCheckinUrl(url);
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      setQrDataUrl(dataUrl);
    } catch (e) {
      console.error(e);
    }
  };

  // ==================== 公版 Word (.docx) 匯出 ====================
  const handleExportDocx = async (meeting) => {
    try {
      showToast(`📄 正在產生「${meeting.title}」公版 Word (.docx)...`);
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
      showToast('✅ 公版 Word (.docx) 匯出成功！');
    } catch (err) {
      console.error(err);
      alert('匯出 Word 時發生錯誤');
    }
  };

  // ==================== 會議紀錄建立、編輯、歸檔與重啟簽核 ====================
  const startNewMeeting = (prefill = null, defaultArchived = false) => {
    const allActiveNames = staff.filter((s) => s.status !== '離職').map((s) => s.name);
    const activeStaffNames = staff.filter((s) => s.status === '在職').map((s) => s.name);
    const initialPresent = prefill?.presentStaffNames?.length ? prefill.presentStaffNames : activeStaffNames;
    const rawLeave = Array.isArray(prefill?.leaveStaffNames) ? prefill.leaveStaffNames : [];
    const initialLeave = Array.from(
      new Set([...rawLeave, ...allActiveNames.filter((n) => !initialPresent.includes(n))].filter((n) => !initialPresent.includes(n)))
    );
    const todayStr = new Date().toISOString().slice(0, 10);
    setCustomAttendeeInput('');
    setEditingMeeting({
      id: prefill?.id || '',
      title: prefill?.title || `${new Date().getFullYear() - 1911} 年新樓醫院影像醫學科 會議紀錄`,
      category: prefill?.category || (filterCat !== 'ALL' ? filterCat : 'dept'),
      date: prefill?.date || todayStr,
      time: prefill?.time || '12:30',
      rocYear: prefill?.rocYear || String(new Date().getFullYear() - 1911),
      displayDate:
        prefill?.displayDate ||
        `${new Date().getFullYear() - 1911} 年 ${new Date().getMonth() + 1} 月 ${new Date().getDate()} 日 12:30`,
      location: prefill?.location || '影像醫學科 會議室',
      chair: prefill?.chair || '林宜蓁',
      recorder: prefill?.recorder || '潘俊儒',
      status: prefill?.status || 'published',
      isArchived: prefill?.isArchived !== undefined ? prefill.isArchived : defaultArchived,
      targetGroups: prefill?.targetGroups || ['全科人員'],
      expectedCount: prefill?.expectedCount || allActiveNames.length || activeStaffNames.length || 20,
      presentStaffNames: initialPresent,
      leaveStaffNames: initialLeave,
      agendaItems: prefill?.agendaItems?.length ? prefill.agendaItems : ['1. 上次會議決議事項追蹤', '2. 本次會議討論事項'],
      discussionSections: prefill?.discussionSections?.length
        ? prefill.discussionSections
        : [
            { heading: '1. 主席報告與上次決議追蹤', bullets: ['請輸入討論重點...'] },
            { heading: '2. 專題討論事項', bullets: ['請輸入討論重點...'] }
          ],
      resolutions: prefill?.resolutions?.length ? prefill.resolutions : ['通過本次會議各項討論提案，請相關組別依決議辦理。'],
      actionItems: prefill?.actionItems || [],
      attachments: prefill?.attachments || [],
      rawTranscript: prefill?.rawTranscript || '',
      surveyUrl: prefill?.surveyUrl || '',
      surveyTitle: prefill?.surveyTitle || ''
    });
    setActiveTab('meetings');
  };

  // 【D】後台新增/編輯會議時一鍵帶入過往會議範本
  const applyAdminMeetingTemplate = (templateMeeting) => {
    if (!templateMeeting || !editingMeeting) return;
    setEditingMeeting((prev) => ({
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
      surveyTitle: templateMeeting.surveyTitle || prev.surveyTitle || ''
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

  // 【F】主動推播最新統計至 Power BI Streaming Dataset
  const handlePushToPowerBi = async () => {
    if (!(settings.powerBiPushUrl || '').trim()) {
      alert('請先填入 Power BI 串流資料集推送網址 (Push URL)，或直接使用上方的 Web API 網址在 Power BI Desktop 取得資料！');
      return;
    }
    setPushingPowerBi(true);
    try {
      const res = await fetch('/api/powerbi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pushUrl: settings.powerBiPushUrl })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || '✅ 已成功推送至 Power BI！');
      } else {
        alert(data.error || '推送失敗');
      }
    } catch (err) {
      alert('推送至 Power BI 發生錯誤');
    } finally {
      setPushingPowerBi(false);
    }
  };

  const handleQuickUpdateMeetingTitle = async (meetingId, newTitle, newCategory = null) => {
    const trimmed = (newTitle || '').trim();
    if (!trimmed) {
      alert('請輸入會議標題');
      return;
    }
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quick_update_title',
          id: meetingId,
          title: trimmed,
          ...(newCategory ? { category: newCategory } : {})
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        setQuickEditMtgId(null);
        showToast(data.message);
      } else {
        alert(data.error || '更新標題失敗');
      }
    } catch (err) {
      alert('網路錯誤');
    }
  };

  const handleToggleArchiveMeeting = async (meeting, targetArchived) => {
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_archive',
          id: meeting.id,
          isArchived: targetArchived
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        showToast(data.message);
      } else {
        alert(data.error || '操作失敗');
      }
    } catch (err) {
      alert('網路錯誤');
    }
  };

  const handleReopenSingleStaffSign = async (meetingId, staffName) => {
    const reason = window.prompt(
      `確定要將「${staffName}」的簽核退回重簽嗎？\n退回後，這場會議將重新顯示在 ${staffName} 的手機首頁「待我簽閱專區」。\n\n可輸入退回重簽說明（選填）：`,
      '會議紀錄內容更新，請再次詳閱並簽認'
    );
    if (reason === null) return;

    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reopen_sign_single',
          id: meetingId,
          staffName,
          reason
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        showToast(data.message);
      } else {
        alert(data.error || '退回重簽失敗');
      }
    } catch (err) {
      alert('操作失敗');
    }
  };

  const handleCarryOverPendingActions = () => {
    if (!editingMeeting) return;
    const unfinished = [];
    meetings.forEach((m) => {
      if (m.id === editingMeeting.id) return;
      (m.actionItems || []).forEach((item) => {
        if (item.status !== '已完成') {
          unfinished.push({
            ...item,
            id: `ACT-${Date.now().toString().slice(-3)}-${unfinished.length + 1}`,
            task: `[前次會議追蹤] ${item.task}`
          });
        }
      });
    });

    if (unfinished.length === 0) {
      showToast('🎉 前次會議所有待辦事項皆已完成！');
      return;
    }

    setEditingMeeting({
      ...editingMeeting,
      actionItems: [...(editingMeeting.actionItems || []), ...unfinished]
    });
    showToast(`✅ 已自動帶入 ${unfinished.length} 項前次未完成之待辦事項！`);
  };

  const handleUploadAttachmentPhoto = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !editingMeeting) return;

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
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);

            setEditingMeeting((prev) => ({
              ...prev,
              attachments: [
                ...(prev.attachments || []),
                {
                  id: `ATT-${Date.now()}-${Math.floor(Math.random() * 100)}`,
                  title: file.name,
                  fileName: file.name,
                  mimeType: 'image/jpeg',
                  fileSize: file.size || 0,
                  url: compressedDataUrl,
                  category: '會議紀錄照片'
                }
              ]
            }));
          };
          img.src = ev.target.result;
        } else {
          setEditingMeeting((prev) => ({
            ...prev,
            attachments: [
              ...(prev.attachments || []),
              {
                id: `ATT-${Date.now()}-${Math.floor(Math.random() * 100)}`,
                title: file.name,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                fileSize: file.size || 0,
                url: ev.target.result,
                category: '會議佐證文件'
              }
            ]
          }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
    showToast(`📎 已加入 ${files.length} 件會議照片/佐證檔案`);
  };

  const handleSaveMeeting = async () => {
    if (!editingMeeting?.title?.trim()) {
      alert('請輸入會議標題');
      return;
    }

    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_meeting',
          meeting: editingMeeting
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        setEditingMeeting(null);
        showToast('✅ 會議紀錄已成功儲存！');
      } else {
        alert(data.error || '儲存失敗');
      }
    } catch (err) {
      alert('儲存會議紀錄時發生錯誤');
    }
  };

  const handleDeleteMeeting = async (id, title) => {
    if (!window.confirm(`確定要刪除「${title}」嗎？此操作無法復原。`)) return;
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_meeting', id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        showToast('🗑️ 會議紀錄已刪除');
      }
    } catch (err) {
      alert('刪除失敗');
    }
  };

  // ==================== 會議紀錄種類維護 (增減/改名/排序會議種類) ====================
  const saveUpdatedCategories = async (nextCategories, msg = '✅ 會議紀錄種類已更新並同步至前台與歷史專區！') => {
    const nextSettings = {
      ...settings,
      meetingCategories: nextCategories
    };
    setSettings(nextSettings);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings)
      });
      if (res.ok) {
        showToast(msg);
      }
    } catch (err) {
      alert('儲存會議種類失敗');
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      alert('請輸入新會議種類名稱');
      return;
    }
    const preset = COLOR_PRESETS[newCatColorIdx] || COLOR_PRESETS[0];
    const newId = `cat_${Date.now().toString().slice(-5)}`;
    const newCat = {
      id: newId,
      name: newCatName.trim(),
      shortName: (newCatShortName || newCatName).trim(),
      color: preset.color,
      badgeBg: preset.badgeBg,
      templateType: newCatTemplate || 'dept'
    };

    const nextCategories = [...(settings.meetingCategories || []), newCat];
    await saveUpdatedCategories(nextCategories, `✅ 已新增會議種類「${newCat.name}」！`);
    setNewCatName('');
    setNewCatShortName('');
  };

  const handleMoveCategory = async (idx, direction) => {
    const list = [...(settings.meetingCategories || [])];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;
    await saveUpdatedCategories(list, '✅ 會議種類排序已更新！');
  };

  const handleDeleteCategory = async (cat) => {
    const usedCount = meetings.filter((m) => m.category === cat.id).length;
    if (
      !window.confirm(
        usedCount > 0
          ? `目前有 ${usedCount} 筆會議屬於「${cat.name}」，確定要刪除此會議種類標籤嗎？`
          : `確定要刪除會議種類「${cat.name}」嗎？`
      )
    ) {
      return;
    }
    const next = (settings.meetingCategories || []).filter((c) => c.id !== cat.id);
    await saveUpdatedCategories(next, `🗑️ 已刪除會議種類「${cat.name}」`);
  };

  // ==================== Tab 2: 語音/手寫稿轉會議紀錄 & 講完後自動修正詞句 ====================
  const handlePolishTranscript = async (textOverride = null, silentIfEmpty = false) => {
    const raw = (textOverride !== null ? textOverride : rawTranscript || '').trim();
    if (!raw && uploadedHandwrittenImages.length === 0) {
      if (!silentIfEmpty) alert('請先上傳手寫稿照片、進行語音辨識或輸入逐字稿內容後，再執行智慧修正潤飾！');
      return;
    }
    setPolishingTranscript(true);
    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: uploadedHandwrittenImages.length > 0 ? 'extract_handwritten' : 'polish_transcript',
          transcript: raw,
          handwrittenImages: uploadedHandwrittenImages.map((img) => ({
            base64: img.base64,
            mimeType: img.mimeType,
            name: img.name
          }))
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.correctedTranscript) {
        setTranscriptBeforePolish(raw);
        setRawTranscript(data.correctedTranscript);
        latestRawTranscriptRef.current = data.correctedTranscript;
        setTranscriptCorrections(data.corrections || []);
        showToast(data.message || '✨ 已完成手寫稿/同音錯別字校正與詞句潤飾！');
      } else if (!res.ok && data.error && !silentIfEmpty) {
        alert(data.error);
      }
    } catch (err) {
      console.error('Polish transcript error:', err);
    } finally {
      setPolishingTranscript(false);
    }
  };

  const activateAdminMobileKeyboardDictation = (reasonMsg = '') => {
    setAdminMobileVoiceHint(
      reasonMsg ||
        '📱 已為您點開下方逐字稿文字框！請直接點擊您「手機鍵盤右下角（或空白鍵旁）的 🎤 麥克風圖示」開始說話（Apple/Google 原生語音輸入最準確，且支援 LINE 與所有手機瀏覽器）！'
    );
    setTimeout(() => {
      if (adminVoiceTextareaRef.current) {
        adminVoiceTextareaRef.current.focus();
      }
    }, 80);
  };

  const startVoiceRecording = async () => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
    const isLineOrIosChrome = /Line\/|CriOS\/|FBIOS\//i.test(ua);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    setAdminMobileVoiceHint('');
    latestRawTranscriptRef.current = rawTranscript;

    // 若為手機 LINE 內建瀏覽器或 iOS Chrome（不支援 Web Speech API），直接引導手機鍵盤 🎤 語音輸入或嘗試純錄音
    if (!SpeechRecognition || isLineOrIosChrome) {
      activateAdminMobileKeyboardDictation(
        '📱 偵測到您使用手機 LINE 或 iOS Chrome 瀏覽器（Apple 限制網頁即時聽寫 API），已為您點開下方輸入框：請直接點選「手機鍵盤上的 🎤 麥克風」說話（最準確！），或使用右側「方式 B：上傳手機錄音檔」！'
      );
      return;
    }

    setIsRecording(true);
    setRecordingSeconds(0);
    setRecordedAudioUrl(null);
    wantAdminVoiceRef.current = true;

    timerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);

    let speechStarted = false;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-TW';
      // 手機瀏覽器設為 continuous = false 並於 onend 自動無縫重啟，避免 iOS 中斷與 Android 重複字詞 Bug
      recognition.continuous = !isMobile;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let finalSegment = '';
        let interimSeg = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = (event.results[i][0].transcript || '').trim();
          if (!t) continue;
          if (event.results[i].isFinal) {
            finalSegment += /[。！？]$/.test(t) ? t : `${t}。`;
          } else {
            interimSeg += t;
          }
        }
        setInterimTranscript(interimSeg);
        if (finalSegment) {
          setRawTranscript((prev) => {
            const next = prev ? `${prev}\n${finalSegment}` : finalSegment;
            latestRawTranscriptRef.current = next;
            return next;
          });
        }
      };

      recognition.onerror = (event) => {
        const errCode = event?.error || '';
        if (errCode === 'no-speech') return;
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed' || errCode === 'audio-capture') {
          wantAdminVoiceRef.current = false;
          setIsRecording(false);
          setInterimTranscript('');
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          activateAdminMobileKeyboardDictation(
            '📱 手機瀏覽器未授權網頁麥克風（或受 iOS 限制），已為您點開下方文字框：請直接點擊「手機鍵盤右下角的 🎤 麥克風」開始說話！'
          );
        }
      };

      recognition.onend = () => {
        if (wantAdminVoiceRef.current) {
          setTimeout(() => {
            if (!wantAdminVoiceRef.current) return;
            try {
              recognition.start();
            } catch {
              wantAdminVoiceRef.current = false;
              setIsRecording(false);
              setInterimTranscript('');
            }
          }, 180);
        }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
        speechStarted = true;
      } catch {
        wantAdminVoiceRef.current = false;
        setIsRecording(false);
        activateAdminMobileKeyboardDictation();
        return;
      }
    }

    // 注意：手機作業系統不允許 SpeechRecognition 與 getUserMedia 同時搶用麥克風，因此僅在桌面電腦或未啟動 SpeechRecognition 時同步錄音
    if (!isMobile || !speechStarted) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          let mediaRecorder;
          try {
            mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
          } catch {
            mediaRecorder = new MediaRecorder(stream);
          }
          const chunks = [];
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            setRecordedAudioUrl(url);
            const reader = new FileReader();
            reader.onload = (ev) => {
              const b64 = String(ev.target.result || '').split(',')[1] || '';
              setRecordedAudioBase64(b64);
            };
            reader.readAsDataURL(blob);
            stream.getTracks().forEach((track) => track.stop());
          };
          mediaRecorder.start();
          mediaRecorderRef.current = mediaRecorder;
        }
      } catch {}
    }
  };

  const stopVoiceRecording = (autoPolish = false) => {
    wantAdminVoiceRef.current = false;
    setIsRecording(false);
    setInterimTranscript('');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (autoPolish && latestRawTranscriptRef.current?.trim()) {
      handlePolishTranscript(latestRawTranscriptRef.current, true);
    }
  };

  const handleAudioFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedAudioFile(file);
    setUploadedAudioMime(file.type || 'audio/mp3');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result || '';
      const base64 = String(dataUrl).split(',')[1] || '';
      setUploadedAudioBase64(base64);
      showToast(`🎵 已載入錄音檔「${file.name}」，可點擊下方按鈕進行 AI 轉譯或暫存至雲端草稿匣`);
    };
    reader.readAsDataURL(file);
  };

  const handleHandwrittenImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 1280;
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
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const base64 = String(compressedDataUrl).split(',')[1] || '';
          setUploadedHandwrittenImages((prev) => [
            ...prev,
            {
              id: `HW-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              name: file.name,
              mimeType: 'image/jpeg',
              base64,
              dataUrl: compressedDataUrl
            }
          ]);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    showToast(`📷 已載入 ${files.length} 張手寫稿照片，可點選「☁️ 暫存至雲端供 IDE 分析」或直接轉成正式會議紀錄！`);
    e.target.value = '';
  };

  const handleSaveToDraftInbox = async () => {
    const effectiveAudioB64 = uploadedAudioBase64 || recordedAudioBase64 || null;
    if (!rawTranscript.trim() && uploadedHandwrittenImages.length === 0 && !effectiveAudioB64) {
      alert('請先錄音、輸入語音逐字稿、上傳手寫稿照片或上傳錄音檔後，再暫存至雲端草稿匣！');
      return;
    }

    setSavingDraftInbox(true);
    try {
      const res = await fetch('/api/draft-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_draft',
          category: voiceCategory,
          meetingTitle: voiceMeetingTitle,
          createdBy: approvalApproverName || '管理員/紀錄人',
          transcript: rawTranscript,
          handwrittenImages: uploadedHandwrittenImages,
          audioBase64: effectiveAudioB64,
          audioMimeType: uploadedAudioBase64 ? uploadedAudioMime : 'audio/webm',
          audioFileName: uploadedAudioFile?.name || `會議錄音_${new Date().toISOString().slice(0, 10)}.webm`
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDraftInboxItems(data.items || []);
        showToast(data.message || '☁️ 已成功暫存至雲端草稿匣！回到電腦打開 IDE 即可請 AI 直接抓取分析。');
      } else {
        alert(data.error || '暫存失敗');
      }
    } catch (err) {
      alert('暫存至雲端草稿匣發生錯誤');
    } finally {
      setSavingDraftInbox(false);
    }
  };

  const handleDeleteDraftInboxItem = async (id) => {
    try {
      const res = await fetch('/api/draft-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_draft', id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDraftInboxItems(data.items || []);
        showToast('🗑️ 已刪除該筆雲端暫存草稿');
      }
    } catch {}
  };

  const handleLoadDraftInboxItem = (item) => {
    if (!item) return;
    setVoiceCategory(item.category || 'dept');
    setVoiceMeetingTitle(item.meetingTitle === '未命名會議草稿（待 IDE 整理）' ? '' : item.meetingTitle || '');
    setRawTranscript(item.transcript || '');
    latestRawTranscriptRef.current = item.transcript || '';
    if (Array.isArray(item.handwrittenImages) && item.handwrittenImages.length > 0) {
      setUploadedHandwrittenImages(
        item.handwrittenImages.map((img, i) => ({
          id: img.id || `HW-LOAD-${i}`,
          name: img.name || `handwritten_${i + 1}.jpg`,
          mimeType: img.mimeType || 'image/jpeg',
          base64: String(img.dataUrl || '').split(',')[1] || '',
          dataUrl: img.dataUrl
        }))
      );
    }
    if (item.audioBase64) {
      setUploadedAudioBase64(item.audioBase64);
      setUploadedAudioMime(item.audioMimeType || 'audio/webm');
      setUploadedAudioFile({ name: item.audioFileName || '雲端暫存錄音檔.webm' });
    }
    showToast(`📂 已將「${item.meetingTitle}」的手寫稿與語音載入上方工作台！`);
  };

  const handleRunAiStructuring = async () => {
    if (!rawTranscript.trim() && !uploadedAudioBase64 && uploadedHandwrittenImages.length === 0) {
      alert('請先使用麥克風錄音說話、上傳手寫稿照片、上傳錄音檔、貼上逐字稿，或點選範例測試稿！');
      return;
    }

    setAiProcessing(true);
    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: rawTranscript,
          category: voiceCategory,
          meetingTitle: voiceMeetingTitle,
          audioBase64: uploadedAudioBase64,
          audioMimeType: uploadedAudioMime,
          handwrittenImages: uploadedHandwrittenImages.map((img) => ({
            base64: img.base64,
            mimeType: img.mimeType,
            name: img.name
          }))
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAiResult(data.result);
        setAiModeUsed(data.mode || '');
        if (data.correctedTranscript) {
          setRawTranscript(data.correctedTranscript);
          latestRawTranscriptRef.current = data.correctedTranscript;
        } else if (data.result.transcript && !rawTranscript.trim()) {
          setRawTranscript(data.result.transcript);
          latestRawTranscriptRef.current = data.result.transcript;
        }
        if (data.corrections?.length) {
          setTranscriptCorrections(data.corrections);
        }
        showToast(`✨ 已透過「${data.mode}」完成結構化會議紀錄整理！`);
      } else {
        alert(data.error || '轉換失敗');
      }
    } catch (err) {
      alert('語音/手寫稿結構化處理發生錯誤');
    } finally {
      setAiProcessing(false);
    }
  };

  // ==================== Tab 3: 三級審核與 LINE 催簽訊息 ====================
  const handleAdvanceApproval = async (meetingId, nextStatus) => {
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance_approval',
          id: meetingId,
          nextStatus,
          approverName: approvalApproverName,
          comment: approvalComment
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeetings(data.meetings || []);
        setApprovalComment('');
        showToast('✅ 會議審核狀態已更新！');
      } else {
        alert(data.error || '審核更新失敗');
      }
    } catch (err) {
      alert('操作失敗');
    }
  };

  const handleCopyLineReminder = (meeting) => {
    const activeMembers = staff.filter((s) => s.status !== '離職');
    const unsignedNames = activeMembers
      .filter((s) => !meeting.signatures?.[s.name])
      .map((s) => `@${s.name}`);

    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const url = `${origin}/?meeting=${encodeURIComponent(meeting.id)}`;

    const text = `📢【新樓醫院 影像醫學科會議紀錄簽閱提醒】\n各位同仁好，「${meeting.title}」（開會日期：${meeting.date}）會議紀錄已發布上網。\n\n✍️ 尚未完成線上簽閱同仁（共 ${unsignedNames.length} 人）：\n${unsignedNames.join(' ')}\n\n📱 請點擊下方網址用手機點選姓名，即可 1 秒完成「已閱簽認」或「手寫電子簽名」（簽完即自動歸入歷史紀錄專區）：\n👉 ${url}`;

    navigator.clipboard.writeText(text);
    showToast('📋 已複製 LINE 群組催簽提醒文字（含未簽閱同仁點名與網址）！');
  };

  // ==================== Tab 4: 人員維護與 CSV 匯入匯出 ====================
  const handleSaveStaffMember = async (e) => {
    e.preventDefault();
    if (!editingStaff?.name?.trim()) return;

    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_single',
          member: editingStaff
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStaff(data.staff || []);
        setEditingStaff(null);
        showToast('✅ 人員資料已儲存！');
      } else {
        alert(data.error || '儲存失敗');
      }
    } catch (err) {
      alert('儲存人員失敗');
    }
  };

  const handleToggleStaffStatus = async (id, nextStatus) => {
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_status', id, status: nextStatus })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStaff(data.staff || []);
        showToast(`✅ 人員狀態已更新為「${nextStatus}」`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteStaff = async (id, name) => {
    if (!window.confirm(`確定要刪除人員「${name}」嗎？`)) return;
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStaff(data.staff || []);
        showToast('🗑️ 人員已刪除');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportStaffCsv = () => {
    const headers = ['登入代號', '姓名', '職稱', '系統角色', '所屬組別', '狀態', '備註'];
    const rows = staff.map((s) => [
      s.code || '',
      s.name || '',
      s.title || '',
      s.role || '',
      (s.groups || []).join('、'),
      s.status || '在職',
      s.note || ''
    ]);
    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `新樓醫院影像醫學科_人員名冊_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    showToast('📊 已匯出全科人員名冊 CSV (可直接用 Excel 開啟)！');
  };

  const handleAddGroupTag = async () => {
    const trimmed = (newGroupTagInput || '').trim();
    if (!trimmed) return;
    const curGroups = settings.availableGroups || ['主管/行政', '一般科會', '教學/臨床教師', '品保會議', '跨領域會議'];
    if (curGroups.includes(trimmed)) {
      alert(`組別「${trimmed}」已經存在！`);
      return;
    }
    const nextGroups = [...curGroups, trimmed];
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availableGroups: nextGroups })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings(data.settings);
        if (editingStaff) {
          const staffGrps = editingStaff.groups || [];
          if (!staffGrps.includes(trimmed)) {
            setEditingStaff({ ...editingStaff, groups: [...staffGrps, trimmed] });
          }
        }
        setNewGroupTagInput('');
        showToast(`✅ 已新增所屬組別：「${trimmed}」`);
      }
    } catch (err) {
      alert('新增組別失敗');
    }
  };

  const handleDeleteGroupTag = async (grpToDelete) => {
    if (!window.confirm(`確定要移除組別標籤「${grpToDelete}」嗎？`)) return;
    const curGroups = settings.availableGroups || [];
    const nextGroups = curGroups.filter((g) => g !== grpToDelete);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availableGroups: nextGroups })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings(data.settings);
        if (staffGroupFilter === grpToDelete) setStaffGroupFilter('ALL');
        showToast(`🗑️ 已移除組別標籤：「${grpToDelete}」`);
      }
    } catch (err) {
      alert('移除組別失敗');
    }
  };

  const handleBulkImportStaff = async () => {
    const lines = bulkCsvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      alert('請先貼上人員清單');
      return;
    }

    const parsedRows = [];
    lines.forEach((line, idx) => {
      if (idx === 0 && (line.includes('姓名') || line.includes('代號'))) return;
      const cols = line.split(/[,\t，]/).map((c) => c.replace(/^"|"$/g, '').trim());
      if (cols.length === 1) {
        parsedRows.push({ name: cols[0], title: '醫事放射師', status: '在職' });
      } else if (cols.length >= 2) {
        parsedRows.push({
          code: cols[0],
          name: cols[1],
          title: cols[2] || '醫事放射師',
          groups: cols[3] || '全科人員',
          status: cols[4] || '在職',
          note: cols[5] || ''
        });
      }
    });

    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_import', rows: parsedRows })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setStaff(data.staff || []);
      setShowBulkModal(false);
      setBulkCsvText('');
      showToast(`✅ ${data.message}`);
    } else {
      alert(data.error || '匯入失敗');
    }
  };

  // ==================== Tab 6: 系統設定與 Google Sheets 同步 ====================
  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings(data.settings);
        showToast('✅ 系統設定已成功儲存！');
      }
    } catch (err) {
      alert('儲存設定失敗');
    }
  };

  const handleSyncToGoogleSheets = async () => {
    setSyncingSheets(true);
    try {
      const res = await fetch('/api/sync-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: settings.googleSheetWebhookUrl })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings((prev) => ({ ...prev, lastSyncedAt: data.syncedAt }));
        showToast(`☁️ ${data.message}`);
      } else {
        alert(data.error || '同步失敗');
      }
    } catch (err) {
      alert('同步發生網路錯誤');
    } finally {
      setSyncingSheets(false);
    }
  };

  const handleUpdateCredentials = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRole: targetRoleCred,
          newUsername: credUsername,
          newPassword: credPassword
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCredPassword('');
        showToast('✅ 帳號密碼已成功更新！');
        loadDashboardData();
      } else {
        alert(data.error || '更新失敗');
      }
    } catch (err) {
      alert('更新失敗');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '90vh' }}>
        <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center' }}>
          正在載入管理後台與會議資料庫...
        </div>
      </div>
    );
  }

  const activeStaffMembers = staff.filter((s) => s.status !== '離職');
  const selectedApprovalMtg = meetings.find((m) => m.id === selectedApprovalMtgId) || meetings[0] || null;
  const viewingAdminMeeting = viewingAdminMeetingId
    ? meetings.find((m) => m.id === viewingAdminMeetingId) || null
    : null;
  const availableRocYears = Array.from(new Set(meetings.map((m) => getRocYear(m)))).sort((a, b) => Number(b) - Number(a));

  const getMeetingSignStats = (m) => {
    const signedMap = m?.signatures || {};
    const signedNames = Object.keys(signedMap);
    const signedCount = signedNames.length;
    const inServiceNames = staff.filter((s) => s.status === '在職').map((s) => s.name);
    const targetPool =
      m?.isArchived && (m?.reopenedForStaff || []).length === 0
        ? Array.from(new Set([...(m?.presentStaffNames || []), ...signedNames]))
        : Array.from(new Set([...inServiceNames, ...(m?.presentStaffNames || [])]));
    const unsignedNames = targetPool.filter((name) => !signedMap[name]);
    const unsignedCount = Math.max(0, unsignedNames.length);
    const isAllSigned = unsignedCount === 0 && signedCount > 0;
    return {
      signedCount,
      unsignedCount,
      signedNames,
      unsignedNames,
      isAllSigned,
      targetTotal: targetPool.length
    };
  };

  const toggleAdminSort = (col) => {
    if (adminSortBy === col) {
      setAdminSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setAdminSortBy(col);
      setAdminSortDir(col === 'title' || col === 'category' ? 'asc' : 'desc');
    }
  };

  // 提取某場會議中含有關鍵字的所有命中段落明細（標註命中位置如 [議程]、[討論內容]、[決議事項]、[待辦追蹤] 等）
  const getAdminMeetingSearchMatches = (m, kw) => {
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

  const isAdminSearchingKeyword = Boolean(meetingSearchQuery.trim());

  const filteredAdminMeetings = meetings
    .filter((m) => {
      if (filterCat !== 'ALL' && m.category !== filterCat) return false;
      if (filterYear !== 'ALL' && getRocYear(m) !== filterYear) return false;
      if (filterArchiveMode === 'ACTIVE' && m.isArchived) return false;
      if (filterArchiveMode === 'ARCHIVED' && !m.isArchived) return false;
      if (isAdminSearchingKeyword) {
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
        return matchesAllKeywords(fullCorpus, meetingSearchQuery);
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      const dir = adminSortDir === 'asc' ? 1 : -1;
      if (adminSortBy === 'category') {
        const catA = (settings.meetingCategories || []).find((c) => c.id === a.category)?.shortName || a.category || '';
        const catB = (settings.meetingCategories || []).find((c) => c.id === b.category)?.shortName || b.category || '';
        return catA.localeCompare(catB, 'zh-Hant') * dir;
      }
      if (adminSortBy === 'title') {
        return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant') * dir;
      }
      if (adminSortBy === 'unsigned') {
        const sA = getMeetingSignStats(a);
        const sB = getMeetingSignStats(b);
        if (sA.unsignedCount !== sB.unsignedCount) {
          return (sA.unsignedCount - sB.unsignedCount) * dir;
        }
        return (sA.signedCount - sB.signedCount) * dir;
      }
      const dtA = `${a.date || ''} ${a.time || ''}`;
      const dtB = `${b.date || ''} ${b.time || ''}`;
      return dtA.localeCompare(dtB) * dir;
    });

  return (
    <div style={{ maxWidth: '1260px', margin: '0 auto', padding: '1rem' }}>
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
            padding: '0.85rem 1.3rem',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            fontWeight: 600,
            fontSize: '0.92rem'
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* 頂部管理導覽列 */}
      <div
        className="glass-panel no-print"
        style={{
          padding: '1rem 1.4rem',
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
            <span className="badge" style={{ background: '#ede9fe', color: '#5b21b6' }}>
              🛡️ 管理與歷史紀錄專區維護後台
            </span>
            <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>
              登入權限：
              {adminRole === 'maintainer'
                ? '系統維護人員 (x3137)'
                : adminRole === 'manager'
                ? '科主任 / 主管 (x7260)'
                : '副組長 / 會議紀錄人 (x3137a)'}
            </span>
          </div>
          <h1 style={{ fontSize: '1.35rem', margin: '0.35rem 0 0 0' }}>
            {settings.hospitalName || '新樓基督教醫院'}・{settings.departmentName || '影像醫學科'}會議整合系統
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-secondary" style={{ padding: '0.5rem 0.95rem', fontSize: '0.86rem' }}>
            <Eye size={16} /> 前台首頁（待簽區）
          </Link>
          <Link href="/?zone=history" className="btn btn-purple" style={{ padding: '0.5rem 0.95rem', fontSize: '0.86rem' }}>
            <BookOpen size={16} /> 前台「📚 歷史紀錄專區」
          </Link>
          <button
            type="button"
            onClick={() => startNewMeeting()}
            className="btn"
            style={{ padding: '0.5rem 0.95rem', fontSize: '0.86rem' }}
          >
            <Plus size={16} /> 新增會議紀錄
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-danger"
            style={{ padding: '0.5rem 0.9rem', fontSize: '0.86rem' }}
          >
            <LogOut size={16} /> 登出
          </button>
        </div>
      </div>

      {/* 七大功能模組頁籤列 */}
      <div
        className="card no-print"
        style={{
          padding: '0.6rem',
          marginBottom: '1.15rem',
          display: 'flex',
          gap: '0.4rem',
          flexWrap: 'wrap'
        }}
      >
        {[
          { id: 'meetings', label: `📚 會議與歷史專區維護 (${meetings.length})` },
          { id: 'categories', label: `🏷️ 會議種類管理 (${(settings.meetingCategories || []).length})` },
          { id: 'voice', label: '🎙️ 語音轉會議紀錄 (AI)' },
          { id: 'approvals', label: '✍️ 審核、重啟簽核與催簽' },
          { id: 'staff', label: `👥 人員維護 (${staff.length})` },
          { id: 'analytics', label: '📊 出席率與統計 / Power BI 連動' },
          { id: 'settings', label: '⚙️ 系統與雲端設定' }
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: '1 1 auto',
                padding: '0.62rem 0.9rem',
                borderRadius: '10px',
                border: active ? 'none' : '1px solid transparent',
                background: active ? '#2563eb' : 'transparent',
                color: active ? '#ffffff' : '#334155',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ==================== TAB 1: 📚 會議與歷史紀錄專區維護 ==================== */}
      {activeTab === 'meetings' && (
        <div className="animate-fade-in">
          {editingMeeting ? (
            <div className="glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.3rem' }}>
                  {editingMeeting.id ? `✏️ 編輯會議紀錄：${editingMeeting.title}` : '➕ 新增 / 補登會議紀錄'}
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={handleSaveMeeting} className="btn btn-success">
                    <Save size={17} /> 儲存會議紀錄
                  </button>
                  <button type="button" onClick={() => setEditingMeeting(null)} className="btn btn-secondary">
                    取消返回
                  </button>
                </div>
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
                        (m) => m.id !== editingMeeting.id && m.category === editingMeeting.category
                      );
                      const target = sameCat[0] || meetings.find((m) => m.id !== editingMeeting.id);
                      if (target) {
                        applyAdminMeetingTemplate(target);
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
                      if (found) applyAdminMeetingTemplate(found);
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
                      .filter((m) => m.id !== editingMeeting.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          [{m.date}] {m.title}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* 基本資料表單 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.35rem' }}>
                    <label style={{ margin: 0 }}>✍️ 會議正式標題（可自由輸入或修改任何名稱） *</label>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setEditingMeeting({ ...editingMeeting, title: '' })}
                        className="btn btn-secondary"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                      >
                        🧹 清空自填
                      </button>
                      {[
                        '115年 影像醫學科科務會議紀錄',
                        '115年 醫事放射師教學暨CCC會議紀錄',
                        '115年 電腦斷層暨乳房攝影品保會議紀錄',
                        '115年 影像醫學科輻射防護會議紀錄',
                        '115年 影像醫學科病安暨跨領域會議紀錄'
                      ].map((presetTitle) => (
                        <button
                          key={presetTitle}
                          type="button"
                          onClick={() => setEditingMeeting({ ...editingMeeting, title: presetTitle })}
                          className="btn btn-secondary"
                          style={{ padding: '0.2rem 0.55rem', fontSize: '0.73rem' }}
                        >
                          套用：{presetTitle.replace('115年 ', '').replace('紀錄', '')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={editingMeeting.title}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, title: e.target.value })}
                    placeholder="請直接輸入您要的會議標題（例如：115年新樓醫院影像醫學科 臨時專案討論會議紀錄）"
                    style={{ fontSize: '1.02rem', fontWeight: 700, borderColor: '#2563eb' }}
                  />
                </div>

                <div className="form-group">
                  <label>會議紀錄種類（含「其它會議」） *</label>
                  <select
                    value={editingMeeting.category}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, category: e.target.value })}
                  >
                    {(settings.meetingCategories || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>專區歸屬與簽核狀態 *</label>
                  <select
                    value={editingMeeting.isArchived ? 'ARCHIVED_HISTORY' : editingMeeting.status}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'ARCHIVED_HISTORY') {
                        setEditingMeeting({ ...editingMeeting, status: 'published', isArchived: true });
                      } else {
                        setEditingMeeting({ ...editingMeeting, status: val, isArchived: false });
                      }
                    }}
                  >
                    <option value="published">✅ 開放簽閱中（未簽同仁顯示於首頁，已簽自動入歷史專區）</option>
                    <option value="ARCHIVED_HISTORY">📦 結案歸檔至「歷史紀錄專區」（所有人首頁皆不顯示）</option>
                    <option value="pending_director">⏳ 待科主任最終核准 (Pending Director)</option>
                    <option value="pending_chair">⏳ 待會議主席覆核 (Pending Chair)</option>
                    <option value="draft">📝 草稿整理中 (Draft)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>開會日期</label>
                  <input
                    type="date"
                    value={editingMeeting.date}
                    onChange={(e) => {
                      const d = e.target.value;
                      const y = parseInt((d || '2026').slice(0, 4), 10) || 2026;
                      setEditingMeeting({
                        ...editingMeeting,
                        date: d,
                        rocYear: String(y > 1911 ? y - 1911 : y)
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>開始時間</label>
                  <input
                    type="time"
                    value={editingMeeting.time}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, time: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>民國年度（供歷史紀錄專區篩選）</label>
                  <input
                    type="text"
                    value={editingMeeting.rocYear || ''}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, rocYear: e.target.value })}
                    placeholder="如：115、114、113"
                  />
                </div>

                <div className="form-group">
                  <label>公版顯示時間字串（用於 Word 報表）</label>
                  <input
                    type="text"
                    value={editingMeeting.displayDate || ''}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, displayDate: e.target.value })}
                    placeholder="如：115 年 2 月 5 日(星期三) 下午 3 時 30 分"
                  />
                </div>

                <div className="form-group">
                  <label>開會地點</label>
                  <input
                    type="text"
                    value={editingMeeting.location}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, location: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>會議主席</label>
                  <input
                    type="text"
                    value={editingMeeting.chair}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, chair: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>會議記錄人</label>
                  <input
                    type="text"
                    value={editingMeeting.recorder}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, recorder: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>應到人數</label>
                  <input
                    type="number"
                    value={editingMeeting.expectedCount}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, expectedCount: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* 出席人員 & 值班/休假人員 雙向相反連動面板（支援手動新增出席人員） */}
              {(() => {
                const baseStaffNames = activeStaffMembers.map((s) => s.name);
                const curPresent = editingMeeting.presentStaffNames || [];
                const rawLeave = editingMeeting.leaveStaffNames || [];
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
                  setEditingMeeting({
                    ...editingMeeting,
                    presentStaffNames: nextPresent,
                    leaveStaffNames: nextLeave,
                    expectedCount: Math.max(Number(editingMeeting.expectedCount) || 0, nextPresent.length + nextLeave.length)
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
                  setEditingMeeting({
                    ...editingMeeting,
                    presentStaffNames: nextPresent,
                    leaveStaffNames: nextLeave,
                    expectedCount: Math.max(Number(editingMeeting.expectedCount) || 0, nextPresent.length + nextLeave.length)
                  });
                  setCustomAttendeeInput('');
                  showToast(`✅ 已手動新增出席人員：${namesToAdd.join('、')}`);
                };

                const handleRemoveCustomPerson = (personName) => {
                  const nextPresent = curPresent.filter((n) => n !== personName);
                  const nextLeave = curLeave.filter((n) => n !== personName);
                  setEditingMeeting({
                    ...editingMeeting,
                    presentStaffNames: nextPresent,
                    leaveStaffNames: nextLeave
                  });
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '1.25rem' }}>
                    {/* 1. 出席人員點選 + 手動新增輸入框 */}
                    <div className="card" style={{ marginBottom: 0, background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <label style={{ margin: 0, color: '#1e3a8a', fontSize: '0.93rem' }}>
                          👥 出席人員點選（已勾選 {curPresent.length} 人，取消勾選即自動歸入下方「值班/休假」）：
                        </label>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingMeeting({
                                ...editingMeeting,
                                presentStaffNames: [...allCandidateNames],
                                leaveStaffNames: [],
                                expectedCount: allCandidateNames.length
                              })
                            }
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                          >
                            全選在職同仁 ({allCandidateNames.length}人皆出席)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingMeeting({
                                ...editingMeeting,
                                presentStaffNames: [],
                                leaveStaffNames: [...allCandidateNames]
                              })
                            }
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
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
                          marginBottom: '0.7rem',
                          background: '#ffffff',
                          padding: '0.45rem 0.65rem',
                          borderRadius: '10px',
                          border: '1px dashed #93c5fd',
                          flexWrap: 'wrap'
                        }}
                      >
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
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
                            padding: '0.36rem 0.65rem',
                            fontSize: '0.84rem',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px'
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomAttendee}
                          className="btn btn-primary"
                          style={{ padding: '0.36rem 0.85rem', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                        >
                          <Plus size={14} /> 新增至出席名單
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.42rem' }}>
                        {allCandidateNames.map((name) => {
                          const checked = curPresent.includes(name);
                          const isCustom = !baseStaffNames.includes(name);
                          return (
                            <div key={`present-${name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                              <button
                                type="button"
                                onClick={() => togglePersonAttendance(name, !checked)}
                                style={{
                                  padding: '0.35rem 0.7rem',
                                  borderRadius: isCustom ? '8px 0 0 8px' : '8px',
                                  border: checked ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                  background: checked ? '#dbeafe' : '#ffffff',
                                  color: checked ? '#1e40af' : '#64748b',
                                  fontWeight: checked ? 700 : 500,
                                  fontSize: '0.82rem',
                                  cursor: 'pointer'
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
                                    padding: '0.35rem 0.45rem',
                                    borderRadius: '0 8px 8px 0',
                                    border: '1px solid #fca5a5',
                                    borderLeft: 'none',
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    fontWeight: 800,
                                    fontSize: '0.8rem',
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
                    <div className="card" style={{ marginBottom: 0, background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.55rem' }}>
                        <label style={{ margin: 0, color: '#92400e', fontSize: '0.93rem' }}>
                          🌙 值班 / 休假人員點選（不會出席，已勾選 {curLeave.length} 人 — 與出席人員相反連動）：
                        </label>
                        <span style={{ fontSize: '0.78rem', color: '#b45309', fontWeight: 600 }}>
                          💡 在此勾選值班或休假同仁，上方「出席人員」會自動取消勾選
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.42rem' }}>
                        {allCandidateNames.map((name) => {
                          const isLeave = curLeave.includes(name);
                          return (
                            <button
                              key={`leave-${name}`}
                              type="button"
                              onClick={() => togglePersonAttendance(name, isLeave)}
                              style={{
                                padding: '0.35rem 0.7rem',
                                borderRadius: '8px',
                                border: isLeave ? '1.5px solid #d97706' : '1px solid #e2e8f0',
                                background: isLeave ? '#fef3c7' : '#ffffff',
                                color: isLeave ? '#92400e' : '#94a3b8',
                                fontWeight: isLeave ? 700 : 500,
                                fontSize: '0.82rem',
                                cursor: 'pointer'
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

              {/* 議程項目編輯 */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ margin: '0 0 0.6rem 0', fontSize: '1.05rem' }}>壹、會議議程主題 (每行一項)</h3>
                <textarea
                  rows={4}
                  value={(editingMeeting.agendaItems || []).join('\n')}
                  onChange={(e) =>
                    setEditingMeeting({
                      ...editingMeeting,
                      agendaItems: e.target.value.split('\n')
                    })
                  }
                  placeholder="每行輸入一項議程主題..."
                />
              </div>

              {/* 討論內容分段編輯器 */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>貳、會議討論內容分段明細</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingMeeting({
                        ...editingMeeting,
                        discussionSections: [
                          ...(editingMeeting.discussionSections || []),
                          {
                            heading: `${(editingMeeting.discussionSections || []).length + 1}. 新增討論主題`,
                            bullets: ['請輸入條列重點...']
                          }
                        ]
                      })
                    }
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem' }}
                  >
                    <Plus size={15} /> 新增討論段落
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {(editingMeeting.discussionSections || []).map((sec, sIdx) => (
                    <div
                      key={sIdx}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        padding: '0.9rem'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          value={sec.heading}
                          onChange={(e) => {
                            const next = [...editingMeeting.discussionSections];
                            next[sIdx] = { ...next[sIdx], heading: e.target.value };
                            setEditingMeeting({ ...editingMeeting, discussionSections: next });
                          }}
                          placeholder="段落標題 (如：1. 實習生相關事項討論)"
                          style={{ fontWeight: 700 }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = editingMeeting.discussionSections.filter((_, i) => i !== sIdx);
                            setEditingMeeting({ ...editingMeeting, discussionSections: next });
                          }}
                          className="btn btn-danger"
                          style={{ padding: '0.4rem 0.7rem' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <label style={{ fontSize: '0.8rem', color: '#64748b' }}>條列式討論重點（每行代表一個條列點）：</label>
                      <textarea
                        rows={5}
                        value={(sec.bullets || []).join('\n')}
                        onChange={(e) => {
                          const next = [...editingMeeting.discussionSections];
                          next[sIdx] = { ...next[sIdx], bullets: e.target.value.split('\n') };
                          setEditingMeeting({ ...editingMeeting, discussionSections: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 決議事項 */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ margin: '0 0 0.6rem 0', fontSize: '1.05rem' }}>參、會議決議事項（每行一項決議）</h3>
                <textarea
                  rows={3}
                  value={(editingMeeting.resolutions || []).join('\n')}
                  onChange={(e) =>
                    setEditingMeeting({
                      ...editingMeeting,
                      resolutions: e.target.value.split('\n')
                    })
                  }
                />
              </div>

              {/* 待辦追蹤事項 (Action Items) */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>肆、待辦追蹤事項 (Action Items)</h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={handleCarryOverPendingActions}
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem' }}
                    >
                      <RefreshCw size={14} /> 帶入前次未完成待辦
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingMeeting({
                          ...editingMeeting,
                          actionItems: [
                            ...(editingMeeting.actionItems || []),
                            {
                              id: `ACT-${Date.now().toString().slice(-4)}`,
                              task: '',
                              assignee: '潘俊儒',
                              dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                              status: '進行中'
                            }
                          ]
                        })
                      }
                      className="btn"
                      style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem' }}
                    >
                      <Plus size={14} /> 新增待辦事項
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {(editingMeeting.actionItems || []).map((item, aIdx) => (
                    <div
                      key={item.id || aIdx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 140px 120px auto',
                        gap: '0.5rem',
                        alignItems: 'center'
                      }}
                    >
                      <input
                        type="text"
                        placeholder="待辦事項具體內容..."
                        value={item.task}
                        onChange={(e) => {
                          const next = [...editingMeeting.actionItems];
                          next[aIdx] = { ...next[aIdx], task: e.target.value };
                          setEditingMeeting({ ...editingMeeting, actionItems: next });
                        }}
                      />
                      <input
                        type="text"
                        placeholder="負責人 (如：潘俊儒)"
                        value={item.assignee}
                        onChange={(e) => {
                          const next = [...editingMeeting.actionItems];
                          next[aIdx] = { ...next[aIdx], assignee: e.target.value };
                          setEditingMeeting({ ...editingMeeting, actionItems: next });
                        }}
                      />
                      <input
                        type="date"
                        value={item.dueDate || ''}
                        onChange={(e) => {
                          const next = [...editingMeeting.actionItems];
                          next[aIdx] = { ...next[aIdx], dueDate: e.target.value };
                          setEditingMeeting({ ...editingMeeting, actionItems: next });
                        }}
                      />
                      <select
                        value={item.status || '進行中'}
                        onChange={(e) => {
                          const next = [...editingMeeting.actionItems];
                          next[aIdx] = { ...next[aIdx], status: e.target.value };
                          setEditingMeeting({ ...editingMeeting, actionItems: next });
                        }}
                      >
                        <option value="未開始">未開始</option>
                        <option value="進行中">進行中</option>
                        <option value="已完成">已完成</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const next = editingMeeting.actionItems.filter((_, i) => i !== aIdx);
                          setEditingMeeting({ ...editingMeeting, actionItems: next });
                        }}
                        className="btn btn-danger"
                        style={{ padding: '0.45rem 0.65rem' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 【問卷系統連動】本場會議專屬問卷或課後測驗連結（選填） */}
              <div className="card" style={{ marginBottom: '1.25rem', background: '#f0fdfa', borderColor: '#99f6e4' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem', color: '#0f766e' }}>
                  📝 連動本場會議問卷 / 課後測驗網址（選填，未填則預設使用全科問卷系統網址）
                </h3>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={editingMeeting.surveyTitle || ''}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, surveyTitle: e.target.value })}
                    placeholder="問卷按鈕標題（如：填寫課後滿意度問卷）"
                    style={{ flex: '1 1 200px' }}
                  />
                  <input
                    type="url"
                    value={editingMeeting.surveyUrl || ''}
                    onChange={(e) => setEditingMeeting({ ...editingMeeting, surveyUrl: e.target.value })}
                    placeholder="貼上您的問卷系統網址（如 http://localhost:3001 或 Google表單 / 自製問卷網址）..."
                    style={{ flex: '2 1 320px' }}
                  />
                </div>
              </div>

              {/* 【E】會議現場照片與佐證資料上傳（支援圖片、PDF、Word、Excel、PPTX、CSV） */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                    伍、會議現場照片與 PDF / Word / Excel 佐證附件 ({(editingMeeting.attachments || []).length} 件)
                  </h3>
                  <label
                    className="btn btn-secondary"
                    style={{ margin: 0, cursor: 'pointer', padding: '0.4rem 0.85rem', fontSize: '0.84rem', background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' }}
                  >
                    <Upload size={16} /> 上傳照片或 PDF/Word/Excel 檔案 (可多選)
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
                      multiple
                      onChange={handleUploadAttachmentPhoto}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.75rem' }}>
                  {(editingMeeting.attachments || []).map((att, idx) => {
                    const isImg = isImageAttachment(att);
                    const badge = getFileTypeBadge(att);
                    return (
                      <div key={att.id || idx} style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc', padding: '0.5rem' }}>
                        {isImg ? (
                          <img src={att.url} alt={att.title} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px' }} />
                        ) : (
                          <div
                            style={{
                              height: '120px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: '#ffffff',
                              borderRadius: '6px',
                              border: '1px dashed #cbd5e1',
                              gap: '0.35rem',
                              padding: '0.5rem'
                            }}
                          >
                            <span className="badge" style={{ background: badge.bg, color: badge.color, fontSize: '0.78rem' }}>
                              {badge.label}
                            </span>
                            <div style={{ fontSize: '0.73rem', color: '#64748b', textAlign: 'center', wordBreak: 'break-all' }}>
                              {att.fileName || att.title}
                            </div>
                          </div>
                        )}
                        <input
                          type="text"
                          value={att.title}
                          onChange={(e) => {
                            const next = [...editingMeeting.attachments];
                            next[idx] = { ...next[idx], title: e.target.value };
                            setEditingMeeting({ ...editingMeeting, attachments: next });
                          }}
                          style={{ marginTop: '0.4rem', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = editingMeeting.attachments.filter((_, i) => i !== idx);
                            setEditingMeeting({ ...editingMeeting, attachments: next });
                          }}
                          className="btn btn-danger"
                          style={{ width: '100%', marginTop: '0.35rem', padding: '0.25rem', fontSize: '0.76rem' }}
                        >
                          移除附件
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                <button type="button" onClick={() => setEditingMeeting(null)} className="btn btn-secondary">
                  取消
                </button>
                <button type="button" onClick={handleSaveMeeting} className="btn btn-success">
                  <Save size={18} /> 儲存會議紀錄
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 歷史紀錄專區與會議紀錄管理篩選中心 */}
              <div className="card" style={{ marginBottom: '1rem', padding: '1.15rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.9rem' }}>
                  <div>
                    <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem' }}>
                      📚 會議紀錄 ＆ 歷史紀錄專區維護中心
                    </h2>
                    <div style={{ fontSize: '0.84rem', color: '#64748b' }}>
                      管理員可於此增減會議紀錄、區分會議種類、搜尋內文、一鍵將會議「結案歸檔至歷史專區」或「重新開放未簽者補簽」
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setActiveTab('categories')}
                      className="btn btn-secondary"
                      style={{ padding: '0.48rem 0.9rem', fontSize: '0.84rem' }}
                    >
                      <Tags size={15} /> 🏷️ 增減會議紀錄種類
                    </button>
                    <button
                      type="button"
                      onClick={() => startNewMeeting(null, true)}
                      className="btn btn-purple"
                      style={{ padding: '0.48rem 0.9rem', fontSize: '0.84rem' }}
                    >
                      <Archive size={15} /> ➕ 補登歷年會議至歷史專區
                    </button>
                    <button
                      type="button"
                      onClick={() => startNewMeeting(null, false)}
                      className="btn"
                      style={{ padding: '0.48rem 0.9rem', fontSize: '0.84rem' }}
                    >
                      <Plus size={15} /> ➕ 新增近期開放簽閱會議
                    </button>
                  </div>
                </div>

                {/* 1. 狀態與年度篩選列 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>專區狀態：</span>
                    {[
                      { id: 'ALL', label: `全部會議 (${meetings.length})` },
                      { id: 'ACTIVE', label: `✍️ 開放簽閱中 (${meetings.filter((m) => !m.isArchived).length})` },
                      { id: 'ARCHIVED', label: `📚 已結案歷史專區 (${meetings.filter((m) => m.isArchived).length})` }
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setFilterArchiveMode(st.id)}
                        style={{
                          padding: '0.35rem 0.8rem',
                          borderRadius: '999px',
                          border: filterArchiveMode === st.id ? 'none' : '1px solid #cbd5e1',
                          background: filterArchiveMode === st.id ? '#0f172a' : '#f8fafc',
                          color: filterArchiveMode === st.id ? '#ffffff' : '#334155',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>📅 年度：</span>
                    <button
                      type="button"
                      onClick={() => setFilterYear('ALL')}
                      style={{
                        padding: '0.32rem 0.7rem',
                        borderRadius: '999px',
                        border: filterYear === 'ALL' ? 'none' : '1px solid #cbd5e1',
                        background: filterYear === 'ALL' ? '#2563eb' : '#ffffff',
                        color: filterYear === 'ALL' ? '#ffffff' : '#334155',
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
                        onClick={() => setFilterYear(yr)}
                        style={{
                          padding: '0.32rem 0.7rem',
                          borderRadius: '999px',
                          border: filterYear === yr ? 'none' : '1px solid #cbd5e1',
                          background: filterYear === yr ? '#2563eb' : '#ffffff',
                          color: filterYear === yr ? '#ffffff' : '#334155',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {yr} 年
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. 會議種類篩選列 */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                  <button
                    type="button"
                    onClick={() => setFilterCat('ALL')}
                    style={{
                      padding: '0.4rem 0.85rem',
                      borderRadius: '999px',
                      border: filterCat === 'ALL' ? 'none' : '1px solid #cbd5e1',
                      background: filterCat === 'ALL' ? '#2563eb' : '#ffffff',
                      color: filterCat === 'ALL' ? '#ffffff' : '#334155',
                      fontWeight: 700,
                      fontSize: '0.83rem',
                      cursor: 'pointer'
                    }}
                  >
                    全部會議種類 ({meetings.length})
                  </button>
                  {(settings.meetingCategories || []).map((c) => {
                    const cnt = meetings.filter((m) => m.category === c.id).length;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setFilterCat(c.id)}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: '999px',
                          border: filterCat === c.id ? 'none' : '1px solid #cbd5e1',
                          background: filterCat === c.id ? c.color : '#ffffff',
                          color: filterCat === c.id ? '#ffffff' : '#334155',
                          fontWeight: 700,
                          fontSize: '0.83rem',
                          cursor: 'pointer'
                        }}
                      >
                        {c.shortName || c.name} ({cnt})
                      </button>
                    );
                  })}
                </div>

                {/* 3. 會議紀錄內容全文搜尋框 */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="🔍 搜尋歷史會議紀錄關鍵字（支援多關鍵字空白分隔，如：EPA、ACR假體、換管球、GE高階CT、乳房攝影、實習生...）"
                    value={meetingSearchQuery}
                    onChange={(e) => {
                      setMeetingSearchQuery(e.target.value);
                      if (viewingAdminMeetingId) setViewingAdminMeetingId(null);
                    }}
                    style={{
                      flex: 1,
                      minWidth: '250px',
                      border: isAdminSearchingKeyword ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                      background: isAdminSearchingKeyword ? '#faf5ff' : '#ffffff'
                    }}
                  />
                  {meetingSearchQuery.trim() && (
                    <button type="button" onClick={() => setMeetingSearchQuery('')} className="btn btn-secondary">
                      ✕ 清除搜尋
                    </button>
                  )}
                </div>

                {/* 常用歷史關鍵字快速點選標籤 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b' }}>🔥 常用歷史關鍵字快速查找：</span>
                  {['EPA', 'ACR假體', '換管球', 'GE高階CT', '乳房攝影', '輻射防護', '實習生', '品保', '當責 Q10'].map((kw) => {
                    const activeKw = meetingSearchQuery.trim().toLowerCase() === kw.toLowerCase();
                    return (
                      <button
                        key={kw}
                        type="button"
                        onClick={() => {
                          setMeetingSearchQuery(activeKw ? '' : kw);
                          setViewingAdminMeetingId(null);
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

                {isAdminSearchingKeyword && (
                  <div style={{ marginTop: '0.65rem', fontSize: '0.88rem', fontWeight: 800, color: '#5b21b6' }}>
                    🔍 歷史與全庫會議關鍵字「{meetingSearchQuery}」搜尋結果：共找到 {filteredAdminMeetings.length} 份會議紀錄（點選任一列即可展開完整內容）
                  </div>
                )}
              </div>

              {/* ==================== 維護中心：極簡列表模式 vs 點進去才顯示完整內容模式 ==================== */}
              {!viewingAdminMeeting ? (
                <div
                  style={{
                    background: '#ffffff',
                    border: isAdminSearchingKeyword ? '2px solid #a855f7' : '1px solid #cbd5e1',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
                  }}
                >
                  {/* 【G】列表表頭（支援點擊依「會議分類」、「標題」、「已簽核/未簽核」、「開會時間」正序/倒序排序） */}
                  <div
                    className="meeting-list-grid meeting-list-header-mobile-hide"
                    style={{
                      padding: '0.8rem 1.2rem',
                      background: isAdminSearchingKeyword ? '#faf5ff' : '#f8fafc',
                      borderBottom: '1px solid #cbd5e1',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      color: '#475569',
                      userSelect: 'none'
                    }}
                  >
                    <div
                      onClick={() => toggleAdminSort('category')}
                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                      title="點擊依會議分類排序"
                    >
                      會議分類
                      <span style={{ color: adminSortBy === 'category' ? '#2563eb' : '#94a3b8', fontSize: '0.78rem' }}>
                        {adminSortBy === 'category' ? (adminSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </div>
                    <div
                      onClick={() => toggleAdminSort('title')}
                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                      title="點擊依會議標題排序"
                    >
                      會議紀錄標題 {isAdminSearchingKeyword && '（含關鍵字命中段落明細）'}
                      <span style={{ color: adminSortBy === 'title' ? '#2563eb' : '#94a3b8', fontSize: '0.78rem' }}>
                        {adminSortBy === 'title' ? (adminSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </div>
                    <div
                      onClick={() => toggleAdminSort('unsigned')}
                      style={{ textAlign: 'center', cursor: 'pointer' }}
                      title="點擊依未簽核人數排序"
                    >
                      <span style={{ color: '#059669' }}>已簽核</span> / <span style={{ color: '#dc2626' }}>未簽核</span>
                      <span style={{ color: adminSortBy === 'unsigned' ? '#2563eb' : '#94a3b8', fontSize: '0.78rem', marginLeft: '0.25rem' }}>
                        {adminSortBy === 'unsigned' ? (adminSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </div>
                    <div
                      onClick={() => toggleAdminSort('date')}
                      style={{ textAlign: 'right', cursor: 'pointer' }}
                      title="點擊依開會時間新舊排序"
                    >
                      開會時間
                      <span style={{ color: adminSortBy === 'date' ? '#2563eb' : '#94a3b8', fontSize: '0.78rem', marginLeft: '0.25rem' }}>
                        {adminSortBy === 'date' ? (adminSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </div>
                  </div>

                  {filteredAdminMeetings.map((m, idx) => {
                    const cat = (settings.meetingCategories || []).find((c) => c.id === m.category) || {
                      name: m.category,
                      shortName: m.category,
                      badgeBg: '#dbeafe',
                      color: '#1e40af'
                    };
                    const stats = getMeetingSignStats(m);
                    const searchMatches = isAdminSearchingKeyword ? getAdminMeetingSearchMatches(m, meetingSearchQuery) : [];

                    return (
                      <div
                        key={m.id}
                        className="meeting-list-grid"
                        onClick={() => {
                          setViewingAdminMeetingId(m.id);
                          setQuickEditMtgId(null);
                          if (typeof window !== 'undefined') {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        style={{
                          padding: '0.92rem 1.2rem',
                          borderBottom: idx === filteredAdminMeetings.length - 1 ? 'none' : '1px solid #e2e8f0',
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                          <span
                            className="badge"
                            style={{
                              background: cat.badgeBg,
                              color: cat.color,
                              fontSize: '0.8rem',
                              padding: '0.26rem 0.68rem'
                            }}
                          >
                            {cat.shortName || cat.name}
                          </span>
                          {isAdminSearchingKeyword && (
                            <span style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 700, paddingLeft: '0.2rem' }}>
                              {getRocYear(m)}年度・{m.isArchived ? '📚歷史歸檔' : '✍️開放中'}
                            </span>
                          )}
                        </div>

                        {/* 2. 會議標題與關鍵字命中段落明細 */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <HighlightText text={m.title} keyword={meetingSearchQuery} />
                            {isAdminSearchingKeyword && searchMatches.length > 0 && (
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
                          {isAdminSearchingKeyword && searchMatches.length > 0 && (
                            <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
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
                                  <span style={{ fontWeight: 800, color: '#7c3aed', marginRight: '0.35rem', fontSize: '0.75rem' }}>
                                    [{hit.section}]
                                  </span>
                                  <HighlightText text={hit.text} keyword={meetingSearchQuery} />
                                </div>
                              ))}
                              {searchMatches.length > 4 && (
                                <div style={{ fontSize: '0.75rem', color: '#6d28d9', fontWeight: 600, paddingLeft: '0.2rem' }}>
                                  ＋ 還有 {searchMatches.length - 4} 處命中內容，點擊此列展開完整會議紀錄...
                                </div>
                              )}
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
                            title={`已簽核 ${stats.signedCount} 人`}
                          >
                            {stats.signedCount}
                          </span>
                          <span style={{ color: '#cbd5e1', fontWeight: 700 }}>/</span>
                          <span
                            style={{
                              background: stats.unsignedCount > 0 ? '#fee2e2' : '#f1f5f9',
                              color: stats.unsignedCount > 0 ? '#dc2626' : '#94a3b8',
                              fontWeight: 800,
                              fontSize: '0.88rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '999px',
                              minWidth: '34px',
                              textAlign: 'center'
                            }}
                            title={`未簽核 ${stats.unsignedCount} 人`}
                          >
                            {stats.unsignedCount}
                          </span>
                        </div>

                        {/* 4. 開會時間 */}
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

                  {filteredAdminMeetings.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                      找不到符合篩選條件的會議紀錄
                    </div>
                  )}
                </div>
              ) : (
                /* ==================== 點選列表後顯示：單篇會議完整內容與管理操作專區 ==================== */
                (() => {
                  const m = viewingAdminMeeting;
                  const cat = (settings.meetingCategories || []).find((c) => c.id === m.category) || {
                    name: m.category,
                    shortName: m.category,
                    badgeBg: '#dbeafe',
                    color: '#1e40af'
                  };
                  const stats = getMeetingSignStats(m);

                  return (
                    <div className="glass-panel animate-fade-in">
                      {/* 頂部返回列表與管理操作按鈕列 */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.6rem',
                          paddingBottom: '0.95rem',
                          marginBottom: '1rem',
                          borderBottom: '1px solid #cbd5e1'
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setViewingAdminMeetingId(null);
                            setQuickEditMtgId(null);
                          }}
                          className="btn btn-secondary"
                          style={{
                            padding: '0.5rem 1.05rem',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            background: '#eff6ff',
                            color: '#1e40af',
                            borderColor: '#93c5fd'
                          }}
                        >
                          ⬅️ 返回維護中心會議列表
                        </button>

                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          {m.isArchived ? (
                            <button
                              type="button"
                              onClick={() => handleToggleArchiveMeeting(m, false)}
                              className="btn btn-success"
                              style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                            >
                              <Unlock size={15} /> 🔓 重新開放未簽者補簽
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleArchiveMeeting(m, true)}
                              className="btn btn-secondary"
                              style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                            >
                              <Archive size={15} /> 📦 結案歸檔至歷史專區
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedApprovalMtgId(m.id);
                              setActiveTab('approvals');
                            }}
                            className="btn btn-purple"
                            style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                          >
                            <RotateCcw size={15} /> 簽核明細 / 個別退回重簽
                          </button>

                          <button
                            type="button"
                            onClick={() => openQrCodeModal(m)}
                            className="btn btn-secondary"
                            style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}
                          >
                            <QrCode size={15} /> QR Code
                          </button>

                          <button
                            type="button"
                            onClick={() => handleExportDocx(m)}
                            className="btn btn-secondary"
                            style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}
                          >
                            <Download size={15} /> 匯出 Word
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingMeeting(JSON.parse(JSON.stringify(m)))}
                            className="btn"
                            style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                          >
                            <Edit3 size={15} /> ✏️ 編輯完整內容
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              await handleDeleteMeeting(m.id, m.title);
                              setViewingAdminMeetingId(null);
                            }}
                            className="btn btn-danger"
                            style={{ padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                          >
                            <Trash2 size={15} /> 刪除
                          </button>
                        </div>
                      </div>

                      {/* 標題與分類快速修改區 */}
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                          <span className="badge" style={{ background: cat.badgeBg, color: cat.color }}>
                            {cat.name}
                          </span>
                          <span className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                            {getRocYear(m)} 年度
                          </span>
                          {m.isArchived ? (
                            <span className="badge" style={{ background: '#e2e8f0', color: '#334155' }}>
                              📦 已結案歸檔於「歷史紀錄專區」
                            </span>
                          ) : (
                            <span className="badge" style={{ background: '#d1fae5', color: '#065f46' }}>
                              ✍️ 開放簽閱中
                            </span>
                          )}
                        </div>

                        {quickEditMtgId === m.id ? (
                          <div
                            style={{
                              display: 'flex',
                              gap: '0.45rem',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              background: '#eff6ff',
                              padding: '0.65rem',
                              borderRadius: '10px',
                              border: '1px solid #93c5fd'
                            }}
                          >
                            <input
                              type="text"
                              value={quickEditTitle}
                              onChange={(e) => setQuickEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleQuickUpdateMeetingTitle(m.id, quickEditTitle, quickEditCategory);
                                }
                              }}
                              placeholder="請輸入新的會議標題..."
                              style={{ flex: '1 1 280px', fontWeight: 700, fontSize: '1rem' }}
                              autoFocus
                            />
                            <select
                              value={quickEditCategory || m.category}
                              onChange={(e) => setQuickEditCategory(e.target.value)}
                              style={{ width: 'auto', minWidth: '180px', fontWeight: 600 }}
                            >
                              {(settings.meetingCategories || []).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.shortName || c.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleQuickUpdateMeetingTitle(m.id, quickEditTitle, quickEditCategory)}
                              className="btn btn-success"
                              style={{ padding: '0.42rem 0.85rem', fontSize: '0.82rem' }}
                            >
                              <Save size={15} /> 儲存標題
                            </button>
                            <button
                              type="button"
                              onClick={() => setQuickEditMtgId(null)}
                              className="btn btn-secondary"
                              style={{ padding: '0.42rem 0.75rem', fontSize: '0.82rem' }}
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a' }}>
                              <HighlightText text={m.title} keyword={meetingSearchQuery} />
                            </h2>
                            <button
                              type="button"
                              onClick={() => {
                                setQuickEditMtgId(m.id);
                                setQuickEditTitle(m.title);
                                setQuickEditCategory(m.category);
                              }}
                              className="btn btn-secondary"
                              style={{ padding: '0.22rem 0.65rem', fontSize: '0.76rem', color: '#1e40af', borderColor: '#93c5fd', background: '#eff6ff' }}
                            >
                              <Edit3 size={13} /> 改標題/種類
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 已簽核 / 未簽核 人數與名單醒目標示卡 */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                          gap: '0.85rem',
                          marginBottom: '1.15rem'
                        }}
                      >
                        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <strong style={{ color: '#065f46', fontSize: '0.95rem' }}>
                              ✅ 已簽核人數：{stats.signedCount} 人
                            </strong>
                            <span className="badge" style={{ background: '#d1fae5', color: '#047857', fontSize: '0.75rem' }}>
                              已完成簽閱
                            </span>
                          </div>
                          <div style={{ fontSize: '0.82rem', color: '#047857', lineHeight: 1.6 }}>
                            {stats.signedNames.length > 0 ? stats.signedNames.join('、') : '尚無人簽核'}
                          </div>
                        </div>

                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.35rem' }}>
                            <strong style={{ color: '#991b1b', fontSize: '0.95rem' }}>
                              🔴 未簽核人數：{stats.unsignedCount} 人
                            </strong>
                            {stats.unsignedCount > 0 && (
                              <button
                                type="button"
                                onClick={() => handleCopyLineReminder(m)}
                                className="btn btn-purple"
                                style={{ padding: '0.2rem 0.6rem', fontSize: '0.74rem' }}
                              >
                                <Copy size={12} /> 複製 LINE 催簽提醒
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: '0.82rem', color: '#b91c1c', lineHeight: 1.6 }}>
                            {stats.unsignedNames.length > 0 ? stats.unsignedNames.join('、') : '🎉 全員皆已完成簽核！'}
                          </div>
                        </div>
                      </div>

                      {/* 會議基本資料表 */}
                      <div
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          marginBottom: '1.25rem',
                          background: '#ffffff'
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            borderBottom: '1px solid #e2e8f0',
                            fontSize: '0.88rem'
                          }}
                        >
                          <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>📅 開會時間：</span>
                            <strong>{m.displayDate || `${m.date} ${m.time}`}</strong>
                          </div>
                          <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>📍 開會地點：</span>
                            <strong>{m.location}</strong>
                          </div>
                          <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>👤 會議主席：</span>
                            <strong>{m.chair}</strong>
                          </div>
                          <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>📝 會議記錄：</span>
                            <strong>{m.recorder}</strong>
                          </div>
                        </div>
                        <div style={{ padding: '0.75rem 1rem', fontSize: '0.86rem', lineHeight: 1.6 }}>
                          <div>
                            <strong style={{ color: '#334155' }}>👥 出席人員（{(m.presentStaffNames || []).length} 人）：</strong>
                            {(m.presentStaffNames || []).join('、') || '—'}
                          </div>
                          {(m.leaveStaffNames || []).length > 0 && (
                            <div style={{ marginTop: '0.3rem', color: '#b45309' }}>
                              <strong>🌙 值班 / 休假人員（未出席，{m.leaveStaffNames.length} 人）：</strong>
                              {m.leaveStaffNames.join('、')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 壹、議程主題 */}
                      {(m.agendaItems || []).length > 0 && (
                        <div style={{ marginBottom: '1.25rem' }}>
                          <h3 style={{ fontSize: '1.05rem', color: '#1e3a8a', borderBottom: '2px solid #dbeafe', paddingBottom: '0.35rem', marginBottom: '0.65rem' }}>
                            壹、會議議程與討論主題
                          </h3>
                          <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.7 }}>
                            {m.agendaItems.map((ag, i) => (
                              <li key={i} style={{ fontWeight: 600, color: '#1e293b' }}>
                                <HighlightText text={ag} keyword={meetingSearchQuery} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 貳、討論內容 */}
                      {(m.discussionSections || []).length > 0 && (
                        <div style={{ marginBottom: '1.25rem' }}>
                          <h3 style={{ fontSize: '1.05rem', color: '#1e3a8a', borderBottom: '2px solid #dbeafe', paddingBottom: '0.35rem', marginBottom: '0.65rem' }}>
                            貳、會議討論內容與重點紀錄
                          </h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {m.discussionSections.map((sec, sIdx) => (
                              <div key={sIdx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem' }}>
                                  <HighlightText text={sec.heading} keyword={meetingSearchQuery} />
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.65, fontSize: '0.92rem', color: '#334155' }}>
                                  {(sec.bullets || []).map((b, bIdx) => (
                                    <li key={bIdx}>
                                      <HighlightText text={b} keyword={meetingSearchQuery} />
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 參、決議事項 */}
                      {(m.resolutions || []).length > 0 && (
                        <div style={{ marginBottom: '1.25rem' }}>
                          <h3 style={{ fontSize: '1.05rem', color: '#1e3a8a', borderBottom: '2px solid #dbeafe', paddingBottom: '0.35rem', marginBottom: '0.65rem' }}>
                            參、會議決議事項
                          </h3>
                          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                            <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.7, fontWeight: 600, color: '#064e3b' }}>
                              {m.resolutions.map((r, rIdx) => (
                                <li key={rIdx}>
                                  <HighlightText text={r} keyword={meetingSearchQuery} />
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      )}

                      {/* 肆、待辦追蹤事項 */}
                      {(m.actionItems || []).length > 0 && (
                        <div style={{ marginBottom: '1.25rem' }}>
                          <h3 style={{ fontSize: '1.05rem', color: '#1e3a8a', borderBottom: '2px solid #dbeafe', paddingBottom: '0.35rem', marginBottom: '0.65rem' }}>
                            肆、待辦追蹤事項 (Action Items)
                          </h3>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', background: '#ffffff' }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                                  <th style={{ padding: '0.6rem 0.8rem' }}>待辦事項內容</th>
                                  <th style={{ padding: '0.6rem 0.8rem' }}>負責人員</th>
                                  <th style={{ padding: '0.6rem 0.8rem' }}>期限</th>
                                  <th style={{ padding: '0.6rem 0.8rem' }}>狀態</th>
                                </tr>
                              </thead>
                              <tbody>
                                {m.actionItems.map((act, aIdx) => (
                                  <tr key={act.id || aIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>
                                      <HighlightText text={act.task} keyword={meetingSearchQuery} />
                                    </td>
                                    <td style={{ padding: '0.6rem 0.8rem' }}>
                                      <HighlightText text={act.assignee} keyword={meetingSearchQuery} />
                                    </td>
                                    <td style={{ padding: '0.6rem 0.8rem' }}>{act.dueDate || '—'}</td>
                                    <td style={{ padding: '0.6rem 0.8rem' }}>
                                      <span className="badge" style={{ background: act.status === '已完成' ? '#d1fae5' : '#fef3c7', color: act.status === '已完成' ? '#065f46' : '#92400e' }}>
                                        {act.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* 【E】伍、附件與現場照片（支援圖片預覽與 PDF/Word/Excel/PPTX/CSV 檔案下載） */}
                      {(m.attachments || []).length > 0 && (
                        <div>
                          <h3 style={{ fontSize: '1.05rem', color: '#1e3a8a', borderBottom: '2px solid #dbeafe', paddingBottom: '0.35rem', marginBottom: '0.65rem' }}>
                            伍、會議現場照片與佐證附件（共 {m.attachments.length} 件）
                          </h3>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.75rem' }}>
                            {m.attachments.map((att, idx) => {
                              const isImg = isImageAttachment(att);
                              const badge = getFileTypeBadge(att);
                              return (
                                <div key={att.id || idx} style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc', padding: '0.55rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                  {isImg ? (
                                    <img src={att.url} alt={att.title} style={{ width: '100%', height: '130px', objectFit: 'cover', borderRadius: '6px' }} />
                                  ) : (
                                    <div style={{ height: '115px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRadius: '6px', border: '1px dashed #cbd5e1', gap: '0.35rem', padding: '0.5rem' }}>
                                      <span className="badge" style={{ background: badge.bg, color: badge.color, fontSize: '0.8rem' }}>
                                        {badge.label}
                                      </span>
                                      <div style={{ fontSize: '0.74rem', color: '#64748b', textAlign: 'center', wordBreak: 'break-all' }}>
                                        {att.fileName || att.title}
                                      </div>
                                    </div>
                                  )}
                                  <div style={{ marginTop: '0.45rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem' }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={att.title}>
                                      {att.title}
                                    </div>
                                    <a
                                      href={att.url}
                                      download={att.fileName || att.title || `附件_${idx + 1}`}
                                      className="btn btn-secondary"
                                      style={{
                                        padding: '0.2rem 0.55rem',
                                        fontSize: '0.74rem',
                                        textDecoration: 'none',
                                        background: '#eff6ff',
                                        color: '#1d4ed8',
                                        borderColor: '#bfdbfe',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      ⬇️ 下載
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </>
          )}
        </div>
      )}

      {/* ==================== TAB: 🏷️ 會議紀錄種類維護 (增減/改名/排序會議種類) ==================== */}
      {activeTab === 'categories' && (
        <div className="glass-panel animate-fade-in">
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Tags color="#2563eb" /> 🏷️ 會議紀錄種類維護（歷史紀錄專區分類管理）
            </h2>
            <p className="subtitle" style={{ margin: 0 }}>
              您可於此自由新增、修改、調整順序或刪除會議紀錄種類。所有變更會立即同步至前台「📚 歷史紀錄專區」與「🎙️ 語音轉會議紀錄」選單！
            </p>
          </div>

          {/* 新增會議種類表單 */}
          <form onSubmit={handleAddCategory} className="card" style={{ marginBottom: '1.4rem', background: '#eff6ff', borderColor: '#93c5fd' }}>
            <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '1.08rem', color: '#1e3a8a' }}>➕ 新增會議紀錄種類</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '0.9rem' }}>
              <div>
                <label>種類完整名稱 *</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="例如：MRI 磁振造影品保暨學術討論會"
                />
              </div>
              <div>
                <label>頁籤顯示簡稱 *</label>
                <input
                  type="text"
                  value={newCatShortName}
                  onChange={(e) => setNewCatShortName(e.target.value)}
                  placeholder="例如：MRI品保會議"
                />
              </div>
              <div>
                <label>語音轉紀錄預設套用模板</label>
                <select value={newCatTemplate} onChange={(e) => setNewCatTemplate(e.target.value)}>
                  <option value="dept">科務 / 行政會議模板</option>
                  <option value="ccc">教學暨 CCC 臨床能力委員會模板</option>
                  <option value="qa">醫療曝露品保 (QA/QC) 模板</option>
                  <option value="rad">輻射防護會議模板</option>
                  <option value="safety">病安案例暨跨領域討論模板</option>
                  <option value="other">其它會議 / 自訂通用模板</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '0.95rem' }}>
              <label>選擇標籤代表配色：</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {COLOR_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setNewCatColorIdx(idx)}
                    style={{
                      padding: '0.35rem 0.8rem',
                      borderRadius: '999px',
                      border: newCatColorIdx === idx ? `2px solid ${preset.color}` : '1px solid #cbd5e1',
                      background: preset.badgeBg,
                      color: preset.color,
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    {newCatColorIdx === idx ? '✓ ' : ''}{preset.label}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="btn">
              <Plus size={16} /> 確認新增會議種類
            </button>
          </form>

          {/* 現有會議種類列表（支援直接修改名稱、上下排序、刪除） */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {(settings.meetingCategories || []).map((cat, idx) => {
              const count = meetings.filter((m) => m.category === cat.id).length;
              return (
                <div
                  key={cat.id}
                  className="card"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    padding: '0.9rem 1.15rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '260px', flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: cat.badgeBg, color: cat.color, fontSize: '0.85rem', padding: '0.35rem 0.8rem' }}>
                      {cat.shortName || cat.name}
                    </span>
                    <input
                      type="text"
                      value={cat.name}
                      onChange={(e) => {
                        const list = [...settings.meetingCategories];
                        list[idx] = { ...list[idx], name: e.target.value };
                        setSettings({ ...settings, meetingCategories: list });
                      }}
                      style={{ maxWidth: '320px', fontWeight: 600 }}
                    />
                    <input
                      type="text"
                      value={cat.shortName || ''}
                      onChange={(e) => {
                        const list = [...settings.meetingCategories];
                        list[idx] = { ...list[idx], shortName: e.target.value };
                        setSettings({ ...settings, meetingCategories: list });
                      }}
                      placeholder="簡稱"
                      style={{ maxWidth: '150px' }}
                    />
                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                      目前收納 <strong>{count}</strong> 筆會議紀錄
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => handleMoveCategory(idx, -1)}
                      disabled={idx === 0}
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.6rem' }}
                      title="上移"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveCategory(idx, 1)}
                      disabled={idx === (settings.meetingCategories || []).length - 1}
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.6rem' }}
                      title="下移"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => saveUpdatedCategories(settings.meetingCategories)}
                      className="btn btn-success"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      <Save size={14} /> 儲存修改
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat)}
                      className="btn btn-danger"
                      style={{ padding: '0.35rem 0.65rem' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: 🎙️ 語音轉會議紀錄工作台 ==================== */}
      {activeTab === 'voice' && (
        <div className="glass-panel animate-fade-in">
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mic color="#7c3aed" /> 🎙️ 語音轉換成會議紀錄 ＆ AI 智慧結構化整理工作台
            </h2>
            <p className="subtitle" style={{ margin: 0 }}>
              支援「現場麥克風即時語音辨識（免 API Key）」、「上傳手機錄音檔 (.mp3/.m4a/.wav)」，並依影醫科各會議種類模板自動整理成正式會議紀錄！
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>1. 選擇要套用的會議紀錄種類模板 *</label>
              <select value={voiceCategory} onChange={(e) => setVoiceCategory(e.target.value)}>
                {(settings.meetingCategories || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>2. 會議標題（可自行輸入任何標題；留空則由 AI 依種類產生）</label>
              <input
                type="text"
                value={voiceMeetingTitle}
                onChange={(e) => setVoiceMeetingTitle(e.target.value)}
                placeholder="請直接輸入您要的會議標題，例如：115年影像醫學科 臨時專案討論會議"
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
              marginBottom: '1.25rem'
            }}
          >
            <div className="card" style={{ background: isRecording ? '#fef2f2' : '#f8fafc', borderColor: isRecording ? '#f87171' : '#cbd5e1' }}>
              <div style={{ fontWeight: 700, fontSize: '0.96rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Mic size={18} color={isRecording ? '#dc2626' : '#2563eb'} /> 方式 A：現場即時麥克風錄音轉文字（免金鑰）
              </div>
              <div style={{ fontSize: '0.83rem', color: '#64748b', marginBottom: '0.85rem' }}>
                開會時將手機或筆電放於桌面，點擊開始錄音即可即時辨識繁體中文並轉出逐字稿。
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                {!isRecording ? (
                  <button type="button" onClick={startVoiceRecording} className="btn" style={{ background: '#dc2626' }}>
                    <Mic size={17} /> 開始現場即時錄音辨識
                  </button>
                ) : (
                  <button type="button" onClick={() => stopVoiceRecording(true)} className="btn recording-pulse" style={{ background: '#991b1b' }}>
                    <MicOff size={17} /> 停止錄音並自動修正詞句 ({recordingSeconds} 秒)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => activateAdminMobileKeyboardDictation()}
                  className="btn btn-secondary"
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.75rem',
                    background: '#fffbeb',
                    color: '#b45309',
                    borderColor: '#fcd34d'
                  }}
                >
                  ⌨️ 手機鍵盤「🎤語音輸入」(LINE/iOS最準)
                </button>

                {recordedAudioUrl && (
                  <a
                    href={recordedAudioUrl}
                    download={`會議錄音_${new Date().toISOString().slice(0, 10)}.webm`}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.82rem', padding: '0.45rem 0.8rem' }}
                  >
                    <Download size={15} /> 下載現場錄音檔
                  </a>
                )}
              </div>
            </div>

            <div className="card" style={{ background: '#f8fafc' }}>
              <div style={{ fontWeight: 700, fontSize: '0.96rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FileAudio size={18} color="#7c3aed" /> 方式 B：上傳手機錄音檔 (.mp3 / .m4a / .wav)
              </div>
              <div style={{ fontSize: '0.83rem', color: '#64748b', marginBottom: '0.85rem' }}>
                支援將手機錄音筆檔案上傳，透過 Gemini 多模態模型直接聽寫並整理成會議紀錄。
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <label className="btn btn-purple" style={{ margin: 0, cursor: 'pointer' }}>
                  <Upload size={16} /> 選擇手機錄音檔上傳
                  <input
                    type="file"
                    accept="audio/*,.mp3,.m4a,.wav,.webm"
                    onChange={handleAudioFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                {uploadedAudioFile && (
                  <span style={{ fontSize: '0.82rem', color: '#5b21b6', fontWeight: 600 }}>
                    ✅ 已選取：{uploadedAudioFile.name}
                  </span>
                )}
              </div>
            </div>

            <div className="card" style={{ background: '#ecfdf5', borderColor: '#6ee7b7' }}>
              <div style={{ fontWeight: 700, fontSize: '0.96rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#065f46' }}>
                <FileText size={18} color="#059669" /> 方式 C：📷 上傳手寫稿／筆記照片轉換潤飾（備用）
              </div>
              <div style={{ fontSize: '0.83rem', color: '#047857', marginBottom: '0.85rem' }}>
                支援拍攝或上傳 1～多張手寫會議筆記照片，自動辨識手寫字與醫療縮寫並潤飾為正式會議紀錄。
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <label className="btn btn-success" style={{ margin: 0, cursor: 'pointer', padding: '0.45rem 0.85rem', fontSize: '0.84rem' }}>
                  <Upload size={15} /> 📷 選擇手寫稿照片上傳
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleHandwrittenImageUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                {uploadedHandwrittenImages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handlePolishTranscript()}
                    disabled={polishingTranscript}
                    className="btn btn-secondary"
                    style={{ padding: '0.42rem 0.75rem', fontSize: '0.8rem', borderColor: '#059669', color: '#065f46' }}
                  >
                    🪄 {polishingTranscript ? '辨識潤飾中...' : `辨識並潤飾 (${uploadedHandwrittenImages.length}張)`}
                  </button>
                )}
              </div>

              {uploadedHandwrittenImages.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                    {uploadedHandwrittenImages.map((img) => (
                      <div
                        key={img.id}
                        style={{
                          position: 'relative',
                          border: '1px solid #10b981',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          background: '#ffffff',
                          width: '68px',
                          height: '68px'
                        }}
                        title={img.name}
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setUploadedHandwrittenImages((prev) => prev.filter((item) => item.id !== img.id))
                          }
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            background: 'rgba(220,38,38,0.9)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '18px',
                            height: '18px',
                            fontSize: '11px',
                            lineHeight: '18px',
                            cursor: 'pointer',
                            padding: 0
                          }}
                          title="移除此張手寫稿"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: '#065f46', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={attachHandwrittenToMeeting}
                      onChange={(e) => setAttachHandwrittenToMeeting(e.target.checked)}
                      style={{ width: '14px', height: '14px' }}
                    />
                    轉入會議紀錄時，一併將手寫稿照片存為會議附件備查
                  </label>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>💡 快速載入科內真實會議口語／手寫速記範例測試：</span>
            <button
              type="button"
              onClick={() => {
                setVoiceCategory('ccc');
                setVoiceMeetingTitle('115 年新樓醫院醫事放射師 教學暨CCC臨床能力評核會議');
                setRawTranscript(
                  '主席林宜蓁：各位同仁午安，今天召開教學暨CCC會議。首先第一點討論115年樹人醫專2位實習生葉采誼、賴思涵的輪訓安排，由陳憶頡擔任導師、潘俊儒擔任副導師，實習共28週，奇美核醫4/6到4/10，放腫3/9到4/3，請陳憶頡與潘俊儒負責追蹤實習生每週三下午三點回影醫科上基礎課程。\n第二點關於EPA試行版評分，我們要統一各檢查細項的評分共識標準，實習生維持紙本評分，請林宜蓁與潘俊儒在月底前彙整共識表。\n第三點進行PGY第二次EPA信賴等級評核：黃品睿電腦斷層已完訓，決議評核結果為信賴等級LEVEL4；吳思霈電腦斷層評核LEVEL4，乳房攝影Mammo與病患應對流暢評LEVEL4，但開刀患側擺位與異常事件處理請高瑞隆與楊蕙芳持續指導追蹤；施詠勛目前為PGY2受訓中，高瑞隆導師評LEVEL3b，潘俊儒補充可達LEVEL3c，一般診斷攝影評核結果為LEVEL3c。'
                );
              }}
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
            >
              載入「教學暨CCC會議」口語範例
            </button>
            <button
              type="button"
              onClick={() => {
                setVoiceCategory('qa');
                setVoiceMeetingTitle('115 年電腦斷層暨乳房攝影品保會議');
                setRawTranscript(
                  '主席許志賢醫師：各位同仁早安，今天召開CT暨乳房攝影輻射醫療曝露品保會議。首先今年度輻射防護3小時訓練課程及科內CT非年度品保課程都已順利完成。第二點，今年CT年度品保檢測全部合格，急診X光機五年執照已更新，移動型X光機MUX-100H換照請陳憶頡持續追蹤。第三點，新進人員吳思霈請自行取得電腦斷層掃描儀醫療曝露品質專業人員訓練課程證明，完成後納入品保人員組織。第四點，數位乳房攝影儀每週、每季、每半年及年度品保校驗紀錄皆已由上鉅工程師與黃玉青、楊蕙芳完成並歸檔於乳房品保資料夾備查。'
                );
              }}
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
            >
              載入「CT暨乳房品保會議」口語範例
            </button>
            <button
              type="button"
              onClick={() => {
                setVoiceCategory('ccc');
                setVoiceMeetingTitle('115 年新樓醫院醫事放射師 教學暨品保討論會議');
                setTranscriptCorrections([]);
                setRawTranscript(
                  '呃主席林怡貞：各位同仁午安，那個今天在心樓醫院影醫科召開教學跟西西西還有評保會議。首先第一點討論樹人一專實習身葉彩儀跟賴詩涵的輪訓，要麻煩請陳義傑擔任導師、潘俊如擔任副導師幫我們追蹤一下。\n第二點那個一批A評分一開始判斷梅那麼正確，我們我們大家討論結果決定說由高瑞龍跟楊惠芳負責調整壓迫版與假体的檢測標準，並檢查千衣與千屏風及劑量配章。\n第三點批居Y學員黃品瑞、吳詩佩與施永勳的電腦斷曾訓練進度，最後決定就是信賴等極level 4通過簽合。'
                );
                showToast('💡 已載入含同音錯字之語音範例，請點選下方綠色「🪄 講完後：智慧修正錯別字與潤飾詞句」測試校正效果！');
              }}
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem', background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}
            >
              🧪 載入「含同音錯別字」測試稿（測試一鍵修正詞句）
            </button>
            <button
              type="button"
              onClick={() => {
                setVoiceCategory('qa');
                setVoiceMeetingTitle('115 年影像醫學科 品保暨科務手寫筆記測試會議');
                setTranscriptCorrections([]);
                setRawTranscript(
                  '※ 主席許志賢 -> 115年CT與乳房品保OK，感謝鄭義成、林宜蓁、潘俊儒、陳憶頡協助\n★ 急診CT管球與假体檢測 -> 檢測OK，請洪浩泰、吳俊霖 f/u 每週校驗紀錄\n★ 數位乳房攝影品保 -> 黃玉青、楊蕙芳已完成年度品保歸檔，千衣與劑量配章查核正常\n★ 決議 -> 通過本季CT暨乳房品保報告，請潘俊儒與余姿樺於月底前完成無紙化會議簽核宣導'
                );
                showToast('✍️ 已載入「手寫速記草稿」範例，請點選下方綠色「🪄 智慧修正錯別字與潤飾詞句」或紫色「✨ 一鍵轉換為正式會議紀錄」！');
              }}
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem', background: '#ecfdf5', color: '#065f46', borderColor: '#6ee7b7' }}
            >
              ✍️ 載入「手寫速記草稿」範例（測試手寫縮寫與箭頭潤飾）
            </button>
          </div>

          {isRecording && (
            <div
              style={{
                marginBottom: '0.75rem',
                padding: '0.6rem 0.9rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                fontSize: '0.88rem',
                color: '#991b1b',
                fontWeight: 600
              }}
            >
              🎙️ 正在即時聽寫中（講完按「停止錄音」即會自動幫您修正同音錯字與通順詞句）：
              <span style={{ color: '#0f172a', marginLeft: '0.4rem' }}>{interimTranscript || '請對著麥克風說話...'}</span>
            </div>
          )}

          {transcriptCorrections.length > 0 && (
            <div
              style={{
                marginBottom: '0.75rem',
                padding: '0.6rem 0.9rem',
                background: '#ecfdf5',
                border: '1px solid #6ee7b7',
                borderRadius: '10px',
                fontSize: '0.84rem',
                color: '#065f46',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}
            >
              <div>
                ✨ <strong>已完成智慧同音與詞句修正：</strong> {transcriptCorrections.join('、')}
              </div>
              {transcriptBeforePolish && (
                <button
                  type="button"
                  onClick={() => {
                    setRawTranscript(transcriptBeforePolish);
                    setTranscriptCorrections([]);
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '0.22rem 0.65rem', fontSize: '0.76rem' }}
                >
                  ↩️ 還原修正前原文
                </button>
              )}
            </div>
          )}

          {adminMobileVoiceHint && (
            <div
              style={{
                marginBottom: '0.75rem',
                padding: '0.6rem 0.9rem',
                background: '#fffbeb',
                border: '1.5px solid #f59e0b',
                borderRadius: '10px',
                fontSize: '0.85rem',
                color: '#92400e',
                fontWeight: 600,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <span>{adminMobileVoiceHint}</span>
              <button
                type="button"
                onClick={() => setAdminMobileVoiceHint('')}
                style={{ background: 'transparent', border: 'none', color: '#92400e', fontWeight: 800, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          )}

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <label style={{ margin: 0 }}>3. 會議語音逐字稿 / 現場口語速記內容（支援講完後一鍵修正詞句，亦可直接打字修改）</label>
              <button
                type="button"
                onClick={() => handlePolishTranscript()}
                disabled={polishingTranscript}
                className="btn btn-success"
                style={{ padding: '0.35rem 0.9rem', fontSize: '0.82rem' }}
              >
                🪄 {polishingTranscript ? '正在智慧修正詞句...' : '講完後：智慧修正錯別字與潤飾詞句'}
              </button>
            </div>
            <textarea
              ref={adminVoiceTextareaRef}
              rows={6}
              value={rawTranscript}
              onChange={(e) => {
                setRawTranscript(e.target.value);
                latestRawTranscriptRef.current = e.target.value;
              }}
              placeholder="點擊上方「開始現場即時錄音辨識」邊開會邊自動轉文字；講完後系統會自動修正同音錯字（如：林怡貞➔林宜蓁、評保➔品保、千屏風➔鉛屏風、梅那麼➔沒那麼），您也可點右上角「🪄 講完後：智慧修正錯別字與潤飾詞句」或手動微調！"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <button
              type="button"
              onClick={handleRunAiStructuring}
              className="btn btn-purple"
              disabled={aiProcessing}
              style={{ padding: '0.8rem 1.5rem', fontSize: '1rem' }}
            >
              <Sparkles size={18} />{' '}
              {aiProcessing ? '正在進行 AI 智慧結構化整理...' : '✨ 一鍵將語音 / 手寫稿 / 逐字稿轉換為正式會議紀錄'}
            </button>
            <button
              type="button"
              onClick={handleSaveToDraftInbox}
              disabled={savingDraftInbox}
              className="btn"
              style={{
                padding: '0.8rem 1.25rem',
                fontSize: '0.96rem',
                background: '#0284c7',
                color: '#ffffff'
              }}
            >
              <Cloud size={18} />{' '}
              {savingDraftInbox ? '正在上傳暫存至雲端...' : '☁️ 暫存語音＋手寫稿至雲端（回電腦用 IDE 抓取分析）'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRawTranscript('');
                setAiResult(null);
                setUploadedAudioFile(null);
                setUploadedAudioBase64(null);
                setRecordedAudioBase64(null);
                setUploadedHandwrittenImages([]);
              }}
              className="btn btn-secondary"
            >
              清空重來
            </button>
          </div>

          {/* 📥 雲端暫存草稿匣（待 IDE 分析清單） */}
          <div
            className="card"
            style={{
              background: '#f0f9ff',
              borderColor: '#7dd3fc',
              marginBottom: '1.5rem',
              padding: '1rem 1.15rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <div style={{ fontWeight: 700, color: '#0369a1', fontSize: '0.96rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Cloud size={18} color="#0284c7" /> 📥 雲端語音＋手寫稿暫存草稿匣（目前暫存 {draftInboxItems.length} 筆）
              </div>
              <span style={{ fontSize: '0.8rem', color: '#0c4a6e' }}>
                💡 在手機暫存後，回到電腦開啟 Antigravity IDE 跟 AI 說：<strong>「幫我抓雲端暫存檔來分析」</strong>即可直接轉換！
              </span>
            </div>

            {draftInboxItems.length === 0 ? (
              <div style={{ fontSize: '0.84rem', color: '#64748b', padding: '0.35rem 0' }}>
                目前尚無雲端暫存草稿。您可在上方錄音或上傳手寫稿照片後，點擊「☁️ 暫存語音＋手寫稿至雲端」。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {draftInboxItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #bae6fd',
                      borderRadius: '10px',
                      padding: '0.65rem 0.9rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.6rem'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.74rem' }}>
                          {item.id}
                        </span>
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{item.meetingTitle}</strong>
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          （上傳人：{item.createdBy}｜{new Date(item.createdAt).toLocaleString('zh-TW')}）
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem' }}>
                        🖼️ 手寫稿照片：<strong>{(item.handwrittenImages || []).length} 張</strong> ｜ 🎵 錄音檔：
                        <strong>{item.hasAudio ? '有附帶' : '無'}</strong> ｜ 📝 語音/速記文字：
                        <strong>{item.transcript ? `${item.transcript.slice(0, 45)}...` : '無'}</strong>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleLoadDraftInboxItem(item)}
                        className="btn btn-secondary"
                        style={{ padding: '0.32rem 0.7rem', fontSize: '0.78rem', color: '#0369a1', borderColor: '#7dd3fc' }}
                      >
                        📂 載入至上方工作台
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDraftInboxItem(item.id)}
                        className="btn btn-danger"
                        style={{ padding: '0.32rem 0.6rem', fontSize: '0.78rem' }}
                      >
                        <Trash2 size={14} /> 刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {aiResult && (
            <div
              className="card animate-fade-in"
              style={{
                border: '2px solid #7c3aed',
                background: '#faf5ff',
                padding: '1.35rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <span className="badge" style={{ background: '#ede9fe', color: '#5b21b6', marginBottom: '0.35rem' }}>
                    轉換引擎：{aiModeUsed}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    <strong style={{ color: '#3b0764', fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                      🎯 會議紀錄標題（可直接修改）：
                    </strong>
                    <input
                      type="text"
                      value={aiResult.title || ''}
                      onChange={(e) => setAiResult({ ...aiResult, title: e.target.value })}
                      style={{ flex: 1, minWidth: '260px', fontWeight: 700, fontSize: '1.05rem', borderColor: '#7c3aed' }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    startNewMeeting({
                      title: aiResult.title,
                      category: voiceCategory,
                      agendaItems: aiResult.agendaItems,
                      discussionSections: aiResult.discussionSections,
                      resolutions: aiResult.resolutions,
                      actionItems: aiResult.actionItems,
                      presentStaffNames:
                        aiResult.presentStaffNames?.length > 0
                          ? aiResult.presentStaffNames
                          : activeStaffMembers.map((s) => s.name),
                      attachments:
                        attachHandwrittenToMeeting && uploadedHandwrittenImages.length > 0
                          ? uploadedHandwrittenImages.map((img, idx) => ({
                              id: `ATT-HW-${Date.now()}-${idx}`,
                              title: `手寫會議筆記原稿 (${idx + 1}) - ${img.name}`,
                              fileName: img.name,
                              mimeType: img.mimeType || 'image/jpeg',
                              url: img.dataUrl,
                              category: '手寫會議筆記原稿'
                            }))
                          : [],
                      rawTranscript
                    })
                  }
                  className="btn btn-success"
                >
                  <CheckCircle2 size={18} /> 📥 一鍵帶入「會議紀錄編輯器」儲存與發布
                </button>
              </div>

              <div style={{ background: '#ffffff', borderRadius: '10px', padding: '1rem', border: '1px solid #e9d5ff' }}>
                <div style={{ marginBottom: '0.85rem' }}>
                  <strong>📌 自動提取之議程主題：</strong>
                  <ul style={{ margin: '0.35rem 0 0 0', paddingLeft: '1.25rem' }}>
                    {(aiResult.agendaItems || []).map((ag, i) => (
                      <li key={i}>{ag}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginBottom: '0.85rem' }}>
                  <strong>📝 結構化討論內容分段：</strong>
                  {(aiResult.discussionSections || []).map((sec, i) => (
                    <div key={i} style={{ marginTop: '0.5rem', paddingLeft: '0.5rem', borderLeft: '3px solid #7c3aed' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{sec.heading}</div>
                      <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                        {(sec.bullets || []).map((b, j) => (
                          <li key={j}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: '0.85rem' }}>
                  <strong>✅ 自動提煉之決議事項：</strong>
                  <ol style={{ margin: '0.35rem 0 0 0', paddingLeft: '1.25rem', color: '#065f46', fontWeight: 600 }}>
                    {(aiResult.resolutions || []).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: ✍️ 主管審核、重啟簽核（退回重簽 / 開放未簽者補簽）與催簽中心 ==================== */}
      {activeTab === 'approvals' && (
        <div className="glass-panel animate-fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.3rem 0', fontSize: '1.35rem' }}>
                ✍️ 主管三級審核、重啟簽核 ＆ 未簽閱名單催簽中心
              </h2>
              <p className="subtitle" style={{ margin: 0 }}>
                可執行「重新開放未簽者補簽」、「針對個別同仁退回重簽（讓會議重新出現在他的首頁）」以及「一鍵複製 LINE 催簽提醒」
              </p>
            </div>

            <div style={{ minWidth: '300px' }}>
              <select
                value={selectedApprovalMtg?.id || ''}
                onChange={(e) => setSelectedApprovalMtgId(e.target.value)}
                style={{ fontWeight: 700 }}
              >
                {meetings.map((m) => {
                  const st = getMeetingSignStats(m);
                  return (
                    <option key={m.id} value={m.id}>
                      [{m.isArchived ? '歷史歸檔' : '開放中'}｜已簽{st.signedCount}人/未簽{st.unsignedCount}人] {m.title} ({m.date})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {selectedApprovalMtg && (
            <>
              {/* 三級審核與歷史歸檔/開放補簽操作卡 */}
              <div className="card" style={{ marginBottom: '1.25rem', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.84rem', color: '#64748b', fontWeight: 600 }}>目前檢視會議：</span>
                      {selectedApprovalMtg.isArchived ? (
                        <span className="badge" style={{ background: '#e2e8f0', color: '#334155' }}>
                          📦 已結案歸檔（位於歷史紀錄專區）
                        </span>
                      ) : (
                        <span className="badge" style={{ background: '#d1fae5', color: '#065f46' }}>
                          ✍️ 開放簽閱中（未簽者首頁可見）
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{selectedApprovalMtg.title}</h3>
                      <button
                        type="button"
                        onClick={() => {
                          const nextTitle = window.prompt('請輸入要修改的會議標題：', selectedApprovalMtg.title);
                          if (nextTitle && nextTitle.trim()) {
                            handleQuickUpdateMeetingTitle(selectedApprovalMtg.id, nextTitle.trim());
                          }
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '0.22rem 0.6rem', fontSize: '0.76rem' }}
                      >
                        <Edit3 size={13} /> 修改標題
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {selectedApprovalMtg.isArchived ? (
                      <button
                        type="button"
                        onClick={() => handleToggleArchiveMeeting(selectedApprovalMtg, false)}
                        className="btn btn-success"
                      >
                        <Unlock size={16} /> 🔓 重新開放未簽者補簽（保留已簽紀錄）
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleArchiveMeeting(selectedApprovalMtg, true)}
                        className="btn btn-secondary"
                      >
                        <Archive size={16} /> 📦 結案歸檔至歷史專區
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopyLineReminder(selectedApprovalMtg)}
                      className="btn btn-purple"
                    >
                      <Copy size={16} /> 📋 一鍵複製 LINE 群組催簽提醒
                    </button>
                  </div>
                </div>

                {/* 三級簽核進度條 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '0.85rem',
                    marginBottom: '1rem'
                  }}
                >
                  <div style={{ background: '#ffffff', padding: '0.9rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>STEP 1・紀錄人完稿呈報</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: '0.25rem' }}>
                      {selectedApprovalMtg.approvalChain?.recorderSubmittedBy || selectedApprovalMtg.recorder}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: '0.2rem' }}>
                      {selectedApprovalMtg.approvalChain?.recorderSubmittedAt
                        ? `✅ 已呈報 (${new Date(selectedApprovalMtg.approvalChain.recorderSubmittedAt).toLocaleString('zh-TW')})`
                        : '📝 草稿編輯中'}
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '0.9rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>STEP 2・會議主席覆核</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: '0.25rem' }}>
                      {selectedApprovalMtg.approvalChain?.chairApprovedBy || selectedApprovalMtg.chair}
                    </div>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: selectedApprovalMtg.approvalChain?.chairApprovedAt ? '#059669' : '#d97706',
                        marginTop: '0.2rem'
                      }}
                    >
                      {selectedApprovalMtg.approvalChain?.chairApprovedAt
                        ? `✅ 已覆核 (${new Date(selectedApprovalMtg.approvalChain.chairApprovedAt).toLocaleString('zh-TW')})`
                        : '⏳ 待主席覆核'}
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '0.9rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>STEP 3・科主任最終核准發布</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: '0.25rem' }}>
                      {selectedApprovalMtg.approvalChain?.directorApprovedBy || '許志賢 科主任'}
                    </div>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: selectedApprovalMtg.approvalChain?.directorApprovedAt ? '#059669' : '#d97706',
                        marginTop: '0.2rem'
                      }}
                    >
                      {selectedApprovalMtg.approvalChain?.directorApprovedAt
                        ? `✅ 已核准發布 (${new Date(selectedApprovalMtg.approvalChain.directorApprovedAt).toLocaleString('zh-TW')})`
                        : '⏳ 待科主任核准'}
                    </div>
                  </div>
                </div>

                {/* 簽核操作列 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '0.65rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    background: '#ffffff',
                    padding: '0.85rem',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <input
                    type="text"
                    value={approvalApproverName}
                    onChange={(e) => setApprovalApproverName(e.target.value)}
                    placeholder="簽核主管姓名"
                    style={{ maxWidth: '180px' }}
                  />
                  <input
                    type="text"
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    placeholder="簽核批示或意見（如：准予核備並發布全科簽閱）"
                    style={{ flex: 1, minWidth: '200px' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAdvanceApproval(selectedApprovalMtg.id, 'pending_chair')}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.84rem' }}
                  >
                    1. 紀錄人送交主席覆核
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdvanceApproval(selectedApprovalMtg.id, 'pending_director')}
                    className="btn"
                    style={{ fontSize: '0.84rem' }}
                  >
                    2. 主席覆核通過送主任
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdvanceApproval(selectedApprovalMtg.id, 'published')}
                    className="btn btn-success"
                    style={{ fontSize: '0.84rem' }}
                  >
                    <CheckCircle2 size={16} /> 3. 主任核准並發布全科簽閱
                  </button>
                </div>
              </div>

              {/* 左右對照：尚未簽閱名單 vs 已完成簽閱名單（含「↩️ 退回重簽」按鈕） */}
              {(() => {
                const signedMap = selectedApprovalMtg.signatures || {};
                const signedMembers = activeStaffMembers.filter((s) => Boolean(signedMap[s.name]));
                const unsignedMembers = activeStaffMembers.filter((s) => !signedMap[s.name]);
                const signRate =
                  activeStaffMembers.length > 0
                    ? Math.round((signedMembers.length / activeStaffMembers.length) * 100)
                    : 100;

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
                    {/* 左：尚未簽閱名單（包含被退回重簽者） */}
                    <div className="card" style={{ borderTop: '4px solid #dc2626' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#b91c1c' }}>
                          🔴 尚未簽閱同仁名單（{unsignedMembers.length} 人）
                        </h3>
                        <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                          全科簽閱率：{signRate}%
                        </span>
                      </div>

                      {selectedApprovalMtg.isArchived && unsignedMembers.length > 0 && (
                        <div className="alert alert-warning" style={{ fontSize: '0.82rem', padding: '0.65rem 0.85rem' }}>
                          💡 本會議目前為「已歸檔歷史紀錄」。若要讓下方未簽同仁在首頁看到並補簽，請點擊上方 <strong>「🔓 重新開放未簽者補簽」</strong>。
                        </div>
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {unsignedMembers.map((m) => {
                          const isReopened = (selectedApprovalMtg.reopenedForStaff || []).includes(m.name);
                          return (
                            <div
                              key={m.id}
                              style={{
                                background: isReopened ? '#ffedd5' : '#fef2f2',
                                border: isReopened ? '1px solid #fb923c' : '1px solid #fecaca',
                                borderRadius: '8px',
                                padding: '0.45rem 0.75rem',
                                fontSize: '0.85rem'
                              }}
                            >
                              <strong>{m.name}</strong>
                              <span style={{ color: '#64748b', fontSize: '0.76rem', marginLeft: '0.3rem' }}>
                                ({m.title})
                              </span>
                              {isReopened && (
                                <span className="badge" style={{ background: '#ea580c', color: '#ffffff', marginLeft: '0.35rem', fontSize: '0.68rem' }}>
                                  ↩️ 已退回重簽
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {unsignedMembers.length === 0 && (
                          <div style={{ color: '#059669', fontWeight: 700, padding: '1rem 0' }}>
                            🎉 全科在職同仁皆已完成簽閱！
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 右：已完成簽閱名單（每位同仁旁提供「↩️ 退回重簽」按鈕） */}
                    <div className="card" style={{ borderTop: '4px solid #059669' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#065f46' }}>
                          ✅ 已完成簽閱同仁明細（{Object.keys(signedMap).length} 人）
                        </h3>
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          點擊「↩️ 退回重簽」可讓會議重回該同仁首頁
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '440px', overflowY: 'auto' }}>
                        {Object.values(signedMap).map((sig, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              borderRadius: '8px',
                              padding: '0.6rem 0.85rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '0.5rem',
                              flexWrap: 'wrap'
                            }}
                          >
                            <div>
                              <strong style={{ color: '#064e3b' }}>{sig.name}</strong>
                              <span className="badge" style={{ background: '#ffffff', color: '#047857', marginLeft: '0.4rem', fontSize: '0.72rem' }}>
                                {sig.method}
                              </span>
                              <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '0.15rem' }}>
                                {sig.comment} ｜ {sig.signedAt ? new Date(sig.signedAt).toLocaleString('zh-TW') : ''}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {sig.signatureDataUrl && (
                                <img
                                  src={sig.signatureDataUrl}
                                  alt="簽名"
                                  style={{ height: '34px', background: '#ffffff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => handleReopenSingleStaffSign(selectedApprovalMtg.id, sig.name)}
                                className="btn btn-danger"
                                style={{ padding: '0.3rem 0.65rem', fontSize: '0.76rem' }}
                                title={`清除 ${sig.name} 的簽名，讓此會議重新出現在他的手機首頁待簽區`}
                              >
                                <RotateCcw size={13} /> ↩️ 退回重簽
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ==================== TAB 4: 👥 人員維護模組 ==================== */}
      {activeTab === 'staff' && (
        <div className="glass-panel animate-fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.3rem 0', fontSize: '1.35rem' }}>
                👥 影像醫學科人員名冊與組別權限維護（共 {staff.length} 人）
              </h2>
              <p className="subtitle" style={{ margin: 0 }}>
                管理科內醫師、技術主任、放射師、PGY 與實習生名單，設定各檢查組別標籤與在職狀態
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() =>
                  setEditingStaff({
                    id: '',
                    code: `R${String(staff.length + 1).padStart(2, '0')}`,
                    name: '',
                    title: '醫事放射師',
                    role: 'staff',
                    groups: ['一般科會'],
                    status: '在職',
                    note: ''
                  })
                }
                className="btn"
              >
                <Plus size={16} /> 新增科內人員
              </button>
              <button type="button" onClick={() => setShowBulkModal(true)} className="btn btn-purple">
                <Upload size={16} /> Excel / CSV 批次匯入
              </button>
              <button type="button" onClick={handleExportStaffCsv} className="btn btn-secondary">
                <Download size={16} /> 匯出人員名冊 CSV
              </button>
            </div>
          </div>

          {editingStaff && (
            <form onSubmit={handleSaveStaffMember} className="card" style={{ marginBottom: '1.25rem', background: '#eff6ff', borderColor: '#93c5fd' }}>
              <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '1.1rem', color: '#1e3a8a' }}>
                {editingStaff.id ? `✏️ 編輯人員：${editingStaff.name}` : '➕ 新增科內人員'}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.85rem', marginBottom: '0.85rem' }}>
                <div>
                  <label>姓名 *</label>
                  <input
                    type="text"
                    required
                    value={editingStaff.name}
                    onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })}
                    placeholder="如：潘俊儒"
                  />
                </div>
                <div>
                  <label>手機登入代號 / 員編 *</label>
                  <input
                    type="text"
                    required
                    value={editingStaff.code}
                    onChange={(e) => setEditingStaff({ ...editingStaff, code: e.target.value })}
                    placeholder="如：x3137 或 R06"
                  />
                </div>
                <div>
                  <label>職稱</label>
                  <input
                    type="text"
                    value={editingStaff.title}
                    onChange={(e) => setEditingStaff({ ...editingStaff, title: e.target.value })}
                    placeholder="如：醫事放射師 / 實習學生"
                  />
                </div>
                <div>
                  <label>系統角色</label>
                  <select
                    value={editingStaff.role}
                    onChange={(e) => setEditingStaff({ ...editingStaff, role: e.target.value })}
                  >
                    <option value="director">科主任 / 主管 (director)</option>
                    <option value="chair">會議主席 / 技術主任 (chair)</option>
                    <option value="recorder">會議紀錄人 / 臨床教師 (recorder)</option>
                    <option value="staff">一般醫事放射師 / 同仁 (staff)</option>
                    <option value="trainee">PGY / 實習學生 (trainee)</option>
                  </select>
                </div>
                <div>
                  <label>在職狀態</label>
                  <select
                    value={editingStaff.status}
                    onChange={(e) => setEditingStaff({ ...editingStaff, status: e.target.value })}
                  >
                    <option value="在職">在職</option>
                    <option value="實習中">實習中</option>
                    <option value="留停">留停</option>
                    <option value="離職">離職</option>
                  </select>
                </div>
                <div>
                  <label>備註說明</label>
                  <input
                    type="text"
                    value={editingStaff.note || ''}
                    onChange={(e) => setEditingStaff({ ...editingStaff, note: e.target.value })}
                    placeholder="如：115年實習生導師"
                  />
                </div>
              </div>

              <div style={{ marginBottom: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.45rem' }}>
                  <label style={{ margin: 0 }}>所屬組別標籤（點選可複選）：</label>
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={newGroupTagInput}
                      onChange={(e) => setNewGroupTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddGroupTag();
                        }
                      }}
                      placeholder="輸入自訂新組別名稱..."
                      style={{
                        width: '180px',
                        padding: '0.28rem 0.6rem',
                        fontSize: '0.8rem',
                        borderRadius: '8px',
                        border: '1px solid #93c5fd',
                        background: '#ffffff'
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddGroupTag}
                      className="btn btn-primary"
                      style={{ padding: '0.28rem 0.65rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                    >
                      <Plus size={13} /> 新增組別
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {(settings.availableGroups || ['主管/行政', '一般科會', '教學/臨床教師', '品保會議', '跨領域會議']).map((grp) => {
                    const hasGrp = (editingStaff.groups || []).includes(grp);
                    return (
                      <div key={grp} style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = editingStaff.groups || [];
                            const next = hasGrp ? cur.filter((g) => g !== grp) : [...cur, grp];
                            setEditingStaff({ ...editingStaff, groups: next });
                          }}
                          style={{
                            padding: '0.32rem 0.75rem',
                            borderRadius: '999px 0 0 999px',
                            border: hasGrp ? '1px solid #2563eb' : '1px solid #cbd5e1',
                            background: hasGrp ? '#2563eb' : '#ffffff',
                            color: hasGrp ? '#ffffff' : '#334155',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {hasGrp ? '✓ ' : ''}{grp}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteGroupTag(grp)}
                          title={`刪除此組別標籤「${grp}」`}
                          style={{
                            padding: '0.32rem 0.45rem',
                            borderRadius: '0 999px 999px 0',
                            border: hasGrp ? '1px solid #2563eb' : '1px solid #cbd5e1',
                            borderLeft: 'none',
                            background: hasGrp ? '#1d4ed8' : '#f8fafc',
                            color: hasGrp ? '#bfdbfe' : '#94a3b8',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-success">
                  <Save size={16} /> 儲存人員
                </button>
                <button type="button" onClick={() => setEditingStaff(null)} className="btn btn-secondary">
                  取消
                </button>
              </div>
            </form>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
              {['ALL', ...(settings.availableGroups || ['主管/行政', '一般科會', '教學/臨床教師', '品保會議', '跨領域會議'])].map((grp) => (
                <button
                  key={grp}
                  type="button"
                  onClick={() => setStaffGroupFilter(grp)}
                  style={{
                    padding: '0.35rem 0.8rem',
                    borderRadius: '999px',
                    border: staffGroupFilter === grp ? 'none' : '1px solid #cbd5e1',
                    background: staffGroupFilter === grp ? '#0f172a' : '#f8fafc',
                    color: staffGroupFilter === grp ? '#ffffff' : '#334155',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {grp === 'ALL' ? `全部 (${staff.length})` : grp}
                </button>
              ))}

              {/* 直接在篩選列旁快速新增組別 */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.25rem' }}>
                <input
                  type="text"
                  value={newGroupTagInput}
                  onChange={(e) => setNewGroupTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddGroupTag();
                    }
                  }}
                  placeholder="+ 新增組別名稱..."
                  style={{
                    width: '145px',
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.8rem',
                    borderRadius: '999px',
                    border: '1px dashed #64748b',
                    background: '#ffffff'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddGroupTag}
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', borderRadius: '999px', whiteSpace: 'nowrap' }}
                >
                  <Plus size={13} /> 新增組別
                </button>
              </div>
            </div>

            <input
              type="text"
              placeholder="🔍 搜尋姓名、代號、職稱..."
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              style={{ maxWidth: '240px' }}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', background: '#ffffff', borderRadius: '12px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '0.75rem 0.9rem' }}>登入代號</th>
                  <th style={{ padding: '0.75rem 0.9rem' }}>姓名</th>
                  <th style={{ padding: '0.75rem 0.9rem' }}>職稱</th>
                  <th style={{ padding: '0.75rem 0.9rem' }}>所屬組別標籤</th>
                  <th style={{ padding: '0.75rem 0.9rem' }}>狀態</th>
                  <th style={{ padding: '0.75rem 0.9rem' }}>備註</th>
                  <th style={{ padding: '0.75rem 0.9rem' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {staff
                  .filter((s) => staffGroupFilter === 'ALL' || (s.groups || []).includes(staffGroupFilter))
                  .filter(
                    (s) =>
                      !staffSearch.trim() ||
                      s.name.includes(staffSearch.trim()) ||
                      (s.code || '').toLowerCase().includes(staffSearch.trim().toLowerCase()) ||
                      (s.title || '').includes(staffSearch.trim())
                  )
                  .map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0', opacity: s.status === '離職' ? 0.55 : 1 }}>
                      <td style={{ padding: '0.7rem 0.9rem', fontWeight: 700, color: '#2563eb' }}>
                        <code>{s.code}</code>
                      </td>
                      <td style={{ padding: '0.7rem 0.9rem', fontWeight: 700 }}>{s.name}</td>
                      <td style={{ padding: '0.7rem 0.9rem' }}>{s.title}</td>
                      <td style={{ padding: '0.7rem 0.9rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {(s.groups || []).map((g) => (
                            <span
                              key={g}
                              className="badge"
                              style={{ background: '#f1f5f9', color: '#334155', fontSize: '0.72rem' }}
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '0.7rem 0.9rem' }}>
                        <select
                          value={s.status || '在職'}
                          onChange={(e) => handleToggleStaffStatus(s.id, e.target.value)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.8rem',
                            width: 'auto',
                            fontWeight: 700,
                            color: s.status === '離職' ? '#dc2626' : s.status === '實習中' ? '#7c3aed' : '#059669'
                          }}
                        >
                          <option value="在職">在職</option>
                          <option value="實習中">實習中</option>
                          <option value="留停">留停</option>
                          <option value="離職">離職</option>
                        </select>
                      </td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#64748b', fontSize: '0.82rem' }}>{s.note || '—'}</td>
                      <td style={{ padding: '0.7rem 0.9rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => setEditingStaff(s)}
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStaff(s.id, s.name)}
                            className="btn btn-danger"
                            style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }}
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== TAB 5: 📊 出席率與待辦追蹤統計儀表板 ＆ Power BI 自動連動中心 ==================== */}
      {activeTab === 'analytics' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* 【F】Power BI 自動連動與即時資料源中心 */}
          {(() => {
            const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
            const htmlAllTablesUrl = `${origin}/api/powerbi?format=html`;
            const pbiDatasets = [
              {
                key: 'meetings',
                title: '1. 會議總表 (Meetings)',
                desc: '包含每場會議分類、日期、應到/實到/休假人數、出席率(%)、已簽核/未簽核人數與簽閱完成率(%)',
                csvUrl: `${origin}/api/powerbi?table=meetings&format=csv`,
                utf8CsvUrl: `${origin}/api/powerbi?table=meetings&format=csv&encoding=utf8`,
                jsonUrl: `${origin}/api/powerbi?table=meetings&format=json`
              },
              {
                key: 'attendance',
                title: '2. 人員出席與簽核交叉明細表 (Attendance ⭐ 最推薦)',
                desc: '將「每場會議 × 每位在職同仁」展開為明細列，含是否出席、是否值班休假、是否已簽核、簽核時間與意見',
                csvUrl: `${origin}/api/powerbi?table=attendance&format=csv`,
                utf8CsvUrl: `${origin}/api/powerbi?table=attendance&format=csv&encoding=utf8`,
                jsonUrl: `${origin}/api/powerbi?table=attendance&format=json`
              },
              {
                key: 'staff',
                title: '3. 全科人員統計表 (Staff Summary)',
                desc: '每位同仁之職稱、組別、累計出席場次、累計休假場次、已簽閱場次、待簽閱場次與個人簽閱完成率(%)',
                csvUrl: `${origin}/api/powerbi?table=staff&format=csv`,
                utf8CsvUrl: `${origin}/api/powerbi?table=staff&format=csv&encoding=utf8`,
                jsonUrl: `${origin}/api/powerbi?table=staff&format=json`
              },
              {
                key: 'actions',
                title: '4. 會議決議待辦追蹤表 (Action Items)',
                desc: '所有會議指派之待辦事項、負責人員、期限與目前執行狀態（已完成/進行中/未開始）',
                csvUrl: `${origin}/api/powerbi?table=actions&format=csv`,
                utf8CsvUrl: `${origin}/api/powerbi?table=actions&format=csv&encoding=utf8`,
                jsonUrl: `${origin}/api/powerbi?table=actions&format=json`
              }
            ];

            return (
              <div className="glass-panel" style={{ border: '2px solid #f59e0b', background: '#fffbeb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.85rem' }}>
                  <div>
                    <span className="badge" style={{ background: '#fef3c7', color: '#b45309', marginBottom: '0.25rem' }}>
                      📊 Microsoft Power BI 即時資料連動模組（已內建繁體中文 Big5 / UTF-8 防亂碼雙引擎）
                    </span>
                    <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a' }}>
                      📊 Power BI 自動連動資料源中心 ＆ 視覺化報表內嵌
                    </h2>
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <a
                      href="/powerbi"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{
                        padding: '0.45rem 0.95rem',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        textDecoration: 'none',
                        background: '#1e293b',
                        color: '#fbbf24',
                        border: '1px solid #f59e0b'
                      }}
                    >
                      📊 全螢幕開啟 Power BI 互動式圖表看板 ↗
                    </a>
                    <a
                      href="/api/powerbi?format=html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.83rem', textDecoration: 'none', background: '#ffffff' }}
                    >
                      🌐 預覽 HTML 網頁表格資料源 ↗
                    </a>
                    <a
                      href="/api/powerbi?table=all&format=json"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.83rem', textDecoration: 'none', background: '#ffffff' }}
                    >
                      🔍 檢視完整 JSON API 數據 ↗
                    </a>
                    <button
                      type="button"
                      onClick={handlePushToPowerBi}
                      disabled={pushingPowerBi}
                      className="btn"
                      style={{ padding: '0.45rem 0.95rem', fontSize: '0.84rem', background: '#d97706', color: '#ffffff' }}
                    >
                      <RefreshCw size={15} /> {pushingPowerBi ? '推送中...' : '⚡ 推送最新數據至 Power BI 雲端'}
                    </button>
                  </div>
                </div>

                {/* 🌟 最推薦：一鍵匯入全部 4 張表（HTML Web 表格模式，100% 零亂碼） */}
                <div
                  style={{
                    background: '#ecfdf5',
                    border: '2px solid #10b981',
                    borderRadius: '12px',
                    padding: '0.9rem 1.05rem',
                    marginBottom: '0.95rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#065f46', marginBottom: '0.2rem' }}>
                      🌟 最推薦連線方式：Power BI「Web 網頁表格總覽網址」（一次勾選全部 4 張表・100% 零亂碼）
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#047857', lineHeight: 1.55 }}>
                      在 Power BI Desktop 點選「<strong>取得資料 ➔ Web</strong>」貼上下方網址，導覽器會直接列出 4 張繁體中文資料表供您一次勾選載入，完全不會有編碼亂碼問題：
                    </div>
                    <div
                      style={{
                        marginTop: '0.4rem',
                        padding: '0.35rem 0.65rem',
                        background: '#ffffff',
                        border: '1px solid #6ee7b7',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                        fontSize: '0.82rem',
                        color: '#065f46',
                        fontWeight: 700,
                        wordBreak: 'break-all'
                      }}
                    >
                      {htmlAllTablesUrl}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(htmlAllTablesUrl);
                      showToast('📋 已複製「Power BI Web 4張表總覽網址」！貼入 Power BI [取得資料 -> Web] 即可一次勾選匯入！');
                    }}
                    className="btn"
                    style={{
                      padding: '0.6rem 1.1rem',
                      fontSize: '0.86rem',
                      fontWeight: 800,
                      background: '#059669',
                      color: '#ffffff',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <Copy size={15} /> 📋 複製 4 張表總覽網址 (零亂碼推薦)
                  </button>
                </div>

                {/* Power BI Desktop 3 步驟連線教學 */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #fde68a',
                    borderRadius: '12px',
                    padding: '0.85rem 1rem',
                    marginBottom: '1rem',
                    fontSize: '0.85rem',
                    color: '#334155',
                    lineHeight: 1.65
                  }}
                >
                  <strong style={{ color: '#92400e', fontSize: '0.92rem' }}>
                    💡 如何在 Power BI Desktop 一鍵連動本系統（已解決台灣版 Power BI 預設 Big5 編碼問題）：
                  </strong>
                  <ol style={{ margin: '0.35rem 0 0 0', paddingLeft: '1.25rem' }}>
                    <li>
                      開啟 <strong>Power BI Desktop</strong> ➔ 點選上方工具列「<strong>取得資料 (Get Data)</strong>」➔ 選擇「<strong>Web</strong>」。
                    </li>
                    <li>
                      貼上上方綠色區塊的「<strong>Web 4 張表總覽網址</strong>」或下方任一單表「<strong>CSV 連線網址（已預設轉換為繁體中文 Big5 / CP950 編碼）</strong>」並按確定。
                    </li>
                    <li>
                      若您先前已匯入過 CSV，現在只要在 Power BI 直接點擊「<strong>重新整理 (Refresh)</strong>」，亂碼就會立即變成正常繁體中文！
                    </li>
                  </ol>
                </div>

                {/* 四大 Power BI 資料表 API 卡片 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
                  {pbiDatasets.map((ds) => (
                    <div
                      key={ds.key}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '12px',
                        padding: '0.9rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.6rem'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.25rem' }}>
                          {ds.title}
                        </div>
                        <div style={{ fontSize: '0.79rem', color: '#64748b', lineHeight: 1.5 }}>{ds.desc}</div>
                        <div
                          style={{
                            marginTop: '0.5rem',
                            padding: '0.35rem 0.55rem',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            color: '#1e40af',
                            wordBreak: 'break-all',
                            fontFamily: 'monospace'
                          }}
                        >
                          {ds.csvUrl}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(ds.csvUrl);
                            showToast(`📋 已複製「${ds.title}」Power BI (Big5 零亂碼) CSV 連線網址！`);
                          }}
                          className="btn btn-primary"
                          style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem', flex: 1 }}
                        >
                          <Copy size={13} /> 複製 CSV 網址 (Big5)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(ds.jsonUrl);
                            showToast(`📋 已複製「${ds.title}」Power BI JSON API 網址！`);
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                        >
                          複製 JSON 網址
                        </button>
                        <a
                          href={ds.csvUrl}
                          download={`powerbi_${ds.key}.csv`}
                          className="btn btn-secondary"
                          style={{
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.78rem',
                            textDecoration: 'none',
                            background: '#ecfdf5',
                            color: '#047857',
                            borderColor: '#6ee7b7'
                          }}
                        >
                          ⬇️ 下載 CSV
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Power BI 報表內嵌網址 (Publish to Web) & 雲端串流推送網址設定 */}
                <form
                  onSubmit={handleSaveSettings}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '0.95rem 1rem'
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem', alignItems: 'end' }}>
                    <div>
                      <label style={{ fontSize: '0.82rem' }}>
                        🖥️ Power BI 報表內嵌網址 (Publish to Web Iframe URL，填寫後可直接於下方顯示互動式圖表)
                      </label>
                      <input
                        type="url"
                        value={settings.powerBiEmbedUrl || ''}
                        onChange={(e) => setSettings({ ...settings, powerBiEmbedUrl: e.target.value })}
                        placeholder="https://app.powerbi.com/view?r=eyJrIjoi..."
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.82rem' }}>
                        ⚡ Power BI 雲端串流資料集推送網址 (Streaming Dataset Push URL，選填)
                      </label>
                      <input
                        type="url"
                        value={settings.powerBiPushUrl || ''}
                        onChange={(e) => setSettings({ ...settings, powerBiPushUrl: e.target.value })}
                        placeholder="https://api.powerbi.com/beta/.../datasets/.../rows?key=..."
                      />
                    </div>
                    <div>
                      <button type="submit" className="btn btn-success" style={{ width: '100%', padding: '0.55rem 1rem' }}>
                        <Save size={16} /> 儲存 Power BI 連動設定
                      </button>
                    </div>
                  </div>
                </form>

                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.02rem', color: '#0f172a' }}>
                      📈 Power BI 互動式視覺化圖表即時看板（支援點擊扇形、長條、人員進行跨圖表交叉篩選）：
                    </div>
                    <a
                      href="/powerbi"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', textDecoration: 'none' }}
                    >
                      🖥️ 在新分頁全螢幕開啟互動式報表 ↗
                    </a>
                  </div>
                  <div style={{ border: '2px solid #f59e0b', borderRadius: '12px', overflow: 'hidden', height: '780px', background: '#ffffff', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}>
                    <iframe
                      src={settings.powerBiEmbedUrl || '/powerbi'}
                      title="Power BI Embedded Interactive Dashboard"
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      allowFullScreen
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="glass-panel">
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.35rem' }}>
              📊 影像醫學科會議出席率、簽閱率與個人統計總表
            </h2>

            <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.05rem' }}>👥 全科在職同仁出席與線上簽閱統計</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '0.7rem' }}>姓名</th>
                  <th style={{ padding: '0.7rem' }}>職稱</th>
                  <th style={{ padding: '0.7rem' }}>實際出席場次</th>
                  <th style={{ padding: '0.7rem' }}>已完成簽閱場次</th>
                  <th style={{ padding: '0.7rem' }}>目前首頁待簽閱</th>
                  <th style={{ padding: '0.7rem' }}>簽閱完成率</th>
                  <th style={{ padding: '0.7rem' }}>最後手機登入時間</th>
                </tr>
              </thead>
              <tbody>
                {activeStaffMembers.map((s) => {
                  const attended = meetings.filter((m) => (m.presentStaffNames || []).includes(s.name)).length;
                  const signed = meetings.filter((m) => Boolean(m.signatures?.[s.name])).length;
                  const pendingHome = meetings.filter(
                    (m) =>
                      !m.signatures?.[s.name] &&
                      ((m.reopenedForStaff || []).includes(s.name) || (!m.isArchived && m.status === 'published'))
                  ).length;
                  const rate = meetings.length > 0 ? Math.round((signed / meetings.length) * 100) : 100;
                  const lastLogin = loginRecords[s.name]?.last_login;

                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.65rem 0.7rem', fontWeight: 700 }}>{s.name}</td>
                      <td style={{ padding: '0.65rem 0.7rem', color: '#475569' }}>{s.title}</td>
                      <td style={{ padding: '0.65rem 0.7rem' }}>
                        {attended} / {meetings.length} 場
                      </td>
                      <td style={{ padding: '0.65rem 0.7rem', color: '#059669', fontWeight: 700 }}>
                        {signed} / {meetings.length} 場
                      </td>
                      <td style={{ padding: '0.65rem 0.7rem', color: pendingHome > 0 ? '#dc2626' : '#059669', fontWeight: 700 }}>
                        {pendingHome} 場
                      </td>
                      <td style={{ padding: '0.65rem 0.7rem' }}>
                        <span
                          className="badge"
                          style={{
                            background: rate === 100 ? '#d1fae5' : rate >= 50 ? '#dbeafe' : '#fee2e2',
                            color: rate === 100 ? '#065f46' : rate >= 50 ? '#1e40af' : '#b91c1c'
                          }}
                        >
                          {rate}%
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.7rem', color: '#64748b', fontSize: '0.8rem' }}>
                        {lastLogin ? new Date(lastLogin).toLocaleString('zh-TW') : '尚未登入'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 6: ⚙️ 系統、問卷系統連動、Gemini AI 與 Google 試算表雲端設定 ==================== */}
      {activeTab === 'settings' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* 【問卷系統連結與內嵌設定】 */}
          <form onSubmit={handleSaveSettings} className="glass-panel" style={{ border: '2px solid #0d9488', background: '#f0fdfa' }}>
            <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', color: '#0f766e' }}>
              📝 外部「問卷調查系統」連動設定
            </h2>
            <p className="subtitle" style={{ margin: '0 0 0.85rem 0', color: '#334155' }}>
              在此貼上您自製的問卷系統網址後，全科同仁於前台上方點擊「<strong>📝 問卷系統</strong>」或於會議紀錄內點擊問卷按鈕，即可直接內嵌填寫或開啟新分頁（系統會自動附加登入同仁姓名、代號與會議參數 <code>?staffName=...&staffCode=...&meetingId=...</code>）。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '0.85rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>問卷系統按鈕與視窗標題</label>
                <input
                  type="text"
                  value={settings.surveySystemTitle || ''}
                  onChange={(e) => setSettings({ ...settings, surveySystemTitle: e.target.value })}
                  placeholder="例如：影像醫學科問卷調查系統"
                />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                <label>問卷系統網址 (Survey System URL)</label>
                <input
                  type="url"
                  value={settings.surveySystemUrl || ''}
                  onChange={(e) => setSettings({ ...settings, surveySystemUrl: e.target.value })}
                  placeholder="例如：http://localhost:3001 或 https://..."
                />
              </div>
            </div>
            <button type="submit" className="btn btn-success">
              <Save size={16} /> 儲存問卷系統連動設定
            </button>
          </form>

          <div className="glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
              <div>
                <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <CloudUpload color="#059669" /> ☁️ Google Sheets (Google 試算表) 雲端同步與備份
                </h2>
                <p className="subtitle" style={{ margin: 0 }}>
                  將全科人員名冊、會議紀錄、簽到時間戳記與待辦事項自動同步至您的 Google 試算表
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGasCodeModal(true)}
                className="btn btn-purple"
              >
                <Copy size={16} /> 檢視與複製 Google Apps Script 程式碼
              </button>
            </div>

            <div className="form-group">
              <label>Google Apps Script 網頁應用程式網址 (Webhook URL)</label>
              <input
                type="text"
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                value={settings.googleSheetWebhookUrl || ''}
                onChange={(e) => setSettings({ ...settings, googleSheetWebhookUrl: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="checkbox"
                id="autoSyncSheet"
                checked={Boolean(settings.autoSyncGoogleSheet)}
                onChange={(e) => setSettings({ ...settings, autoSyncGoogleSheet: e.target.checked })}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="autoSyncSheet" style={{ margin: 0, cursor: 'pointer' }}>
                當有同仁簽核或新增會議紀錄時，自動在背景同步更新至 Google 試算表
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleSaveSettings} className="btn">
                <Save size={16} /> 儲存設定
              </button>
              <button
                type="button"
                onClick={handleSyncToGoogleSheets}
                disabled={syncingSheets}
                className="btn btn-success"
              >
                <RefreshCw size={16} /> {syncingSheets ? '正在同步至 Google 試算表...' : '立即同步全科資料至 Google 試算表'}
              </button>
              {settings.lastSyncedAt && (
                <span style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 600 }}>
                  ✅ 上次成功同步：{new Date(settings.lastSyncedAt).toLocaleString('zh-TW')}
                </span>
              )}
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="glass-panel">
            <h2 style={{ margin: '0 0 0.85rem 0', fontSize: '1.25rem' }}>
              🤖 Google Gemini AI 金鑰與醫院表單抬頭設定
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label>醫院正式名稱（公版 Word 與報表抬頭）</label>
                <input
                  type="text"
                  value={settings.hospitalName || ''}
                  onChange={(e) => setSettings({ ...settings, hospitalName: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>科室正式名稱</label>
                <input
                  type="text"
                  value={settings.departmentName || ''}
                  onChange={(e) => setSettings({ ...settings, departmentName: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Google Gemini API Key（選填，用於上傳錄音檔直接轉譯與高階 AI 摘要）</label>
                <input
                  type="password"
                  placeholder="AIzaSy... (若未填寫，系統亦內建免金鑰之瀏覽器即時語音辨識與離線智慧會議排版引擎)"
                  value={settings.geminiApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn">
              <Save size={16} /> 儲存醫院與 AI 金鑰設定
            </button>
          </form>

          <form onSubmit={handleUpdateCredentials} className="glass-panel">
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>🔑 後台管理角色帳號與密碼設定</h2>
            <p className="subtitle" style={{ marginTop: 0 }}>
              {adminRole === 'maintainer'
                ? '您目前為「系統維護人員 (x3137)」，可修改所有角色（主任、副組長、維護人員）之帳號與密碼。'
                : '您可於此修改您目前登入角色的密碼。'}
            </p>

            {adminRole === 'maintainer' && (
              <div className="form-group">
                <label>選擇要修改的角色帳號</label>
                <select
                  value={targetRoleCred}
                  onChange={(e) => {
                    const r = e.target.value;
                    setTargetRoleCred(r);
                    setCredUsername(accountsInfo?.[r]?.username || '');
                  }}
                >
                  <option value="manager">主任 (目前帳號：{accountsInfo?.manager?.username || 'x7260'})</option>
                  <option value="deputy">副組長 / 紀錄人 (目前帳號：{accountsInfo?.deputy?.username || 'x3137a'})</option>
                  <option value="maintainer">系統維護人員 (目前帳號：{accountsInfo?.maintainer?.username || 'x3137'})</option>
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              {adminRole === 'maintainer' && (
                <div className="form-group">
                  <label>新登入帳號</label>
                  <input
                    type="text"
                    value={credUsername}
                    onChange={(e) => setCredUsername(e.target.value)}
                    placeholder="輸入新帳號"
                  />
                </div>
              )}
              <div className="form-group">
                <label>新登入密碼 *</label>
                <input
                  type="password"
                  required
                  value={credPassword}
                  onChange={(e) => setCredPassword(e.target.value)}
                  placeholder="輸入新密碼"
                />
              </div>
            </div>

            <button type="submit" className="btn">
              <Save size={16} /> 更新帳號密碼
            </button>
          </form>
        </div>
      )}

      {/* ==================== 彈窗 1：會議現場簽到 QR Code 投影幕 ==================== */}
      {qrModalMeeting && (
        <div
          onClick={() => setQrModalMeeting(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.8)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel"
            style={{ maxWidth: '480px', width: '100%', textAlign: 'center', background: '#ffffff' }}
          >
            <div className="badge" style={{ background: '#dbeafe', color: '#1e40af', marginBottom: '0.5rem' }}>
              📲 會議現場手機掃碼簽到
            </div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>{qrModalMeeting.title}</h3>
            <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '0 0 1rem 0' }}>
              請出席同仁開啟手機相機或 LINE 掃描下方 QR Code，點選姓名即完成現場出席簽到！
            </p>

            {qrDataUrl && (
              <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '14px', border: '2px solid #e2e8f0', display: 'inline-block' }}>
                <img src={qrDataUrl} alt="Check-in QR Code" style={{ width: '260px', height: '260px' }} />
              </div>
            )}

            <div style={{ marginTop: '0.85rem', fontSize: '0.8rem', color: '#475569', wordBreak: 'break-all', background: '#f8fafc', padding: '0.5rem', borderRadius: '8px' }}>
              簽到網址：{checkinUrl}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem', marginTop: '1.1rem' }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(checkinUrl);
                  showToast('📋 簽到網址已複製！');
                }}
                className="btn"
              >
                <Copy size={16} /> 複製簽到連結
              </button>
              <button type="button" onClick={() => setQrModalMeeting(null)} className="btn btn-secondary">
                關閉視窗
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 彈窗 2：Excel / CSV 批次匯入人員 ==================== */}
      {showBulkModal && (
        <div
          onClick={() => setShowBulkModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel"
            style={{ maxWidth: '580px', width: '100%', background: '#ffffff' }}
          >
            <h3 style={{ marginTop: 0 }}>📥 批次匯入科內人員名單 (支援 Excel 複製貼上或 CSV)</h3>
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
              每行一位人員，格式可為：<code>代號, 姓名, 職稱, 組別, 狀態</code> 或直接每行一個姓名：
            </p>
            <textarea
              rows={8}
              value={bulkCsvText}
              onChange={(e) => setBulkCsvText(e.target.value)}
              placeholder={`範例：\nR18, 王小明, 醫事放射師, 一般科會、品保會議, 在職\nR19, 陳小華, 護理師, 主管/行政, 在職`}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" onClick={() => setShowBulkModal(false)} className="btn btn-secondary">
                取消
              </button>
              <button type="button" onClick={handleBulkImportStaff} className="btn btn-success">
                確認批次匯入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 彈窗 3：Google Apps Script 程式碼複製教學 ==================== */}
      {showGasCodeModal && (
        <div
          onClick={() => setShowGasCodeModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.8)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel"
            style={{ maxWidth: '720px', width: '100%', maxHeight: '88vh', overflowY: 'auto', background: '#ffffff' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0 }}>☁️ Google 試算表 (Apps Script) 自動同步腳本</h3>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
                  showToast('📋 已完整複製 Google Apps Script 程式碼！');
                }}
                className="btn btn-success"
              >
                <Copy size={16} /> 一鍵複製完整程式碼
              </button>
            </div>

            <pre
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '1rem',
                borderRadius: '10px',
                fontSize: '0.78rem',
                overflowX: 'auto',
                maxHeight: '420px'
              }}
            >
              {GOOGLE_APPS_SCRIPT_CODE}
            </pre>

            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button type="button" onClick={() => setShowGasCodeModal(false)} className="btn btn-secondary">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
