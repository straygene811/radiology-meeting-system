import fs from 'fs';
import os from 'os';
import path from 'path';
import { createClient } from '@vercel/kv';
import pg from 'pg';

const { Pool } = pg;

// 1. 自動偵測任何前綴之 Upstash / Vercel KV REST API 變數 (例如 KV_, STORAGE_, RAD_, UPSTASH_REDIS_)
function resolveKvConfig() {
  const directUrl =
    process.env.KV_REST_API_URL ||
    process.env.STORAGE_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL;
  const directToken =
    process.env.KV_REST_API_TOKEN ||
    process.env.STORAGE_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;
  if (directUrl && directToken) return { url: directUrl, token: directToken };

  for (const [k, v] of Object.entries(process.env || {})) {
    if (k.endsWith('_REST_API_URL') && typeof v === 'string' && v.startsWith('http')) {
      const tokenKey = k.replace(/_REST_API_URL$/, '_REST_API_TOKEN');
      const tokenVal = process.env[tokenKey];
      if (tokenVal) return { url: v, token: tokenVal };
    }
  }
  return null;
}

// 2. 自動偵測任何前綴之 Neon / Vercel Postgres 連線字串 (postgres:// 或 postgresql://)
function resolvePgConnectionString() {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.STORAGE_URL,
    process.env.STORAGE_DATABASE_URL,
    process.env.KV_URL
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && (c.startsWith('postgres://') || c.startsWith('postgresql://'))) {
      return c;
    }
  }
  for (const [, v] of Object.entries(process.env || {})) {
    if (typeof v === 'string' && (v.startsWith('postgres://') || v.startsWith('postgresql://'))) {
      return v;
    }
  }
  return '';
}

const kvConfig = resolveKvConfig();
const kvClient = kvConfig ? createClient(kvConfig) : null;

const pgConnStr = resolvePgConnectionString();
let pgPool = null;
let pgTableReady = false;

function getPgPool() {
  if (!pgConnStr) return null;
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: pgConnStr,
      ssl: { rejectUnauthorized: false },
      max: 3
    });
  }
  return pgPool;
}

async function ensurePgTable() {
  const pool = getPgPool();
  if (!pool) return null;
  if (!pgTableReady) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rad_mtg_kv_store (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    pgTableReady = true;
  }
  return pool;
}

const dataDir = path.join(process.cwd(), 'data');
const tmpDataDir = path.join(os.tmpdir(), 'rad_mtg_data');
if (!globalThis.__RAD_MTG_MEM_DB__) {
  globalThis.__RAD_MTG_MEM_DB__ = {};
}

export const initialSettings = {
  hospitalName: '新樓基督教醫院',
  departmentName: '影像醫學科',
  systemTitle: '新樓醫院 影像醫學科會議整合系統',
  geminiApiKey: '',
  googleSheetWebhookUrl: '',
  autoSyncGoogleSheet: false,
  lastSyncedAt: null,
  surveySystemUrl: 'https://survey-app-six-lyart.vercel.app/',
  surveySystemTitle: '影像醫學科問卷調查系統',
  powerBiEmbedUrl: '',
  powerBiPushUrl: '',
  meetingCategories: [
    { id: 'dept', name: '科務會議 / 行政會議', shortName: '科務會議', color: '#2563eb', badgeBg: '#dbeafe', templateType: 'dept' },
    { id: 'ccc', name: '教學會議 / CCC（臨床能力委員會）會議', shortName: '教學暨CCC會議', color: '#7c3aed', badgeBg: '#ede9fe', templateType: 'ccc' },
    { id: 'qa', name: '品保會議（CT 暨乳房品保、MRI 品保等）', shortName: '品保會議', color: '#059669', badgeBg: '#d1fae5', templateType: 'qa' },
    { id: 'rad', name: '輻射防護（輻防）會議', shortName: '輻防會議', color: '#d97706', badgeBg: '#fef3c7', templateType: 'rad' },
    { id: 'safety', name: '病安案例討論 / 跨領域會議 / 學術晨會', shortName: '病安與跨領域會議', color: '#dc2626', badgeBg: '#fee2e2', templateType: 'safety' },
    { id: 'other', name: '其它會議（自訂專題／臨時／跨科會議）', shortName: '其它會議', color: '#0891b2', badgeBg: '#cffafe', templateType: 'other' }
  ],
  availableGroups: [
    '主管/行政',
    '一般科會',
    '教學/臨床教師',
    '品保會議',
    '跨領域會議'
  ]
};

export const initialAdminUsers = {
  manager: {
    username: 'x7260',
    password: 'x7260',
    name: '科主任 (x7260)',
    roleLabel: '主任 (最高檢視與最終簽核)'
  },
  deputy: {
    username: 'x3137a',
    password: 'x3137a',
    name: '副組長 / 紀錄人 (x3137a)',
    roleLabel: '副組長 / 會議主席與紀錄人'
  },
  maintainer: {
    username: 'x3137',
    password: 'straygene',
    name: '潘俊儒 (x3137)',
    roleLabel: '系統維護人員 (最高管理權限)'
  }
};

