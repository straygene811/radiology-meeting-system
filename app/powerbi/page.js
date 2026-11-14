'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  Calendar,
  Filter,
  RefreshCw,
  ArrowLeft,
  Layers,
  Award,
  AlertCircle,
  CheckSquare,
  Download,
  Maximize2,
  XCircle
} from 'lucide-react';

const CATEGORY_COLORS = {
  教學暨CCC會議: '#6366f1',
  品保會議: '#10b981',
  科務會議: '#2563eb',
  跨領域會議: '#f59e0b',
  行政主管會議: '#ec4899',
  個案討論會: '#8b5cf6'
};

const FALLBACK_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6'];

export default function PowerBiInteractiveDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [activeReportPage, setActiveReportPage] = useState('overview'); // 'overview' | 'matrix' | 'actions'

  // Power BI Slicers (頂部切片篩選器)
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedPerson, setSelectedPerson] = useState('ALL');

  // Power BI Cross-Filtering (點擊圖表元素觸發之連動篩選)
  const [crossFilterMeetingId, setCrossFilterMeetingId] = useState(null);
  const [crossFilterActionStatus, setCrossFilterActionStatus] = useState(null);
  const [staffSortBy, setStaffSortBy] = useState('unsignedDesc'); // 'unsignedDesc' | 'signRateDesc' | 'attendRateDesc' | 'leaveDesc'
  const [hoveredTooltip, setHoveredTooltip] = useState(null);

  const fetchPowerBiData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/powerbi?table=all&format=json', { cache: 'no-store' });
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString('zh-TW', { hour12: false }));
    } catch (err) {
      console.error('Failed to load Power BI data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPowerBiData();
  }, []);

  const resetAllFilters = () => {
    setSelectedYear('ALL');
    setSelectedCategory('ALL');
    setSelectedGroup('ALL');
    setSelectedStatus('ALL');
    setSelectedPerson('ALL');
    setCrossFilterMeetingId(null);
    setCrossFilterActionStatus(null);
  };

  const hasActiveFilters =
    selectedYear !== 'ALL' ||
    selectedCategory !== 'ALL' ||
    selectedGroup !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    selectedPerson !== 'ALL' ||
    crossFilterMeetingId !== null ||
    crossFilterActionStatus !== null;

  // 取得切片器選項清單
  const slicerOptions = useMemo(() => {
    if (!data) return { years: [], categories: [], groups: [], people: [] };
    const years = Array.from(new Set((data.meetings || []).map((m) => String(m.民國年度)).filter(Boolean))).sort(
      (a, b) => Number(b) - Number(a)
    );
    const categories = Array.from(new Set((data.meetings || []).map((m) => m.會議分類名稱).filter(Boolean)));
    const groupSet = new Set(['主管/行政', '一般科會', '教學/臨床教師', '品保會議', '跨領域會議']);
    (data.staff || []).forEach((s) => {
      String(s.所屬組別 || '')
        .split('、')
        .filter(Boolean)
        .forEach((g) => groupSet.add(g));
    });
    const people = (data.staff || []).map((s) => s.姓名);
    return {
      years,
      categories,
      groups: Array.from(groupSet),
      people
    };
  }, [data]);

  // 根據 Slicers 與 Cross-Filter 過濾後的資料集
  const filtered = useMemo(() => {
    if (!data) {
      return {
        meetings: [],
        attendance: [],
        staffStats: [],
        actions: [],
        kpi: {
          totalMeetings: 0,
          avgAttendRate: 0,
          avgSignRate: 0,
          totalPresent: 0,
          totalLeave: 0,
          totalSigned: 0,
          totalUnsigned: 0,
          actionDoneRate: 0
        }
      };
    }

    // 1. 過濾會議
    const meetings = (data.meetings || []).filter((m) => {
      if (selectedYear !== 'ALL' && String(m.民國年度) !== String(selectedYear)) return false;
      if (selectedCategory !== 'ALL' && m.會議分類名稱 !== selectedCategory) return false;
      if (selectedStatus !== 'ALL' && m.專區狀態 !== selectedStatus) return false;
      if (crossFilterMeetingId && m.會議ID !== crossFilterMeetingId) return false;
      return true;
    });
    const validMeetingIds = new Set(meetings.map((m) => m.會議ID));

    // 2. 過濾出席與簽核明細 (Fact Table)
    const attendance = (data.attendance || []).filter((row) => {
      if (!validMeetingIds.has(row.會議ID)) return false;
      if (selectedGroup !== 'ALL') {
        const rowGroups = String(row.所屬組別 || '').split('、');
        if (!rowGroups.includes(selectedGroup)) return false;
      }
      if (selectedPerson !== 'ALL' && row.人員姓名 !== selectedPerson) return false;
      return true;
    });

    // 3. 動態重新聚合每位人員在目前篩選條件下的統計 (讓點擊切片器或會議時，人員長條圖也即時連動！)
    const staffMap = new Map();
    (data.staff || []).forEach((s) => {
      if (selectedGroup !== 'ALL') {
        const sGroups = String(s.所屬組別 || '').split('、');
        if (!sGroups.includes(selectedGroup)) return;
      }
      if (selectedPerson !== 'ALL' && s.姓名 !== selectedPerson) return;
      staffMap.set(s.姓名, {
        姓名: s.姓名,
        職稱: s.職稱,
        所屬組別: s.所屬組別,
        總場次: 0,
        出席場次: 0,
        休假場次: 0,
        已簽核場次: 0,
        未簽核場次: 0
      });
    });

    attendance.forEach((row) => {
      if (!staffMap.has(row.人員姓名)) return;
      const st = staffMap.get(row.人員姓名);
      st.總場次 += 1;
      if (row.是否出席數值 === 1) st.出席場次 += 1;
      else st.休假場次 += 1;
      if (row.是否已簽核數值 === 1) st.已簽核場次 += 1;
      else st.未簽核場次 += 1;
    });

    const staffStats = Array.from(staffMap.values()).map((st) => ({
      ...st,
      出席率: st.總場次 > 0 ? Math.round((st.出席場次 / st.總場次) * 100) : 0,
      簽核率: st.總場次 > 0 ? Math.round((st.已簽核場次 / st.總場次) * 100) : 0
    }));

    // 排序人員排行
    staffStats.sort((a, b) => {
      if (staffSortBy === 'unsignedDesc') return b.未簽核場次 - a.未簽核場次 || a.簽核率 - b.簽核率;
      if (staffSortBy === 'signRateDesc') return b.簽核率 - a.簽核率 || b.已簽核場次 - a.已簽核場次;
      if (staffSortBy === 'attendRateDesc') return b.出席率 - a.出席率 || b.出席場次 - a.出席場次;
      if (staffSortBy === 'leaveDesc') return b.休假場次 - a.休假場次;
      return 0;
    });

    // 4. 過濾待辦事項
    const actions = (data.actions || []).filter((act) => {
      if (!validMeetingIds.has(act.會議ID)) return false;
      if (selectedPerson !== 'ALL' && !String(act.負責人員 || '').includes(selectedPerson)) return false;
      if (crossFilterActionStatus && act.進度狀態 !== crossFilterActionStatus) return false;
      return true;
    });

    // 5. 計算動態 KPI
    const totalMeetings = meetings.length;
    const totalRecords = attendance.length;
    const totalPresent = attendance.filter((r) => r.是否出席數值 === 1).length;
    const totalLeave = attendance.filter((r) => r.是否出席數值 === 0).length;
    const totalSigned = attendance.filter((r) => r.是否已簽核數值 === 1).length;
    const totalUnsigned = Math.max(0, totalRecords - totalSigned);

    const avgAttendRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;
    const avgSignRate = totalRecords > 0 ? Math.round((totalSigned / totalRecords) * 100) : 0;
    const actionDoneCount = actions.filter((a) => a.進度狀態 === '已完成').length;
    const actionDoneRate = actions.length > 0 ? Math.round((actionDoneCount / actions.length) * 100) : 100;

    return {
      meetings,
      attendance,
      staffStats,
      actions,
      kpi: {
        totalMeetings,
        avgAttendRate,
        avgSignRate,
        totalPresent,
        totalLeave,
        totalSigned,
        totalUnsigned,
        actionDoneRate,
        actionTotal: actions.length,
        actionDoneCount
      }
    };
  }, [
    data,
    selectedYear,
    selectedCategory,
    selectedGroup,
    selectedStatus,
    selectedPerson,
    crossFilterMeetingId,
    crossFilterActionStatus,
    staffSortBy
  ]);

  // 計算各會議分類圓餅/環圈圖數據 (忽略 selectedCategory 以便讓使用者點擊其他分類切換，或突顯已選分類)
  const categoryChartData = useMemo(() => {
    if (!data) return [];
    const baseMeetings = (data.meetings || []).filter((m) => {
      if (selectedYear !== 'ALL' && String(m.民國年度) !== String(selectedYear)) return false;
      if (selectedStatus !== 'ALL' && m.專區狀態 !== selectedStatus) return false;
      return true;
    });
    const counts = {};
    baseMeetings.forEach((m) => {
      const cat = m.會議分類名稱 || '未分類';
      if (!counts[cat]) counts[cat] = { name: cat, count: 0, signed: 0, total: 0 };
      counts[cat].count += 1;
      counts[cat].signed += Number(m.已簽核人數 || 0);
      counts[cat].total += Number(m.應到人數 || 0);
    });
    const totalCount = baseMeetings.length || 1;
    return Object.values(counts).map((item, idx) => ({
      ...item,
      percentage: Math.round((item.count / totalCount) * 100),
      signRate: item.total > 0 ? Math.round((item.signed / item.total) * 100) : 0,
      color: CATEGORY_COLORS[item.name] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
    }));
  }, [data, selectedYear, selectedStatus]);

  // 計算每場會議在目前人員篩選下的實況數據 (供組合圖與趨勢圖使用)
  const meetingChartSeries = useMemo(() => {
    return [...filtered.meetings]
      .sort((a, b) => String(a.開會日期).localeCompare(String(b.開會日期)))
      .map((m) => {
        const rows = filtered.attendance.filter((r) => r.會議ID === m.會議ID);
        const total = rows.length || 1;
        const present = rows.filter((r) => r.是否出席數值 === 1).length;
        const leave = rows.filter((r) => r.是否出席數值 === 0).length;
        const signed = rows.filter((r) => r.是否已簽核數值 === 1).length;
        const unsigned = Math.max(0, rows.length - signed);
        return {
          id: m.會議ID,
          title: m.會議標題,
          shortDate: (m.開會日期 || '').slice(5),
          fullDate: m.開會日期,
          category: m.會議分類名稱,
          present,
          leave,
          signed,
          unsigned,
          total: rows.length,
          attendRate: rows.length > 0 ? Math.round((present / total) * 100) : 0,
          signRate: rows.length > 0 ? Math.round((signed / total) * 100) : 0
        };
      });
  }, [filtered.meetings, filtered.attendance]);

  // 計算待辦事項狀態分布
  const actionStatusData = useMemo(() => {
    if (!data) return [];
    const validIds = new Set(filtered.meetings.map((m) => m.會議ID));
    const baseActions = (data.actions || []).filter((a) => {
      if (!validIds.has(a.會議ID)) return false;
      if (selectedPerson !== 'ALL' && !String(a.負責人員 || '').includes(selectedPerson)) return false;
      return true;
    });
    const statusMap = {
      已完成: { name: '已完成', count: 0, color: '#10b981' },
      進行中: { name: '進行中', count: 0, color: '#f59e0b' },
      未開始: { name: '未開始', count: 0, color: '#ef4444' }
    };
    baseActions.forEach((a) => {
      const st = a.進度狀態 || '進行中';
      if (!statusMap[st]) statusMap[st] = { name: st, count: 0, color: '#6366f1' };
      statusMap[st].count += 1;
    });
    const total = baseActions.length || 1;
    return Object.values(statusMap).map((s) => ({
      ...s,
      percentage: Math.round((s.count / total) * 100)
    }));
  }, [data, filtered.meetings, selectedPerson]);

  // 繪製 SVG 環圈圖扇形路徑輔助函式
  const buildDonutSegments = (items, valueKey) => {
    const total = items.reduce((acc, it) => acc + (it[valueKey] || 0), 0);
    if (total === 0) return [];
    let cumulative = 0;
    const radius = 68;
    const circumference = 2 * Math.PI * radius;
    return items.map((it) => {
      const val = it[valueKey] || 0;
      const frac = val / total;
      const strokeDasharray = `${frac * circumference} ${circumference}`;
      const strokeDashoffset = -cumulative * circumference;
      cumulative += frac;
      return {
        ...it,
        frac,
        strokeDasharray,
        strokeDashoffset
      };
    });
  };

  const categoryDonutSegments = useMemo(
    () => buildDonutSegments(categoryChartData, 'count'),
    [categoryChartData]
  );

  const actionDonutSegments = useMemo(
    () => buildDonutSegments(actionStatusData, 'count'),
    [actionStatusData]
  );

  if (loading && !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: '#ffffff', padding: '2rem 2.5rem', borderRadius: '16px', boxShadow: '0 10px 25px rgba(15,23,42,0.08)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</div>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>正在載入 Power BI 互動式視覺化圖表引擎...</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>即時串聯會議、出席、簽核與待辦事項資料模型</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eaeff5', color: '#0f172a', display: 'flex', flexDirection: 'column', fontFamily: '"Segoe UI", "Microsoft JhengHei", sans-serif' }}>
      {/* ==================== Power BI Studio 頂部導覽列 ==================== */}
      <header
        style={{
          background: '#1e293b',
          color: '#ffffff',
          padding: '0.65rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          borderBottom: '3px solid #f59e0b',
          boxShadow: '0 2px 10px rgba(0,0,0,0.15)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div
            style={{
              background: '#f59e0b',
              color: '#0f172a',
              fontWeight: 900,
              padding: '0.3rem 0.65rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <BarChart3 size={16} /> Power BI 互動式報表中心
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.02em' }}>
              新樓基督教醫院 影像醫學科 — 會議出席・簽核・待辦決議 互動式 BI 儀表板
            </div>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
              支援跨圖表交叉篩選 (Cross-Filtering)：點擊下方任一圓餅扇形、會議柱狀、或人員橫條，全報表自動即時聯動分析
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.76rem', color: '#cbd5e1', marginRight: '0.25rem' }}>
            最後同步：{lastUpdated || '剛剛'}
          </span>
          <button
            type="button"
            onClick={fetchPowerBiData}
            style={{
              background: '#334155',
              color: '#ffffff',
              border: '1px solid #475569',
              borderRadius: '6px',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <RefreshCw size={14} /> 重新整理數據
          </button>
          <a
            href="/api/powerbi?format=html"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#059669',
              color: '#ffffff',
              textDecoration: 'none',
              borderRadius: '6px',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <Download size={14} /> 檢視 4 張原始資料表
          </a>
          <Link
            href="/admin/dashboard"
            style={{
              background: '#3b82f6',
              color: '#ffffff',
              textDecoration: 'none',
              borderRadius: '6px',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <ArrowLeft size={14} /> 返回管理後台
          </Link>
        </div>
      </header>

      {/* ==================== Power BI Slicers (頂部交叉切片篩選器列) ==================== */}
      <div
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #cbd5e1',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.9rem',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', alignItems: 'center', flex: 1 }}>
          {/* 1. 民國年度切片器 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569' }}>📅 年度切片器：</span>
            <button
              type="button"
              onClick={() => setSelectedYear('ALL')}
              style={{
                padding: '0.2rem 0.55rem',
                fontSize: '0.76rem',
                fontWeight: 700,
                borderRadius: '5px',
                border: 'none',
                cursor: 'pointer',
                background: selectedYear === 'ALL' ? '#1e293b' : 'transparent',
                color: selectedYear === 'ALL' ? '#ffffff' : '#475569'
              }}
            >
              全部
            </button>
            {slicerOptions.years.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => setSelectedYear(selectedYear === yr ? 'ALL' : yr)}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  borderRadius: '5px',
                  border: 'none',
                  cursor: 'pointer',
                  background: selectedYear === yr ? '#2563eb' : 'transparent',
                  color: selectedYear === yr ? '#ffffff' : '#334155'
                }}
              >
                {yr}年
              </button>
            ))}
          </div>

          {/* 2. 會議分類切片器 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569' }}>📂 會議分類：</span>
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              style={{
                padding: '0.2rem 0.55rem',
                fontSize: '0.76rem',
                fontWeight: 700,
                borderRadius: '5px',
                border: 'none',
                cursor: 'pointer',
                background: selectedCategory === 'ALL' ? '#1e293b' : 'transparent',
                color: selectedCategory === 'ALL' ? '#ffffff' : '#475569'
              }}
            >
              全部
            </button>
            {slicerOptions.categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(selectedCategory === cat ? 'ALL' : cat)}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  borderRadius: '5px',
                  border: 'none',
                  cursor: 'pointer',
                  background: selectedCategory === cat ? CATEGORY_COLORS[cat] || '#2563eb' : 'transparent',
                  color: selectedCategory === cat ? '#ffffff' : '#334155'
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 3. 人員所屬組別切片器 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569' }}>🏥 組別：</span>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#0f172a',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="ALL">全部組別</option>
              {slicerOptions.groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* 4. 專區狀態切片器 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569' }}>📌 狀態：</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#0f172a',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="ALL">全部會議狀態</option>
              <option value="開放簽閱中">開放簽閱中</option>
              <option value="歷史紀錄專區">歷史紀錄專區</option>
            </select>
          </div>

          {/* 5. 特定同仁快速切片器 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569' }}>👤 同仁：</span>
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#0f172a',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="ALL">全部在職同仁 ({slicerOptions.people.length}人)</option>
              {slicerOptions.people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 清除所有交叉篩選按鈕 */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetAllFilters}
            style={{
              background: '#fee2e2',
              color: '#b91c1c',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            <XCircle size={14} /> 清除所有篩選條件
          </button>
        )}
      </div>

      {/* 目前啟動中的交叉篩選提示列 */}
      {hasActiveFilters && (
        <div
          style={{
            background: '#eff6ff',
            borderBottom: '1px solid #bfdbfe',
            padding: '0.4rem 1.25rem',
            fontSize: '0.78rem',
            color: '#1e40af',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap'
          }}
        >
          <strong>🎯 Power BI 交叉篩選作用中：</strong>
          {selectedYear !== 'ALL' && (
            <span style={{ background: '#dbeafe', padding: '0.1rem 0.5rem', borderRadius: '99px', fontWeight: 700 }}>
              年度：{selectedYear}年
            </span>
          )}
          {selectedCategory !== 'ALL' && (
            <span style={{ background: '#dbeafe', padding: '0.1rem 0.5rem', borderRadius: '99px', fontWeight: 700 }}>
              分類：{selectedCategory}
            </span>
          )}
          {selectedGroup !== 'ALL' && (
            <span style={{ background: '#dbeafe', padding: '0.1rem 0.5rem', borderRadius: '99px', fontWeight: 700 }}>
              組別：{selectedGroup}
            </span>
          )}
          {selectedStatus !== 'ALL' && (
            <span style={{ background: '#dbeafe', padding: '0.1rem 0.5rem', borderRadius: '99px', fontWeight: 700 }}>
              狀態：{selectedStatus}
            </span>
          )}
          {selectedPerson !== 'ALL' && (
            <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.55rem', borderRadius: '99px', fontWeight: 800 }}>
              👤 鎖定人員：{selectedPerson}
            </span>
          )}
          {crossFilterMeetingId && (
            <span style={{ background: '#dcfce7', color: '#166534', padding: '0.1rem 0.55rem', borderRadius: '99px', fontWeight: 800 }}>
              📌 鎖定單場會議：{crossFilterMeetingId}
            </span>
          )}
          {crossFilterActionStatus && (
            <span style={{ background: '#f3e8ff', color: '#6b21a8', padding: '0.1rem 0.55rem', borderRadius: '99px', fontWeight: 800 }}>
              ⚡ 待辦狀態：{crossFilterActionStatus}
            </span>
          )}
        </div>
      )}

      {/* ==================== Power BI 畫布主體區 ==================== */}
      <main style={{ flex: 1, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* 頂部 6 張 Power BI KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '0.85rem' }}>
          {/* KPI 1 */}
          <div style={{ background: '#ffffff', borderRadius: '10px', padding: '0.85rem 1rem', borderLeft: '5px solid #2563eb', boxShadow: '0 2px 6px rgba(15,23,42,0.05)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>📅 篩選會議總場次</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#0f172a', margin: '0.15rem 0' }}>
              {filtered.kpi.totalMeetings} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>場</span>
            </div>
            <div style={{ fontSize: '0.73rem', color: '#2563eb', fontWeight: 600 }}>
              涵蓋 {slicerOptions.categories.length} 大會議類別
            </div>
          </div>

          {/* KPI 2 */}
          <div style={{ background: '#ffffff', borderRadius: '10px', padding: '0.85rem 1rem', borderLeft: '5px solid #0284c7', boxShadow: '0 2px 6px rgba(15,23,42,0.05)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>👥 平均會議出席率</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#0284c7', margin: '0.15rem 0' }}>
              {filtered.kpi.avgAttendRate}%
            </div>
            <div style={{ fontSize: '0.73rem', color: '#475569' }}>
              出席 <strong>{filtered.kpi.totalPresent}</strong> 人次 / 休假 <strong>{filtered.kpi.totalLeave}</strong> 人次
            </div>
          </div>

          {/* KPI 3 */}
          <div style={{ background: '#ffffff', borderRadius: '10px', padding: '0.85rem 1rem', borderLeft: '5px solid #10b981', boxShadow: '0 2px 6px rgba(15,23,42,0.05)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>✍️ 平均線上簽核完成率</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#059669', margin: '0.15rem 0' }}>
              {filtered.kpi.avgSignRate}%
            </div>
            <div style={{ fontSize: '0.73rem', color: '#475569' }}>
              已簽 <strong style={{ color: '#059669' }}>{filtered.kpi.totalSigned}</strong> / 未簽 <strong style={{ color: '#dc2626' }}>{filtered.kpi.totalUnsigned}</strong> 人次
            </div>
          </div>

          {/* KPI 4 */}
          <div style={{ background: '#ffffff', borderRadius: '10px', padding: '0.85rem 1rem', borderLeft: '5px solid #ef4444', boxShadow: '0 2px 6px rgba(15,23,42,0.05)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>⏳ 尚待簽閱總人次</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: filtered.kpi.totalUnsigned > 0 ? '#dc2626' : '#059669', margin: '0.15rem 0' }}>
              {filtered.kpi.totalUnsigned} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>人次</span>
            </div>
            <div style={{ fontSize: '0.73rem', color: '#64748b' }}>
              點擊下方人員長條可篩選未簽明細
            </div>
          </div>

          {/* KPI 5 */}
          <div style={{ background: '#ffffff', borderRadius: '10px', padding: '0.85rem 1rem', borderLeft: '5px solid #f59e0b', boxShadow: '0 2px 6px rgba(15,23,42,0.05)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>📌 決議待辦完成率</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#d97706', margin: '0.15rem 0' }}>
              {filtered.kpi.actionDoneRate}%
            </div>
            <div style={{ fontSize: '0.73rem', color: '#475569' }}>
              已完成 <strong>{filtered.kpi.actionDoneCount}</strong> / 共 <strong>{filtered.kpi.actionTotal}</strong> 項待辦
            </div>
          </div>
        </div>

        {/* ==================== 報表分頁 1：會議出席與簽閱總覽 (Overview) ==================== */}
        {activeReportPage === 'overview' && (
          <>
            {/* 第一排圖表：左（會議分類環圈圖 Donut）+ 右（各場會議出席率 vs 簽核率 群組組合圖 Combo Chart） */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
              {/* Visual 1: 各類會議佔比與簽核率互動環圈圖 (Donut Chart) */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '1rem 1.15rem',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.96rem', color: '#0f172a' }}>
                      🍩 各類會議場次佔比與簽核率（點擊扇形可交叉篩選）
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      點擊任一會議分類扇形或圖例，即可連動篩選全頁所有圖表
                    </div>
                  </div>
                  {selectedCategory !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('ALL')}
                      style={{
                        fontSize: '0.72rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        cursor: 'pointer'
                      }}
                    >
                      顯示全部分類
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: '1rem', margin: '0.5rem 0' }}>
                  {/* SVG Donut */}
                  <div style={{ position: 'relative', width: '180px', height: '180px' }}>
                    <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="90" cy="90" r="68" fill="transparent" stroke="#f1f5f9" strokeWidth="26" />
                      {categoryDonutSegments.map((seg) => {
                        const isSelected = selectedCategory === 'ALL' || selectedCategory === seg.name;
                        return (
                          <circle
                            key={seg.name}
                            cx="90"
                            cy="90"
                            r="68"
                            fill="transparent"
                            stroke={seg.color}
                            strokeWidth={selectedCategory === seg.name ? '31' : '26'}
                            strokeDasharray={seg.strokeDasharray}
                            strokeDashoffset={seg.strokeDashoffset}
                            style={{
                              cursor: 'pointer',
                              opacity: isSelected ? 1 : 0.28,
                              transition: 'all 0.25s ease'
                            }}
                            onClick={() => setSelectedCategory(selectedCategory === seg.name ? 'ALL' : seg.name)}
                          >
                            <title>{`${seg.name}：${seg.count} 場 (${seg.percentage}%)｜平均簽核率 ${seg.signRate}%`}</title>
                          </circle>
                        );
                      })}
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none'
                      }}
                    >
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>
                        {selectedCategory === 'ALL' ? '總會議數' : selectedCategory}
                      </span>
                      <span style={{ fontSize: '1.55rem', fontWeight: 900, color: '#0f172a' }}>
                        {filtered.kpi.totalMeetings}場
                      </span>
                    </div>
                  </div>

                  {/* 圖例與互動列表 */}
                  <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {categoryChartData.map((item) => {
                      const active = selectedCategory === item.name;
                      return (
                        <div
                          key={item.name}
                          onClick={() => setSelectedCategory(active ? 'ALL' : item.name)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.4rem 0.6rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            background: active ? '#eff6ff' : '#f8fafc',
                            border: active ? `2px solid ${item.color}` : '1px solid #e2e8f0',
                            opacity: selectedCategory === 'ALL' || active ? 1 : 0.5
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <span
                              style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '3px',
                                background: item.color,
                                display: 'inline-block'
                              }}
                            />
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{item.name}</span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 700 }}>
                            {item.count} 場 ({item.percentage}%) · <span style={{ color: '#059669' }}>簽核 {item.signRate}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Visual 2: 各場會議「出席率 vs 簽核率」群組直條與折線組合圖 (Combo Chart) */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '1rem 1.15rem',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.96rem', color: '#0f172a' }}>
                      📊 各場會議「出席率 vs 簽核完成率」對比圖（點擊柱狀可鎖定單場會議）
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      藍色代表出席率(%)、綠色代表已簽核率(%)；點擊任一場會議可交叉篩選下方人員明細
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', fontWeight: 700 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#2563eb' }}>
                      <span style={{ width: '10px', height: '10px', background: '#3b82f6', display: 'inline-block', borderRadius: '2px' }} />
                      出席率 (%)
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#059669' }}>
                      <span style={{ width: '10px', height: '10px', background: '#10b981', display: 'inline-block', borderRadius: '2px' }} />
                      簽核完成率 (%)
                    </span>
                  </div>
                </div>

                {/* 互動式直條圖畫布 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '0.65rem',
                    height: '205px',
                    padding: '1.2rem 0.5rem 0.25rem 0.5rem',
                    borderBottom: '2px solid #cbd5e1',
                    overflowX: 'auto'
                  }}
                >
                  {meetingChartSeries.map((m) => {
                    const isSelected = !crossFilterMeetingId || crossFilterMeetingId === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setCrossFilterMeetingId(crossFilterMeetingId === m.id ? null : m.id)}
                        style={{
                          flex: '1 0 64px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          height: '100%',
                          justifyContent: 'flex-end',
                          cursor: 'pointer',
                          opacity: isSelected ? 1 : 0.35,
                          background: crossFilterMeetingId === m.id ? '#eff6ff' : 'transparent',
                          borderRadius: '8px',
                          padding: '0.2rem 0.25rem',
                          border: crossFilterMeetingId === m.id ? '1px solid #3b82f6' : '1px solid transparent',
                          transition: 'all 0.2s'
                        }}
                        title={`${m.title}\n日期：${m.fullDate}\n出席：${m.present}人 (${m.attendRate}%) / 休假：${m.leave}人\n已簽核：${m.signed}人 (${m.signRate}%) / 未簽核：${m.unsigned}人`}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '140px', width: '100%', justifyContent: 'center' }}>
                          {/* 出席率柱 */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#1d4ed8', marginBottom: '2px' }}>
                              {m.attendRate}%
                            </span>
                            <div
                              style={{
                                width: '18px',
                                height: `${Math.max(6, (m.attendRate / 100) * 115)}px`,
                                background: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
                                borderRadius: '4px 4px 0 0',
                                transition: 'height 0.3s ease'
                              }}
                            />
                          </div>

                          {/* 簽核率柱 */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#047857', marginBottom: '2px' }}>
                              {m.signRate}%
                            </span>
                            <div
                              style={{
                                width: '18px',
                                height: `${Math.max(6, (m.signRate / 100) * 115)}px`,
                                background: 'linear-gradient(180deg, #34d399 0%, #059669 100%)',
                                borderRadius: '4px 4px 0 0',
                                transition: 'height 0.3s ease'
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#334155', marginTop: '0.35rem', whiteSpace: 'nowrap' }}>
                          {m.shortDate}
                        </div>
                        <div
                          style={{
                            fontSize: '0.65rem',
                            color: '#64748b',
                            maxWidth: '72px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {m.category}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 第二排圖表：左（全科人員出席/休假/已簽/未簽互動橫條排行圖）+ 右（待辦事項狀態圓餅與時間趨勢圖） */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: '1rem' }}>
              {/* Visual 3: 全科人員出席與簽核排行橫條圖 (Interactive Stacked Bar Chart) */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '1rem 1.15rem',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.06)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.96rem', color: '#0f172a' }}>
                      👥 全科同仁「已簽核 vs 未簽核 / 出席 vs 休假」互動橫條圖（點擊姓名可鎖定個人）
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      點擊任一位同仁列，全畫面圖表將立即交叉篩選該名同仁的出勤與簽核紀錄
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {[
                      { id: 'unsignedDesc', label: '🔥 未簽核最多' },
                      { id: 'signRateDesc', label: '✅ 簽核率最高' },
                      { id: 'attendRateDesc', label: '🙋 出席率最高' },
                      { id: 'leaveDesc', label: '🌙 值班休假最多' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStaffSortBy(tab.id)}
                        style={{
                          padding: '0.25rem 0.55rem',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          cursor: 'pointer',
                          background: staffSortBy === tab.id ? '#0f172a' : '#f8fafc',
                          color: staffSortBy === tab.id ? '#ffffff' : '#475569'
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ maxHeight: '340px', overflowY: 'auto', paddingRight: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {filtered.staffStats.map((st) => {
                    const isPersonSelected = selectedPerson === st.姓名;
                    const maxTotal = Math.max(1, st.總場次);
                    const signedWidth = Math.round((st.已簽核場次 / maxTotal) * 100);
                    const unsignedWidth = Math.max(0, 100 - signedWidth);

                    return (
                      <div
                        key={st.姓名}
                        onClick={() => setSelectedPerson(isPersonSelected ? 'ALL' : st.姓名)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '115px 1fr 165px',
                          alignItems: 'center',
                          gap: '0.65rem',
                          padding: '0.4rem 0.65rem',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: isPersonSelected ? '#fef3c7' : '#f8fafc',
                          border: isPersonSelected ? '2px solid #f59e0b' : '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0f172a' }}>{st.姓名}</span>
                          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{st.職稱}</span>
                        </div>

                        {/* 堆疊進度橫條：綠色已簽核 / 紅色未簽核 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', height: '14px', borderRadius: '99px', overflow: 'hidden', background: '#fee2e2' }}>
                            {st.已簽核場次 > 0 && (
                              <div
                                style={{
                                  width: `${signedWidth}%`,
                                  background: 'linear-gradient(90deg, #10b981, #059669)',
                                  color: '#ffffff',
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                {signedWidth >= 20 ? `已簽 ${st.已簽核場次}` : ''}
                              </div>
                            )}
                            {st.未簽核場次 > 0 && (
                              <div
                                style={{
                                  width: `${unsignedWidth}%`,
                                  background: 'linear-gradient(90deg, #f87171, #ef4444)',
                                  color: '#ffffff',
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                {unsignedWidth >= 20 ? `未簽 ${st.未簽核場次}` : ''}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 右側數值標籤 */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', fontSize: '0.74rem', fontWeight: 700 }}>
                          <span style={{ color: '#2563eb' }}>出席 {st.出席場次}</span>
                          <span style={{ color: '#64748b' }}>休假 {st.休假場次}</span>
                          <span
                            style={{
                              padding: '0.05rem 0.4rem',
                              borderRadius: '99px',
                              background: st.未簽核場次 === 0 ? '#dcfce7' : '#fee2e2',
                              color: st.未簽核場次 === 0 ? '#15803d' : '#b91c1c'
                            }}
                          >
                            簽核 {st.簽核率}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Visual 4: 決議待辦事項執行進度環圈圖 & 待辦清單 */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '1rem 1.15rem',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.96rem', color: '#0f172a' }}>
                    🎯 會議決議待辦事項狀態分布（點擊狀態可篩選待辦）
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.6rem' }}>
                    即時追蹤各場會議指派任務之完成進度與負責同仁
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                    <div style={{ position: 'relative', width: '130px', height: '130px', flexShrink: 0 }}>
                      <svg width="130" height="130" viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="90" cy="90" r="68" fill="transparent" stroke="#f1f5f9" strokeWidth="28" />
                        {actionDonutSegments.map((seg) => (
                          <circle
                            key={seg.name}
                            cx="90"
                            cy="90"
                            r="68"
                            fill="transparent"
                            stroke={seg.color}
                            strokeWidth={crossFilterActionStatus === seg.name ? '34' : '28'}
                            strokeDasharray={seg.strokeDasharray}
                            strokeDashoffset={seg.strokeDashoffset}
                            style={{ cursor: 'pointer' }}
                            onClick={() =>
                              setCrossFilterActionStatus(crossFilterActionStatus === seg.name ? null : seg.name)
                            }
                          />
                        ))}
                      </svg>
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: 'none'
                        }}
                      >
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>完成率</span>
                        <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
                          {filtered.kpi.actionDoneRate}%
                        </span>
                      </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {actionStatusData.map((st) => {
                        const active = crossFilterActionStatus === st.name;
                        return (
                          <div
                            key={st.name}
                            onClick={() => setCrossFilterActionStatus(active ? null : st.name)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.35rem 0.6rem',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: active ? '#fef3c7' : '#f8fafc',
                              border: active ? `2px solid ${st.color}` : '1px solid #e2e8f0'
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700 }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: st.color }} />
                              {st.name}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155' }}>
                              {st.count} 項 ({st.percentage}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 待辦事項快速預覽清單 */}
                  <div style={{ maxHeight: '175px', overflowY: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {filtered.actions.map((act) => (
                      <div
                        key={act.待辦ID}
                        style={{
                          padding: '0.4rem 0.55rem',
                          borderRadius: '6px',
                          background: '#f8fafc',
                          borderLeft: `4px solid ${act.進度狀態 === '已完成' ? '#10b981' : '#f59e0b'}`,
                          fontSize: '0.76rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{act.待辦事項內容}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            負責人：{act.負責人員} ｜ 期限：{act.預計完成日 || '未定'}
                          </div>
                        </div>
                        <span
                          style={{
                            padding: '0.15rem 0.45rem',
                            borderRadius: '99px',
                            fontWeight: 800,
                            fontSize: '0.7rem',
                            background: act.進度狀態 === '已完成' ? '#dcfce7' : '#fef3c7',
                            color: act.進度狀態 === '已完成' ? '#166534' : '#92400e',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {act.進度狀態}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ==================== 報表分頁 2：Power BI 交叉分析矩陣熱力表 (Matrix Heatmap) ==================== */}
        {activeReportPage === 'matrix' && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              boxShadow: '0 2px 8px rgba(15,23,42,0.06)'
            }}
          >
            <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>
                  🔥 Power BI 交叉分析矩陣熱力表（全科同仁 × 各場會議 出勤與簽核狀態一覽）
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
                  點擊左側人員姓名或上方會議標題即可鎖定篩選；格內顏色代表：🟢出席已簽、🟠出席未簽、🔵休假已簽、🔴休假未簽
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 700, flexWrap: 'wrap' }}>
                <span style={{ background: '#dcfce7', color: '#166534', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>✅ 出席且已簽核</span>
                <span style={{ background: '#ffedd5', color: '#c2410c', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>⚠️ 出席但未簽核</span>
                <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>🌙 休假且已簽核</span>
                <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>❌ 休假且未簽核</span>
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '540px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#ffffff', position: 'sticky', top: 0, zIndex: 5 }}>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', minWidth: '120px', position: 'sticky', left: 0, background: '#1e293b' }}>
                      同仁姓名 / 職稱
                    </th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', minWidth: '75px' }}>個人出席率</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', minWidth: '75px' }}>個人簽核率</th>
                    {filtered.meetings.map((m) => (
                      <th
                        key={m.會議ID}
                        onClick={() => setCrossFilterMeetingId(crossFilterMeetingId === m.會議ID ? null : m.會議ID)}
                        style={{
                          padding: '0.5rem 0.6rem',
                          textAlign: 'center',
                          minWidth: '115px',
                          cursor: 'pointer',
                          borderLeft: '1px solid #334155'
                        }}
                        title={m.會議標題}
                      >
                        <div style={{ color: '#93c5fd', fontSize: '0.7rem' }}>{m.開會日期}</div>
                        <div style={{ fontWeight: 800, fontSize: '0.75rem' }}>{m.會議分類名稱}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.staffStats.map((st, idx) => (
                    <tr
                      key={st.姓名}
                      style={{
                        background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                        borderBottom: '1px solid #e2e8f0'
                      }}
                    >
                      <td
                        onClick={() => setSelectedPerson(selectedPerson === st.姓名 ? 'ALL' : st.姓名)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          fontWeight: 800,
                          color: '#0f172a',
                          cursor: 'pointer',
                          position: 'sticky',
                          left: 0,
                          background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                          borderRight: '1px solid #e2e8f0'
                        }}
                      >
                        {st.姓名} <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>({st.職稱})</span>
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>
                        {st.出席率}% ({st.出席場次}/{st.總場次})
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 800, color: st.簽核率 === 100 ? '#059669' : '#dc2626' }}>
                        {st.簽核率}% ({st.已簽核場次}/{st.總場次})
                      </td>
                      {filtered.meetings.map((m) => {
                        const cell = filtered.attendance.find(
                          (r) => r.會議ID === m.會議ID && r.人員姓名 === st.姓名
                        );
                        if (!cell) {
                          return (
                            <td key={m.會議ID} style={{ textAlign: 'center', color: '#cbd5e1' }}>
                              -
                            </td>
                          );
                        }
                        const isPresent = cell.是否出席數值 === 1;
                        const isSigned = cell.是否已簽核數值 === 1;

                        let bg = '#fee2e2';
                        let fg = '#b91c1c';
                        let label = '❌ 休假未簽';
                        if (isPresent && isSigned) {
                          bg = '#dcfce7';
                          fg = '#166534';
                          label = '✅ 出席已簽';
                        } else if (isPresent && !isSigned) {
                          bg = '#ffedd5';
                          fg = '#c2410c';
                          label = '⚠️ 出席未簽';
                        } else if (!isPresent && isSigned) {
                          bg = '#dbeafe';
                          fg = '#1e40af';
                          label = '🌙 休假已簽';
                        }

                        return (
                          <td
                            key={m.會議ID}
                            style={{
                              padding: '0.4rem',
                              textAlign: 'center',
                              borderLeft: '1px solid #f1f5f9'
                            }}
                            title={`${st.姓名} - ${m.會議標題}\n出勤：${cell.出勤狀態}\n簽核：${cell.簽核狀態} (${cell.簽核時間 || '未簽'})`}
                          >
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.45rem',
                                borderRadius: '6px',
                                background: bg,
                                color: fg,
                                fontWeight: 800,
                                fontSize: '0.72rem'
                              }}
                            >
                              {label}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 報表分頁 3：會議決議與待辦事項明細表 (Actions & Detail Table) ==================== */}
        {activeReportPage === 'actions' && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              boxShadow: '0 2px 8px rgba(15,23,42,0.06)'
            }}
          >
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.05rem', color: '#0f172a' }}>
              📌 會議決議待辦事項追蹤總表（共 {filtered.actions.length} 筆）
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#ffffff' }}>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>開會日期</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>會議分類</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>會議標題</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>待辦事項內容</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>負責人員</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>預計完成日</th>
                    <th style={{ padding: '0.6rem', textAlign: 'center' }}>執行狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.actions.map((act, i) => (
                    <tr key={act.待辦ID || i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                      <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap' }}>{act.開會日期}</td>
                      <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700 }}>{act.會議分類}</td>
                      <td style={{ padding: '0.55rem 0.6rem' }}>{act.會議標題}</td>
                      <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700, color: '#0f172a' }}>{act.待辦事項內容}</td>
                      <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700, color: '#2563eb' }}>{act.負責人員}</td>
                      <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap' }}>{act.預計完成日 || '-'}</td>
                      <td style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '99px',
                            fontWeight: 800,
                            fontSize: '0.74rem',
                            background: act.進度狀態 === '已完成' ? '#dcfce7' : '#fef3c7',
                            color: act.進度狀態 === '已完成' ? '#166534' : '#92400e'
                          }}
                        >
                          {act.進度狀態}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ==================== Power BI 底部經典黃色工作表分頁列 (Bottom Page Tabs) ==================== */}
      <footer
        style={{
          background: '#ffffff',
          borderTop: '1px solid #cbd5e1',
          padding: '0 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          minHeight: '42px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {[
            { id: 'overview', label: '📊 第 1 頁：會議出席與簽閱視覺化總覽' },
            { id: 'matrix', label: '🔥 第 2 頁：人員 × 會議 交叉分析矩陣熱力表' },
            { id: 'actions', label: '📌 第 3 頁：決議待辦事項追蹤明細表' }
          ].map((tab) => {
            const active = activeReportPage === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveReportPage(tab.id)}
                style={{
                  padding: '0.55rem 1rem',
                  fontSize: '0.82rem',
                  fontWeight: active ? 800 : 600,
                  color: active ? '#0f172a' : '#64748b',
                  background: active ? '#fef3c7' : 'transparent',
                  border: 'none',
                  borderBottom: active ? '3px solid #f59e0b' : '3px solid transparent',
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
          新樓醫院影像醫學科 Power BI 即時分析引擎 · 資料源自動同步中
        </div>
      </footer>
    </div>
  );
}