export const initialStaff = [
  { id: 'S01', code: '4813', name: '許志賢', title: '影像醫學科主任醫師', role: 'director', groups: ['主管/行政', '一般科會', '品保會議', '跨領域會議'], status: '在職', note: '科主任 / 品保會議主席' },
  { id: 'S03', code: '7260', name: '林宜蓁', title: '技術主任', role: 'chair', groups: ['主管/行政', '一般科會', '教學/臨床教師', '品保會議', '跨領域會議'], status: '在職', note: '技術主任 / 教學暨CCC會議主席' },
  { id: 'S02', code: '3113', name: '鄭義成', title: '技術副主任', role: 'chair', groups: ['主管/行政', '一般科會', '品保會議', '跨領域會議'], status: '在職', note: '技術副主任' },
  { id: 'S25', code: '3111', name: '蘇雅敏', title: '書記', role: 'staff', groups: ['一般科會'], status: '在職', note: '書記' },
  { id: 'S09', code: '3117', name: '楊蕙芳', title: '醫事放射師', role: 'staff', groups: ['一般科會', '教學/臨床教師', '品保會議'], status: '在職', note: '乳房攝影品保暨臨床教師' },
  { id: 'S04', code: '3119', name: '黃玉青', title: '醫事放射師', role: 'staff', groups: ['一般科會', '品保會議'], status: '在職', note: '乳房品保小組成員' },
  { id: 'S05', code: '3127', name: '洪浩泰', title: '醫事放射師', role: 'staff', groups: ['一般科會', '品保會議'], status: '在職', note: 'CT/MRI品保成員' },
  { id: 'S06', code: '3128', name: '高瑞隆', title: '醫事放射師', role: 'staff', groups: ['一般科會', '教學/臨床教師', '品保會議'], status: '在職', note: '臨床指導教師 / CT評核導師' },
  { id: 'S26', code: '3133', name: '張俐華', title: '書記', role: 'staff', groups: ['一般科會'], status: '在職', note: '書記' },
  { id: 'S07', code: '3137', name: '潘俊儒', title: '醫事放射師', role: 'recorder', groups: ['一般科會', '教學/臨床教師', '品保會議', '跨領域會議'], status: '在職', note: '115年實習生副導師 / 系統管理員' },
  { id: 'S08', code: '3138', name: '林彥呈', title: '醫事放射師', role: 'staff', groups: ['一般科會', '品保會議'], status: '在職', note: 'CT暨特殊攝影組' },
  { id: 'S10', code: '3145', name: '余姿樺', title: '醫事放射師', role: 'recorder', groups: ['一般科會', '教學/臨床教師', '品保會議'], status: '在職', note: '教學會議紀錄人 / 臨床教師' },
  { id: 'S11', code: '3149', name: '陳憶頡', title: '醫事放射師', role: 'recorder', groups: ['一般科會', '教學/臨床教師', '品保會議'], status: '在職', note: '115年實習生導師 / 教學會議紀錄人' },
  { id: 'S12', code: '3150', name: '吳俊霖', title: '醫事放射師', role: 'staff', groups: ['一般科會', '品保會議'], status: '在職', note: 'CT暨MRI組' },
  { id: 'S27', code: '3168', name: '伍容君', title: '護理師', role: 'staff', groups: ['一般科會'], status: '在職', note: '護理師' },
  { id: 'S13', code: '3175', name: '胡政安', title: '醫事放射師', role: 'staff', groups: ['一般科會', '品保會議'], status: '在職', note: 'CT品保成員' },
  { id: 'S14', code: '3193', name: '陳怡伸', title: '醫事放射師', role: 'staff', groups: ['一般科會', '品保會議'], status: '在職', note: '一般暨特殊攝影組' },
  { id: 'S15', code: '3194', name: '林宜萱', title: '醫事放射師', role: 'staff', groups: ['一般科會'], status: '在職', note: '一般暨乳房攝影組' },
  { id: 'S16', code: '3233', name: '呂宗潤', title: '醫事放射師', role: 'staff', groups: ['一般科會'], status: '在職', note: '一般暨CT攝影組' },
  { id: 'S28', code: '3242', name: '王采屏', title: '醫事放射師', role: 'staff', groups: ['一般科會'], status: '在職', note: '醫事放射師' },
  { id: 'S29', code: '3243', name: '洪字淳', title: '醫事放射師', role: 'staff', groups: ['一般科會'], status: '在職', note: '醫事放射師' },
  { id: 'S30', code: '5428', name: '張惠鳳', title: '護理師', role: 'staff', groups: ['一般科會'], status: '在職', note: '護理師' }
];

const QA_18_ATTENDEES = [
  '許志賢', '陳憶頡', '鄭義成', '吳俊霖', '林宜蓁', '胡政安',
  '黃玉青', '吳思霈', '洪浩泰', '黃品睿', '高瑞隆', '施詠勛',
  '陳怡伸', '潘俊儒', '林彥呈', '楊貽婷', '楊蕙芳', '余姿樺'
];

function buildHistoricalSignatures(names, dateStr) {
  const map = {};
  names.forEach((n, idx) => {
    map[n] = {
      staffId: n,
      name: n,
      method: idx === 0 ? '主席簽核發布' : '手機已閱簽認',
      signedAt: `${dateStr}T10:${String(10 + (idx % 45)).padStart(2, '0')}:00+08:00`,
      comment: '已詳閱並歸檔備查',
      signatureDataUrl: null
    };
  });
  return map;
}

export const initialMeetings = [
  {
    id: 'MTG-115-CCC-01',
    title: '115 年新樓醫院醫事放射師 第一次教學會議紀錄',
    category: 'ccc',
    date: '2026-02-05',
    time: '15:30',
    rocYear: '115',
    displayDate: '115 年 2 月 5 日(星期三) 下午 3 時 30 分',
    location: '影像醫學科 教學辦公室',
    chair: '林宜蓁',
    recorder: '陳憶頡，余姿樺',
    status: 'published', // draft | pending_chair | pending_director | published
    isArchived: false,
    reopenedForStaff: [],
    targetGroups: ['一般科會', '教學/臨床教師'],
    expectedCount: 20,
    presentStaffNames: [
      '林宜蓁', '鄭義成', '高瑞隆', '潘俊儒', '陳憶頡', '余姿樺',
      '黃玉青', '洪浩泰', '林彥呈', '楊蕙芳', '吳俊霖', '胡政安',
      '陳怡伸', '林宜萱', '呂宗潤', '施詠勛', '吳思霈', '黃品睿'
    ],
    leaveStaffNames: ['許志賢', '楊貽婷'],
    agendaItems: [
      '1. 實習生相關事項討論',
      '2. 新增評量方式 EPA(試行版) 可信賴專業活動評估 (Entrustable Professional Activity)',
      '3. 其他行政與導師津貼事項',
      '4. PGY 第二次評 EPA（臨床能力委員會 CCC 評核討論）'
    ],
    discussionSections: [
      {
        heading: '1. 實習生相關事項討論',
        bullets: [
          '115 年共收 2 位樹人實習生：葉采誼、賴思涵。',
          '115 年導師：陳憶頡，副導師：潘俊儒。',
          '實習期間為 2/23~9/4 共 28 周。國定假日：2/27、4/3、4/6、5/1、6/19。',
          '奇美核醫實習期間：4/6~4/10，兩位學生同一梯次。',
          '放腫實習期間：3/9~4/3，兩位學生同一梯次。',
          '核醫實習期間：4/13 – 5/1；5/4 - 5/22，分兩梯次在本院 B2 核醫科。',
          '實習生在放腫科、核醫科時，請每周三的下午 15:00 讓實習生回到影醫科上基礎課程，課程結束後視情況是否留在影醫科書寫教育訓練紀錄表還是回該外單位。',
          '請假補班方式：病假不補班；事假大於三天以上需在請假的該站補班，預計利用實習最後一周加強補強時段 (8/31~9/4)，小於三天將安排周六於影醫科補班。'
        ]
      },
      {
        heading: '2. 新增評量方式 EPA (試行版) 可信賴專業活動評估 (Entrustable Professional Activity)',
        bullets: [
          '今年 EPA 護照尚未正式實行，還是使用原本試行版的方式進行評分，建議大家踴躍使用。',
          '影醫科在使用 EPA 評分時，有些項目導師共識沒有一致性導致評分標準有落差，影醫科有討論每個檢查細項學員該做到哪些程度、哪些標準即可獲得分數，使導師評分可以較為一致。',
          '實習生 EPA 維持紙本評分。'
        ]
      },
      {
        heading: '3. 其他',
        bullets: [
          '放腫科因時間為 3/9~4/3，有跨月，因此導師津貼分兩個月送。'
        ]
      },
      {
        heading: '4. PGY 第二次評 EPA（CCC 臨床能力評核決議）',
        bullets: [
          '【黃品睿】電腦斷層已完訓，評核結果：信賴等級 LEVEL4。',
          '【吳思霈】電腦斷層：異常事件處理較沒經驗，但基本操作沒問題。有提醒異常事件發生時該如何處理，會以信賴等級 LEVEL4 完成度來做後續檢查。評核結果：信賴等級 LEVEL4。',
          '【吳思霈】Mammo (乳房攝影)：與病患應對流暢，一般常規擺位小細節都有注意到，照出來的影像品質不錯。只是剛好患者乳房開過刀，患側的擺位需加強，需要知道擺位或是調整劑量來補足。對於異常的事件較為不熟悉，但其他都表現得很好。評核結果：信賴等級 LEVEL4。',
          '【施詠勛】電腦斷層 (受訓中，為 PGY2)：評核導師為高瑞隆放射師。評核結果：信賴等級 LEVEL3b。（潘俊儒放射師補充：有問題都會提問，問完執行程度也都能達到需要的程度，也不常聽到有做錯的時候，所以會評核：信賴等級 LEVEL3c，因經驗會比其他學員來的多。）',
          '【施詠勛】一般診斷攝影：評核結果：信賴等級 LEVEL3c。'
        ]
      }
    ],
    resolutions: [
      '通過 115 年度樹人醫專實習生（葉采誼、賴思涵）28 週實習排程與跨科輪訓計畫。',
      '確立本科 EPA 試行版各檢查細項評分共識基準，實習生維持紙本評分。',
      '核定 PGY 學員第二次 EPA 信賴等級：黃品睿 (CT: LEVEL4)、吳思霈 (CT: LEVEL4 / Mammo: LEVEL4)、施詠勛 (CT: LEVEL3b~3c / 一般攝影: LEVEL3c)。'
    ],
    actionItems: [
      { id: 'ACT-101', task: '完成 115 年樹人實習生外單位（奇美核醫、放腫、本院核醫）輪訓排程與每週三返科上課通知', assignee: '陳憶頡、潘俊儒', dueDate: '2026-02-23', status: '已完成' },
      { id: 'ACT-102', task: '放腫科跨月（3/9~4/3）臨床指導教師津貼分兩個月呈報', assignee: '余姿樺', dueDate: '2026-04-10', status: '已完成' },
      { id: 'ACT-103', task: '持續追蹤 PGY 吳思霈乳房開刀患側擺位技巧與異常事件應變訓練', assignee: '高瑞隆、楊蕙芳', dueDate: '2026-11-15', status: '進行中' },
      { id: 'ACT-104', task: '彙整科內各檢查站 EPA 評分細項標準共識表供全體臨床教師參考', assignee: '林宜蓁、潘俊儒', dueDate: '2026-11-30', status: '進行中' }
    ],
    attachments: [
      { id: 'ATT-1', title: 'EPA表單示意 (第一頁)', url: '/uploads/meetings/epa_form_1.png', category: 'EPA表單示意' },
      { id: 'ATT-2', title: 'EPA表單示意 (第二頁)', url: '/uploads/meetings/epa_form_2.png', category: 'EPA表單示意' },
      { id: 'ATT-3', title: '教學會議現場照片 (1)', url: '/uploads/meetings/ccc_photo_1.jpg', category: '會議紀錄照片' },
      { id: 'ATT-4', title: '教學會議現場照片 (2)', url: '/uploads/meetings/ccc_photo_2.jpg', category: '會議紀錄照片' },
      { id: 'ATT-5', title: '教學會議現場照片 (3)', url: '/uploads/meetings/ccc_photo_3.jpg', category: '會議紀錄照片' },
      { id: 'ATT-6', title: '教學會議現場照片 (4)', url: '/uploads/meetings/ccc_photo_4.jpg', category: '會議紀錄照片' }
    ],
    approvalChain: {
      recorderSubmittedBy: '陳憶頡，余姿樺',
      recorderSubmittedAt: '2026-02-05T17:15:00+08:00',
      chairApprovedBy: '林宜蓁 技術主任',
      chairApprovedAt: '2026-02-06T09:20:00+08:00',
      directorApprovedBy: '許志賢 科主任',
      directorApprovedAt: '2026-02-06T14:00:00+08:00'
    },
    signatures: {
      '林宜蓁': { staffId: 'S03', name: '林宜蓁', method: '會議主席簽核', signedAt: '2026-02-06T09:20:00+08:00', comment: '內容詳實，予以核備', signatureDataUrl: null },
      '陳憶頡': { staffId: 'S11', name: '陳憶頡', method: '紀錄人簽認', signedAt: '2026-02-05T17:15:00+08:00', comment: '紀錄整理完成', signatureDataUrl: null },
      '余姿樺': { staffId: 'S10', name: '余姿樺', method: '紀錄人簽認', signedAt: '2026-02-05T17:16:00+08:00', comment: '已確認紀錄內容', signatureDataUrl: null },
      '潘俊儒': { staffId: 'S07', name: '潘俊儒', method: '手機已閱簽認', signedAt: '2026-02-06T15:10:00+08:00', comment: '已閱，配合辦理實習生副導師與EPA共識作業', signatureDataUrl: null },
      '高瑞隆': { staffId: 'S06', name: '高瑞隆', method: '手機已閱簽認', signedAt: '2026-02-06T16:05:00+08:00', comment: '已閱', signatureDataUrl: null },
      '鄭義成': { staffId: 'S02', name: '鄭義成', method: '手機已閱簽認', signedAt: '2026-02-06T16:40:00+08:00', comment: '已閱', signatureDataUrl: null },
      '黃品睿': { staffId: 'S20', name: '黃品睿', method: '手機已閱簽認', signedAt: '2026-02-07T08:30:00+08:00', comment: '已閱，謝謝老師指導', signatureDataUrl: null },
      '吳思霈': { staffId: 'S19', name: '吳思霈', method: '手機已閱簽認', signedAt: '2026-02-07T09:12:00+08:00', comment: '已閱，會加強乳房開刀患側擺位與異常處理', signatureDataUrl: null },
      '施詠勛': { staffId: 'S18', name: '施詠勛', method: '手機已閱簽認', signedAt: '2026-02-07T10:00:00+08:00', comment: '已閱', signatureDataUrl: null }
    },
    rawTranscript: '主席林宜蓁：各位同仁午安，今天我們召開115年第一次教學會議暨CCC臨床能力委員會...',
    createdAt: '2026-02-05T16:30:00+08:00'
  },
  {
    id: 'MTG-115-QA-01',
    title: '115年電腦斷層暨乳房攝影儀輻射醫療曝露品保會議紀錄',
    category: 'qa',
    date: '2026-06-30',
    time: '08:00',
    rocYear: '115',
    displayDate: '115 年 6 月 30 日 08 時 00 分',
    location: '影像醫學科 會議室',
    chair: '許志賢醫師',
    recorder: '潘俊儒，陳憶頡',
    status: 'published',
    isArchived: false,
    reopenedForStaff: [],
    targetGroups: ['一般科會', '品保會議'],
    expectedCount: 17,
    presentStaffNames: [
      '許志賢', '陳憶頡', '鄭義成', '吳俊霖', '林宜蓁', '胡政安',
      '黃玉青', '吳思霈', '洪浩泰', '黃品睿', '高瑞隆', '陳怡伸',
      '潘俊儒', '林彥呈', '楊貽婷', '楊蕙芳', '余姿樺'
    ],
    leaveStaffNames: [],
    agendaItems: [
      '1. 年度輻射防護訓練課程與 CT 非年度品保課程執行成果報告',
      '2. CT 年度品保檢測與移動型/急診 X 光機執照更新進度',
      '3. 品保人員組織異動與新進人員資格訓練追蹤',
      '4. 數位乳房 X 光攝影儀年度/非年度品保校驗紀錄與公文備查'
    ],
    discussionSections: [
      {
        heading: '1. 輻射防護與 CT 品保訓練執行成果',
        bullets: [
          '今年 10/21 舉辦年度輻射防護 3 小時訓練課程，已順利完成，謝謝各位放射師踴躍參與。',
          '完成每年度於科內舉辦 CT 非年度品保課程，謝謝放射師踴躍參加。',
          '今年的 CT 年度品保已執行檢測完成，各項指標均符合法規標準。'
        ]
      },
      {
        heading: '2. 設備執照更新與品保人員組織異動',
        bullets: [
          '急診 X 光機五年執照已更新；移動型 X 光機 (MUX-100H) 換照作業持續依期程辦理。',
          '新進人員吳思霈請自行取得「電腦斷層掃描儀醫療曝露品質保證專業人員」訓練課程證明，方可加入品保人員組織並執行 CT 非年度品保。',
          '人員異動：離職放射師黃廉勳將於品保人員組織中刪除；離職放射師李姿瑩發文登銷已收到回文，相關公文已留存科內乳房攝影品保資料備檔。'
        ]
      },
      {
        heading: '3. 數位乳房攝影儀醫療曝露品質保證成效追蹤',
        bullets: [
          '非年度乳房攝影醫療曝露品保作業課程執行成效追蹤報告：相關授課文件皆存放於乳房攝影品保資料中保存。',
          '數位乳房 X 光攝影儀所需執行之每週、每季、每半年及每年所需執行之品保校驗紀錄，皆完整存放於乳房攝影品保資料夾。',
          '年度乳房攝影醫療曝露品質保證實作：上鉅工程師已完成乳房攝影年度品保，相關檢測資料報告已留存科內乳房攝影品保資料中備檔。',
          '下次開會時間預計於明年 6 月，確定日期另議。'
        ]
      }
    ],
    resolutions: [
      '核備本年度 CT 暨數位乳房攝影儀年度與非年度醫療曝露品保檢測報告。',
      '通過品保人員組織異動名單（刪除離職人員，並請新進人員吳思霈完成 CT 品保專業訓練後納編）。',
      '所有品保校驗紀錄與換照公文統一歸檔於科內品保專卷備查。'
    ],
    actionItems: [
      { id: 'ACT-201', task: '新進人員吳思霈取得「電腦斷層掃描儀醫療曝露品質專業人員」訓練課程學分證明並加入品保組織', assignee: '吳思霈', dueDate: '2026-12-15', status: '進行中' },
      { id: 'ACT-202', task: '更新 CT 暨乳房攝影品保人員組織表（移除離職人員並歸檔登銷回文）', assignee: '陳憶頡', dueDate: '2026-07-15', status: '已完成' },
      { id: 'ACT-203', task: '定期查核每週/每季數位乳房 X 光攝影儀品保校驗紀錄完整性', assignee: '黃玉青、楊蕙芳', dueDate: '2026-12-31', status: '進行中' }
    ],
    attachments: [],
    approvalChain: {
      recorderSubmittedBy: '潘俊儒，陳憶頡',
      recorderSubmittedAt: '2026-06-30T10:00:00+08:00',
      chairApprovedBy: '許志賢 醫師',
      chairApprovedAt: '2026-06-30T14:30:00+08:00',
      directorApprovedBy: '許志賢 醫師',
      directorApprovedAt: '2026-06-30T14:35:00+08:00'
    },
    signatures: {
      '許志賢': { staffId: 'S01', name: '許志賢', method: '主任簽核發布', signedAt: '2026-06-30T14:35:00+08:00', comment: '准予核備', signatureDataUrl: null },
      '鄭義成': { staffId: 'S02', name: '鄭義成', method: '手機已閱簽認', signedAt: '2026-06-30T15:12:00+08:00', comment: '已閱', signatureDataUrl: null },
      '林宜蓁': { staffId: 'S03', name: '林宜蓁', method: '手機已閱簽認', signedAt: '2026-06-30T15:20:00+08:00', comment: '已閱', signatureDataUrl: null },
      '陳憶頡': { staffId: 'S11', name: '陳憶頡', method: '紀錄人簽認', signedAt: '2026-06-30T10:05:00+08:00', comment: '已確認', signatureDataUrl: null },
      '黃玉青': { staffId: 'S04', name: '黃玉青', method: '手機已閱簽認', signedAt: '2026-07-01T08:40:00+08:00', comment: '已閱', signatureDataUrl: null },
      '洪浩泰': { staffId: 'S05', name: '洪浩泰', method: '手機已閱簽認', signedAt: '2026-07-01T09:10:00+08:00', comment: '已閱', signatureDataUrl: null },
      '高瑞隆': { staffId: 'S06', name: '高瑞隆', method: '手機已閱簽認', signedAt: '2026-07-01T11:25:00+08:00', comment: '已閱', signatureDataUrl: null },
      '吳俊霖': { staffId: 'S12', name: '吳俊霖', method: '手機已閱簽認', signedAt: '2026-07-01T13:05:00+08:00', comment: '已閱', signatureDataUrl: null },
      '楊蕙芳': { staffId: 'S09', name: '楊蕙芳', method: '手機已閱簽認', signedAt: '2026-07-01T14:20:00+08:00', comment: '已閱', signatureDataUrl: null }
    },
    rawTranscript: '許志賢醫師：各位同仁早安，今天召開115年電腦斷層暨乳房攝影儀輻射醫療曝露品保會議...',
    createdAt: '2026-06-30T09:30:00+08:00'
  },
  {
    id: 'MTG-115-DEPT-11',
    title: '115年11月份 影像醫學科科務暨病安品質檢討會議',
    category: 'dept',
    date: '2026-11-03',
    time: '12:30',
    rocYear: '115',
    displayDate: '115 年 11 月 3 日(星期二) 中午 12 時 30 分',
    location: '影像醫學科 大會議室',
    chair: '林宜蓁',
    recorder: '潘俊儒',
    status: 'published', // 設為已發布，讓多數同仁登入首頁時可立即看到「待簽閱」並測試簽完自動移入歷史專區！
    isArchived: false,
    reopenedForStaff: [],
    targetGroups: ['全科人員'],
    expectedCount: 20,
    presentStaffNames: [
      '許志賢', '鄭義成', '林宜蓁', '黃玉青', '洪浩泰', '高瑞隆',
      '潘俊儒', '林彥呈', '楊蕙芳', '余姿樺', '陳憶頡', '吳俊霖',
      '胡政安', '陳怡伸', '林宜萱', '呂宗潤', '楊貽婷', '施詠勛', '吳思霈', '黃品睿'
    ],
    leaveStaffNames: [],
    agendaItems: [
      '1. CT 影像工作站網路化與乳房排檢流程優化成效追蹤（當責 Q10 專案）',
      '2. 導入「影像醫學科行動會議整合系統」推動無紙化簽到、語音轉紀錄與手機線上簽閱',
      '3. 第四季度高階電腦斷層與磁振造影 (MRI) 獨立操作考核進度確認'
    ],
    discussionSections: [
      {
        heading: '1. 當責 Q10 專案與低碳永續具體作為追蹤',
        bullets: [
          'CT 影像工作站網路化改善後，大幅減少傳統操作室往返時間並提升臨床檢查效率。',
          '乳房攝影排檢流程優化與紙張再利用減碳措施持續執行，落實新樓醫院低碳永續目標。'
        ]
      },
      {
        heading: '2. 啟用「影像醫學科會議整合系統」無紙化簽核與歷史紀錄專區機制',
        bullets: [
          '自本（11）月份起，科務會議、教學暨 CCC 會議、品保會議與輻防會議全面整合至線上系統。',
          '同仁於首頁完成「一鍵已閱」或「手寫簽名」後，該會議紀錄即自動歸入「歷史紀錄專區」，首頁僅保留待簽閱項目。'
        ]
      },
      {
        heading: '3. 第四季度人力培訓與授權認證進度',
        bullets: [
          '請各組臨床指導教師於 11 月底前完成第四季度 MRI 磁振造影與高階電腦斷層學員之獨立操作考核與 EPA 評量。'
        ]
      }
    ],
    resolutions: [
      '正式啟用「影像醫學科會議整合系統」，落實會議紀錄數位化、無紙化行動簽核與歷年紀錄歸檔檢索。',
      '請各組於 11/30 前完成 Q4 磁振造影與高階 CT 授權認證考核。'
    ],
    actionItems: [
      { id: 'ACT-301', task: '宣導全科同仁使用手機登入「影像醫學科會議整合系統」完成會議紀錄簽閱', assignee: '潘俊儒', dueDate: '2026-11-10', status: '進行中' },
      { id: 'ACT-302', task: '完成 Q4 磁振造影 (MRI) 與高階電腦斷層獨立操作考核評核', assignee: '高瑞隆、洪浩泰', dueDate: '2026-11-30', status: '未開始' }
    ],
    attachments: [],
    approvalChain: {
      recorderSubmittedBy: '潘俊儒',
      recorderSubmittedAt: '2026-11-03T13:30:00+08:00',
      chairApprovedBy: '林宜蓁 技術主任',
      chairApprovedAt: '2026-11-03T14:15:00+08:00',
      directorApprovedBy: '許志賢 科主任',
      directorApprovedAt: '2026-11-03T14:30:00+08:00'
    },
    signatures: {
      '林宜蓁': { staffId: 'S03', name: '林宜蓁', method: '會議主席覆核', signedAt: '2026-11-03T14:15:00+08:00', comment: '主席覆核通過', signatureDataUrl: null }
    },
    rawTranscript: '主席林宜蓁：各位同仁午安，今天召開11月份科務暨病安品質檢討會議...',
    createdAt: '2026-11-03T13:20:00+08:00'
  },
  // ==================== 預載歷年真實歷史紀錄（114年、113年 CT暨乳房品保會議紀錄） ====================
  {
    id: 'MTG-114-QA-02',
    title: '114年下半年度 電腦斷層暨乳房攝影儀輻射醫療曝露品保會議紀錄',
    category: 'qa',
    date: '2025-12-30',
    time: '08:00',
    rocYear: '114',
    displayDate: '114 年 12 月 30 日 08 時 00 分',
    location: '影像醫學科 會議室',
    chair: '許志賢醫師',
    recorder: '陳憶頡，潘俊儒',
    status: 'published',
    isArchived: true, // 已結案歸檔於歷史紀錄專區
    reopenedForStaff: [],
    targetGroups: ['一般科會', '品保會議'],
    expectedCount: 18,
    presentStaffNames: QA_18_ATTENDEES,
    leaveStaffNames: [],
    agendaItems: [
      '1. 114年度輻射防護 3 小時訓練課程與 CT 年度品保檢測成果',
      '2. GE 高階電腦斷層 (CT) 裝機進度與輻射安全測試追蹤',
      '3. 品保人員異動報告（放射師楊貽婷離職交接）',
      '4. 數位乳房 X 光攝影儀品保校驗紀錄備查'
    ],
    discussionSections: [
      {
        heading: '1. 年度輻防訓練與 CT 年度品保檢測',
        bullets: [
          '今年 9/13 舉辦年度輻射防護 3 小時訓練課程，已順利完成，謝謝各位放射師踴躍參與。',
          '今年的 CT 年度品保已執行檢測完成，各項影像品質與劑量指標均符合規定。'
        ]
      },
      {
        heading: '2. GE 高階 CT 新機裝機進度與人員異動',
        bullets: [
          'GE 高階 CT 已裝機接近尾聲，待輻射安全測試通過後預計於明年初正式上線服務病患。',
          '放射師楊貽婷預計於明年 1/26 離職，屆時依規定辦理品保組織異動與相關交接事宜。'
        ]
      },
      {
        heading: '3. 乳房攝影醫療曝露品保追蹤',
        bullets: [
          '非年度乳房攝影醫療曝露品保作業課程執行成效追蹤報告已完成。',
          '報告數位乳房 X 光攝影儀所需執行之每週、每季、每半年及每年所需執行之品保校驗紀錄，皆完整存放於乳房攝影品保資料備檔。',
          '下次開會時間於明年 6 月第二次科會時間。'
        ]
      }
    ],
    resolutions: [
      '核備 114 年下半年度 CT 暨乳房攝影醫療曝露品保檢測報告。',
      '密切追蹤 GE 高階 CT 輻射安全測試與上線期程。'
    ],
    actionItems: [
      { id: 'ACT-114-21', task: '完成 GE 高階 CT 輻射安全測試申報與臨床上線準備', assignee: '鄭義成、洪浩泰、潘俊儒', dueDate: '2026-01-31', status: '已完成' }
    ],
    attachments: [],
    approvalChain: {
      recorderSubmittedBy: '陳憶頡，潘俊儒',
      recorderSubmittedAt: '2025-12-30T10:00:00+08:00',
      chairApprovedBy: '許志賢 醫師',
      chairApprovedAt: '2025-12-30T14:00:00+08:00',
      directorApprovedBy: '許志賢 醫師',
      directorApprovedAt: '2025-12-30T14:10:00+08:00'
    },
    signatures: buildHistoricalSignatures(QA_18_ATTENDEES, '2025-12-30'),
    rawTranscript: '114年12月30日電腦斷層暨乳房攝影儀輻射醫療曝露品保會議紀錄，包含GE高階CT裝機進度、9/13年度輻防3小時訓練、CT年度品保與乳房品保校驗紀錄。',
    createdAt: '2025-12-30T09:00:00+08:00'
  },
  {
    id: 'MTG-114-QA-01',
    title: '114年上半年度 電腦斷層暨乳房攝影儀輻射醫療曝露品保會議紀錄',
    category: 'qa',
    date: '2025-06-17',
    time: '08:00',
    rocYear: '114',
    displayDate: '114 年 6 月 17 日 08 時 00 分',
    location: '影像醫學科 會議室',
    chair: '許志賢醫師',
    recorder: '陳憶頡，余姿樺',
    status: 'published',
    isArchived: true,
    reopenedForStaff: [],
    targetGroups: ['一般科會', '品保會議'],
    expectedCount: 18,
    presentStaffNames: QA_18_ATTENDEES,
    leaveStaffNames: [],
    agendaItems: [
      '1. 114年度 9/13 實體輻射防護 3 小時訓練課程宣導',
      '2. 急診電腦斷層攝影機更換管球之輻防測試報告',
      '3. 數位乳房攝影儀器更換 ACR 假體與 SOP 修訂報告'
    ],
    discussionSections: [
      {
        heading: '1. 年度輻射防護訓練與急診 CT 換管球輻防測試',
        bullets: [
          '今年將於 9/13 舉辦年度輻射防護 3 小時訓練課程，今年為實體課程，請各位放射師踴躍參與。',
          '06/09 急診電腦斷層攝影機已完成更換管球之輻射防護與品保測試，結果均正常合格。'
        ]
      },
      {
        heading: '2. 數位乳房攝影儀更換 ACR 假體與 SOP 更新',
        bullets: [
          '報告數位乳房 X 光攝影儀所需執行之每週、每季、每半年及每年所需執行之品保校驗紀錄皆存放於乳房攝影品保資料。',
          '數位乳房攝影儀器因法規規定更換新版 ACR 假體以及部分品保相關內容變動，已重新制定並更新相關標準作業流程 (SOP)，目前皆已正常運行中。',
          '下次開會時間於今年 12 月之第二次科會時間。'
        ]
      }
    ],
    resolutions: [
      '通過急診 CT 更換管球後之輻防測試報告與數位乳房攝影新版 ACR 假體品保 SOP。'
    ],
    actionItems: [
      { id: 'ACT-114-11', task: '落實數位乳房攝影儀新版 ACR 假體每週品保校驗 SOP', assignee: '黃玉青、楊蕙芳', dueDate: '2025-07-15', status: '已完成' }
    ],
    attachments: [],
    approvalChain: {
      recorderSubmittedBy: '陳憶頡，余姿樺',
      recorderSubmittedAt: '2025-06-17T10:00:00+08:00',
      chairApprovedBy: '許志賢 醫師',
      chairApprovedAt: '2025-06-17T13:30:00+08:00',
      directorApprovedBy: '許志賢 醫師',
      directorApprovedAt: '2025-06-17T13:45:00+08:00'
    },
    signatures: buildHistoricalSignatures(QA_18_ATTENDEES, '2025-06-17'),
    rawTranscript: '114年06月17日電腦斷層暨乳房攝影品保會議：06/09急診CT完成換管球輻防測試、數位乳房攝影更換ACR假體並更新SOP。',
    createdAt: '2025-06-17T09:00:00+08:00'
  },
  {
    id: 'MTG-113-QA-02',
    title: '113年下半年度 電腦斷層暨乳房攝影儀輻射醫療曝露品保會議紀錄',
    category: 'qa',
    date: '2024-12-31',
    time: '08:00',
    rocYear: '113',
    displayDate: '113 年 12 月 31 日 08 時 00 分',
    location: '影像醫學科 會議室',
    chair: '許志賢醫師',
    recorder: '陳憶頡',
    status: 'published',
    isArchived: true,
    reopenedForStaff: [],
    targetGroups: ['一般科會', '品保會議'],
    expectedCount: 18,
    presentStaffNames: QA_18_ATTENDEES,
    leaveStaffNames: [],
    agendaItems: [
      '1. 113年度輻射防護 3 小時訓練與 CT 年度品保檢測成果',
      '2. 放射師吳思霈取得乳房攝影師資格納編報告',
      '3. 113年乳房攝影醫療曝露品保作業課程成效追蹤'
    ],
    discussionSections: [
      {
        heading: '1. 年度輻防訓練、CT 品保與乳攝資格取得',
        bullets: [
          '今年 9/21 舉辦年度輻射防護 3 小時訓練課程，已順利完成，謝謝各位放射師踴躍參與。',
          '今年的 CT 年度品保已執行檢測完成。',
          '放射師吳思霈已順利取得乳房攝影師資格，正式加入乳房攝影臨床與品保團隊。'
        ]
      },
      {
        heading: '2. 數位乳房攝影品保校驗紀錄備查',
        bullets: [
          '113 年非年度乳房攝影醫療曝露品保作業課程執行成效追蹤報告完成。',
          '報告數位乳房 X 光攝影儀所需執行之每週、每季、每半年及每年所需執行之品保校驗紀錄皆存放於乳房攝影品保資料。',
          '上鉅工程師已完成乳房攝影年度品保，相關檢測資料報告已留存科內乳房攝影品保資料中備檔。'
        ]
      }
    ],
    resolutions: [
      '核備 113 年度 CT 暨乳房攝影醫療曝露品保報告，並祝賀吳思霈放射師取得乳攝資格。'
    ],
    actionItems: [],
    attachments: [],
    approvalChain: {
      recorderSubmittedBy: '陳憶頡',
      recorderSubmittedAt: '2024-12-31T10:00:00+08:00',
      chairApprovedBy: '許志賢 醫師',
      chairApprovedAt: '2024-12-31T14:00:00+08:00',
      directorApprovedBy: '許志賢 醫師',
      directorApprovedAt: '2024-12-31T14:10:00+08:00'
    },
    signatures: buildHistoricalSignatures(QA_18_ATTENDEES, '2024-12-31'),
    rawTranscript: '113年12月31日電腦斷層暨乳房攝影品保會議：9/21輻防訓練完成、CT年度品保完成、放射師吳思霈取得乳攝師資格。',
    createdAt: '2024-12-31T09:00:00+08:00'
  }
];

const defaultData = {
  'admin_users.json': initialAdminUsers,
  'settings.json': initialSettings,
  'staff.json': initialStaff,
  'meetings.json': initialMeetings,
  'login_records.json': {}
};

function ensureHistoricalMeetingsMigrated(existingMeetings) {
  if (!Array.isArray(existingMeetings)) return initialMeetings;
  let updated = false;
  const result = [...existingMeetings];

  initialMeetings.forEach((initMtg) => {
    const foundIdx = result.findIndex((m) => m.id === initMtg.id);
    if (foundIdx === -1) {
      result.push(initMtg);
      updated = true;
    } else if (result[foundIdx].isArchived === undefined) {
      result[foundIdx].isArchived = Boolean(initMtg.isArchived);
      result[foundIdx].rocYear = initMtg.rocYear || String(( parseInt((result[foundIdx].date || '2026').slice(0, 4), 10) || 2026 ) - 1911);
      updated = true;
    }
  });

  return { meetings: result, updated };
}

function ensureSettingsMigrated(existingSettings) {
  if (!existingSettings || typeof existingSettings !== 'object') {
    return { settings: initialSettings, updated: true };
  }
  const result = { ...existingSettings };
  let updated = false;
  if (!Array.isArray(result.meetingCategories)) {
    result.meetingCategories = initialSettings.meetingCategories;
    updated = true;
  } else if (!result.meetingCategories.some((c) => c.id === 'other')) {
    result.meetingCategories = [
      ...result.meetingCategories,
      { id: 'other', name: '其它會議（自訂專題／臨時／跨科會議）', shortName: '其它會議', color: '#0891b2', badgeBg: '#cffafe', templateType: 'other' }
    ];
    updated = true;
  }
  return { settings: result, updated };
}

const LEGACY_STAFF_CODES = new Set([
  'x7260', 'x3137',
  'R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08',
  'R09', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15'
]);

const REMOVED_LEGACY_STAFF_NAMES = new Set([
  '楊貽婷', '施詠勛', '吳思霈', '黃品睿', '葉采誼', '賴思涵', '黃廉勳', '李姿瑩'
]);

function ensureStaffMigrated(existingStaff) {
  if (!Array.isArray(existingStaff)) {
    return { staff: initialStaff, updated: true };
  }
  let updated = false;
  let result = existingStaff
    .filter((s) => {
      if (REMOVED_LEGACY_STAFF_NAMES.has(s.name)) {
        updated = true;
        return false;
      }
      return true;
    })
    .map((s) => ({ ...s }));

  initialStaff.forEach((initMember) => {
    const foundIdx = result.findIndex((s) => s.name === initMember.name || s.id === initMember.id);
    if (foundIdx === -1) {
      result.push({ ...initMember });
      updated = true;
    } else {
      const currentCode = String(result[foundIdx].code || '').trim();
      if (
        (!currentCode || LEGACY_STAFF_CODES.has(currentCode)) &&
        currentCode !== initMember.code
      ) {
        result[foundIdx].code = initMember.code;
        updated = true;
      }
      if (result[foundIdx].title !== initMember.title) {
        result[foundIdx].title = initMember.title;
        result[foundIdx].note = initMember.note;
        updated = true;
      }
    }
  });

  return { staff: result, updated };
}

function safeWriteLocalOrTmp(filename, data) {
  globalThis.__RAD_MTG_MEM_DB__[filename] = data;
  const jsonStr = JSON.stringify(data, null, 2);
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(path.join(dataDir, filename), jsonStr, 'utf-8');
    return;
  } catch {
    // Vercel serverless Read-Only filesystem (/var/task) fallback to /tmp
    try {
      if (!fs.existsSync(tmpDataDir)) {
        fs.mkdirSync(tmpDataDir, { recursive: true });
      }
      fs.writeFileSync(path.join(tmpDataDir, filename), jsonStr, 'utf-8');
    } catch {}
  }
}

// 若本機環境沒有 data 資料夾與初始檔案，自動建立與升級
if (!kvClient) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    Object.entries(defaultData).forEach(([filename, defaultContent]) => {
      const filePath = path.join(dataDir, filename);
      if (!fs.existsSync(filePath)) {
        safeWriteLocalOrTmp(filename, defaultContent);
      } else if (filename === 'meetings.json') {
        try {
          const current = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const { meetings: migrated, updated } = ensureHistoricalMeetingsMigrated(current);
          if (updated) {
            safeWriteLocalOrTmp(filename, migrated);
          }
        } catch {}
      } else if (filename === 'settings.json') {
        try {
          const current = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const { settings: migrated, updated } = ensureSettingsMigrated(current);
          if (updated) {
            safeWriteLocalOrTmp(filename, migrated);
          }
        } catch {}
      } else if (filename === 'staff.json') {
        try {
          const current = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const { staff: migrated, updated } = ensureStaffMigrated(current);
          if (updated) {
            safeWriteLocalOrTmp(filename, migrated);
          }
        } catch {}
      }
    });
  } catch {}
}

export const db = {
  getStorageMode() {
    if (kvClient) return 'vercel-kv';
    if (pgConnStr) return 'neon-postgres';
    return 'local-or-tmp';
  },

  async read(filename) {
    const key = `rad_mtg_${filename}`;
    if (kvClient) {
      try {
        let data = await kvClient.get(key);
        if (data === null || data === undefined) {
          const initial = defaultData[filename] || null;
          if (initial) await kvClient.set(key, initial);
          return initial;
        }
        if (filename === 'meetings.json') {
          const { meetings: migrated, updated } = ensureHistoricalMeetingsMigrated(data);
          if (updated) await kvClient.set(key, migrated);
          return migrated;
        }
        if (filename === 'settings.json') {
          const { settings: migrated, updated } = ensureSettingsMigrated(data);
          if (updated) await kvClient.set(key, migrated);
          return migrated;
        }
        if (filename === 'staff.json') {
          const { staff: migrated, updated } = ensureStaffMigrated(data);
          if (updated) await kvClient.set(key, migrated);
          return migrated;
        }
        return data;
      } catch (error) {
        console.error('KV Read Error:', error);
        return globalThis.__RAD_MTG_MEM_DB__[filename] || defaultData[filename] || null;
      }
    } else if (pgConnStr) {
      try {
        const pool = await ensurePgTable();
        const res = await pool.query('SELECT value FROM rad_mtg_kv_store WHERE key = $1', [key]);
        let data = res.rows.length > 0 ? res.rows[0].value : null;
        if (data === null || data === undefined) {
          const initial = defaultData[filename] || null;
          if (initial !== null) {
            await pool.query(
              `INSERT INTO rad_mtg_kv_store (key, value, updated_at)
               VALUES ($1, $2::jsonb, NOW())
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
              [key, JSON.stringify(initial)]
            );
          }
          return initial;
        }
        if (filename === 'meetings.json') {
          const { meetings: migrated, updated } = ensureHistoricalMeetingsMigrated(data);
          if (updated) {
            await pool.query(
              `INSERT INTO rad_mtg_kv_store (key, value, updated_at)
               VALUES ($1, $2::jsonb, NOW())
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
              [key, JSON.stringify(migrated)]
            );
          }
          return migrated;
        }
        if (filename === 'settings.json') {
          const { settings: migrated, updated } = ensureSettingsMigrated(data);
          if (updated) {
            await pool.query(
              `INSERT INTO rad_mtg_kv_store (key, value, updated_at)
               VALUES ($1, $2::jsonb, NOW())
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
              [key, JSON.stringify(migrated)]
            );
          }
          return migrated;
        }
        if (filename === 'staff.json') {
          const { staff: migrated, updated } = ensureStaffMigrated(data);
          if (updated) {
            await pool.query(
              `INSERT INTO rad_mtg_kv_store (key, value, updated_at)
               VALUES ($1, $2::jsonb, NOW())
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
              [key, JSON.stringify(migrated)]
            );
          }
          return migrated;
        }
        return data;
      } catch (error) {
        console.error('PG Read Error:', error);
        return globalThis.__RAD_MTG_MEM_DB__[filename] || defaultData[filename] || null;
      }
    } else {
      // 1. 優先檢查 /tmp 暫存寫入區（支援未掛載 KV 之 Vercel 雲端環境）
      const tmpFilePath = path.join(tmpDataDir, filename);
      if (fs.existsSync(tmpFilePath)) {
        try {
          const parsedTmp = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
          globalThis.__RAD_MTG_MEM_DB__[filename] = parsedTmp;
          return parsedTmp;
        } catch {}
      }
      if (globalThis.__RAD_MTG_MEM_DB__[filename]) {
        return globalThis.__RAD_MTG_MEM_DB__[filename];
      }

      // 2. 讀取專案 data/ 目錄
      const filePath = path.join(dataDir, filename);
      if (!fs.existsSync(filePath)) {
        const initial = defaultData[filename] || null;
        if (initial !== null) {
          safeWriteLocalOrTmp(filename, initial);
        }
        return initial;
      }
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (filename === 'meetings.json') {
          const { meetings: migrated, updated } = ensureHistoricalMeetingsMigrated(parsed);
          if (updated) {
            safeWriteLocalOrTmp(filename, migrated);
          }
          return migrated;
        }
        if (filename === 'settings.json') {
          const { settings: migrated, updated } = ensureSettingsMigrated(parsed);
          if (updated) {
            safeWriteLocalOrTmp(filename, migrated);
          }
          return migrated;
        }
        if (filename === 'staff.json') {
          const { staff: migrated, updated } = ensureStaffMigrated(parsed);
          if (updated) {
            safeWriteLocalOrTmp(filename, migrated);
          }
          return migrated;
        }
        return parsed;
      } catch (err) {
        console.error(`Failed to parse ${filename}:`, err);
        return defaultData[filename] || null;
      }
    }
  },

  async write(filename, data) {
    const key = `rad_mtg_${filename}`;
    globalThis.__RAD_MTG_MEM_DB__[filename] = data;
    if (kvClient) {
      try {
        await kvClient.set(key, data);
      } catch (error) {
        console.error('KV Write Error:', error);
        safeWriteLocalOrTmp(filename, data);
      }
    } else if (pgConnStr) {
      try {
        const pool = await ensurePgTable();
        await pool.query(
          `INSERT INTO rad_mtg_kv_store (key, value, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, JSON.stringify(data)]
        );
      } catch (error) {
        console.error('PG Write Error:', error);
        safeWriteLocalOrTmp(filename, data);
      }
    } else {
      safeWriteLocalOrTmp(filename, data);
    }

    if (filename !== 'login_records.json') {
      this.triggerAutoSync().catch(() => {});
    }
  },

  async triggerAutoSync() {
    try {
      const settings = await this.read('settings.json');
      if (!settings?.autoSyncGoogleSheet || !settings?.googleSheetWebhookUrl) return;
      const [staff, meetings] = await Promise.all([
        this.read('staff.json'),
        this.read('meetings.json')
      ]);
      await fetch(settings.googleSheetWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_all',
          timestamp: new Date().toISOString(),
          hospitalName: settings.hospitalName,
          departmentName: settings.departmentName,
          staff,
          meetings
        })
      });
    } catch (err) {
      // ignore background error
    }
  }
};
