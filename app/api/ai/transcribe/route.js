import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const RADIOLOGY_STAFF_NAMES = [
  '許志賢', '林宜蓁', '鄭義成', '蘇雅敏', '楊蕙芳', '黃玉青', '洪浩泰',
  '高瑞隆', '張俐華', '潘俊儒', '林彥呈', '余姿樺', '陳憶頡', '吳俊霖',
  '伍容君', '胡政安', '陳怡伸', '林宜萱', '呂宗潤', '王采屏', '洪字淳', '張惠鳳'
];

// 科內人名、放射醫學專有名詞與常見語音/手寫辨識同音形近錯字校正表
const SPEECH_CORRECTION_RULES = [
  // 1. 新樓醫院影醫科 22 位人員同音/形近辨識校正
  { pattern: /[許徐][志智治][賢顯咸閑]/g, target: '許志賢', label: '人名校正' },
  { pattern: /鄭[義亦意議藝][成誠呈城承]/g, target: '鄭義成', label: '人名校正' },
  { pattern: /林[宜怡儀移][蓁真貞珍針]/g, target: '林宜蓁', label: '人名校正' },
  { pattern: /[蘇甦][雅亞][敏閔]/g, target: '蘇雅敏', label: '人名校正' },
  { pattern: /黃[玉育郁諭][青清卿輕]/g, target: '黃玉青', label: '人名校正' },
  { pattern: /[洪紅鴻][浩皓昊號][泰太態]/g, target: '洪浩泰', label: '人名校正' },
  { pattern: /高[瑞睿][隆龍榮農]/g, target: '高瑞隆', label: '人名校正' },
  { pattern: /張[俐利莉麗][華樺滑]/g, target: '張俐華', label: '人名校正' },
  { pattern: /潘[俊駿君均][儒如茹盧]/g, target: '潘俊儒', label: '人名校正' },
  { pattern: /林[彥諺晏燕][呈成誠城承]/g, target: '林彥呈', label: '人名校正' },
  { pattern: /楊[蕙惠慧會][芳方芬]/g, target: '楊蕙芳', label: '人名校正' },
  { pattern: /[余于俞魚][姿之芝資知][樺華滑花]/g, target: '余姿樺', label: '人名校正' },
  { pattern: /陳[憶義亦意奕藝][頡傑潔節捷]/g, target: '陳憶頡', label: '人名校正' },
  { pattern: /吳[俊駿君][霖林淋臨]/g, target: '吳俊霖', label: '人名校正' },
  { pattern: /[伍五吳][容蓉融][君軍均]/g, target: '伍容君', label: '人名校正' },
  { pattern: /胡[政正證禎][安]/g, target: '胡政安', label: '人名校正' },
  { pattern: /陳[怡宜儀移][伸生昇深身]/g, target: '陳怡伸', label: '人名校正' },
  { pattern: /林[宜怡儀移][萱宣軒暄]/g, target: '林宜萱', label: '人名校正' },
  { pattern: /呂[宗忠中][潤論倫輪]/g, target: '呂宗潤', label: '人名校正' },
  { pattern: /王[采彩採][屏萍平瓶]/g, target: '王采屏', label: '人名校正' },
  { pattern: /[洪紅鴻][字自志智][淳純醇]/g, target: '洪字淳', label: '人名校正' },
  { pattern: /張[惠蕙慧會][鳳奉]/g, target: '張惠鳳', label: '人名校正' },

  // 2. 醫院與放射醫學科專有名詞同音校正
  { pattern: /[心星欣薪]樓(醫院|基督教醫院)?/g, target: '新樓$1', label: '院名校正' },
  { pattern: /樹人[一醫衣依]專/g, target: '樹人醫專', label: '校名校正' },
  { pattern: /[影引]醫科/g, target: '影醫科', label: '科別校正' },
  { pattern: /[評平頻瓶]保(會議|檢測|課程|人員|報告|紀錄|記錄|小組|資料)?/g, target: '品保$1', label: '專有名詞' },
  { pattern: /[千鉛]衣/g, target: '鉛衣', label: '專有名詞' },
  { pattern: /[千鉛]屏風/g, target: '鉛屏風', label: '專有名詞' },
  { pattern: /[千鉛]圍裙/g, target: '鉛圍裙', label: '專有名詞' },
  { pattern: /[管滾館]球/g, target: '管球', label: '專有名詞' },
  { pattern: /壓迫[版板]/g, target: '壓迫板', label: '專有名詞' },
  { pattern: /[假家佳]体|家體/g, target: '假體', label: '專有名詞' },
  { pattern: /顯影[季劑記際]|對比[季劑記際]/g, target: '顯影劑', label: '專有名詞' },
  { pattern: /劑量[配佩備]章/g, target: '劑量佩章', label: '專有名詞' },
  { pattern: /[一依伊醫]批[Aa]|E\s+P\s+A/gi, target: 'EPA', label: '專有名詞' },
  { pattern: /西西西|3C會議|C\s+C\s+C/gi, target: 'CCC', label: '專有名詞' },
  { pattern: /批居[Yy]|P\s+G\s+Y/gi, target: 'PGY', label: '專有名詞' },
  { pattern: /電腦斷[曾層]/g, target: '電腦斷層', label: '專有名詞' },
  { pattern: /磁[震振鎮]造影/g, target: '磁振造影', label: '專有名詞' },
  { pattern: /放射[師詩獅]/g, target: '放射師', label: '專有名詞' },
  { pattern: /輻[射色設]防護/g, target: '輻射防護', label: '專有名詞' },
  { pattern: /信賴等[極級集]\s*(level|LEVEL)?\s*([1-5][a-cA-C]?)/gi, target: '信賴等級 LEVEL$2', label: '專有名詞' },

  // 3. 常見會議口語同音錯別字校正
  { pattern: /梅那麼/g, target: '沒那麼', label: '錯字修正' },
  { pattern: /簽[合和盒]/g, target: '簽核', label: '錯字修正' },
  { pattern: /會議[紀記][路露鹿]/g, target: '會議紀錄', label: '錯字修正' },
  { pattern: /[決絕覺]議事項/g, target: '決議事項', label: '錯字修正' },
  { pattern: /臨[床船]教師/g, target: '臨床教師', label: '錯字修正' },
  { pattern: /換[照罩趙]/g, target: '換照', label: '錯字修正' },
  { pattern: /實習[生身聲]/g, target: '實習生', label: '錯字修正' }
];

/**
 * 智慧語音逐字稿校正與詞句潤飾引擎（修正同音錯字、去除口語贅詞、順暢斷句）
 */
function polishAndCorrectTranscript(rawText = '') {
  if (!rawText || !rawText.trim()) {
    return { correctedText: '', corrections: [], count: 0 };
  }

  let text = rawText.trim();
  const corrections = [];

  // 1. 套用科內人名、放射專有名詞與常見同音錯字校正
  SPEECH_CORRECTION_RULES.forEach((rule) => {
    text = text.replace(rule.pattern, (matched) => {
      const replacement = matched.replace(rule.pattern, rule.target);
      if (matched !== replacement) {
        const record = `「${matched}」➔「${replacement}」`;
        if (!corrections.includes(record)) {
          corrections.push(record);
        }
      }
      return replacement;
    });
  });

  // 2. 去除口語贅詞（如：呃、嗯那個、就是說那個、那這樣子的話）與重複結巴字詞
  const beforeFiller = text;
  text = text
    .replace(/(?:^|[，。、\s])(呃+|嗯+|啊+|那個那個|就是說那個|那這樣子的話)/g, '，')
    .replace(/(我們|這個|那個|就是|然後|因為|所以|目前|今天)\1+/g, '$1')
    .replace(/，+/g, '，')
    .replace(/^，+/, '');

  if (text !== beforeFiller && !corrections.includes('去除口語贅詞與重複字詞')) {
    corrections.push('去除口語贅詞與重複字詞');
  }

  // 3. 手寫速記符號（如 ->、=>、OK、f/u）擴寫與口語句型轉正式書面語
  let shorthandExpanded = false;
  const sentences = text
    .split(/\r?\n/)
    .map((line) => {
      let s = line.trim();
      if (!s) return '';
      const beforeLine = s;
      s = s
        .replace(/^[※★☆•·\-*]\s*/, '')
        .replace(/\bf\/u\b/gi, '持續追蹤')
        .replace(/檢測\s*OK/gi, '檢測結果合格正常')
        .replace(/品保\s*OK/gi, '品保檢測合格')
        .replace(/([A-Za-z0-9\u4e00-\u9fa5（）()]+)\s*(?:->|=>|➔|→)\s*(.+)/g, '$1：$2')
        .replace(/要麻煩請/g, '請')
        .replace(/請幫我們追蹤一下/g, '請負責追蹤')
        .replace(/大家討論結果決定說/g, '經討論決議：')
        .replace(/最後決定就是/g, '決議：')
        .replace(/\s+/g, ' ');
      if (s !== beforeLine) {
        shorthandExpanded = true;
      }
      if (!/[。！？；：:]$/.test(s)) {
        s += '。';
      }
      return s;
    })
    .filter(Boolean);

  if (shorthandExpanded && !corrections.includes('手寫速記符號與簡寫自動潤飾擴寫')) {
    corrections.push('手寫速記符號與簡寫自動潤飾擴寫');
  }

  const finalPolished = sentences.join('\n');
  return {
    correctedText: finalPolished,
    corrections,
    count: corrections.length
  };
}

const TEMPLATE_PROMPTS = {
  ccc: `你現在是「新樓基督教醫院 影像醫學科」的資深教學會議暨臨床能力委員會 (CCC) 秘書。
請將以下語音逐字稿或會議筆記，整理為結構化的「教學暨CCC會議紀錄」JSON 格式：
重點包含：
1. 實習生與臨床教學相關事項討論（導師指派、輪訓排程、跨科實習、補班規定等）
2. EPA (可信賴專業活動 Entrustable Professional Activity) 評量標準與教學共識
3. PGY 醫事放射師或實習生個別學員評核結果（請明確標示學員姓名、檢查項目如 CT/MRI/Mammo/一般攝影、指導老師評語、信賴等級 LEVEL 1~5）
4. 具體決議事項與待辦追蹤事項 (Action Items)`,

  qa: `你現在是「新樓基督教醫院 影像醫學科」的醫療曝露品質保證 (QA/QC) 會議秘書。
請將以下語音逐字稿或會議筆記，整理為結構化的「品保會議紀錄」JSON 格式：
重點包含：
1. 年度/非年度輻射防護與品保訓練課程執行成果
2. 各項檢查儀器（CT電腦斷層、數位乳房攝影 Mammo、MRI、移動型/急診X光機）每週/每季/年度品保檢測結果與執照更新追蹤
3. 品保人員組織異動與新進人員品保資格訓練追蹤
4. 具體決議事項與待辦追蹤事項 (Action Items)`,

  rad: `你現在是「新樓基督教醫院 影像醫學科」的輻射防護委員會會議秘書。
請將以下語音逐字稿或會議筆記，整理為結構化的「輻射防護會議紀錄」JSON 格式：
重點包含：
1. 人員劑量佩章監測結果與輻射安全查核
2. 游離輻射防護教育訓練與法規遵循事項
3. 輻射設備許可證換發與屏蔽安全檢測追蹤
4. 具體決議事項與待辦追蹤事項 (Action Items)`,

  safety: `你現在是「新樓基督教醫院 影像醫學科」的病人安全暨跨領域討論會秘書。
請將以下語音逐字稿或會議筆記，整理為結構化的「病安案例暨跨領域會議紀錄」JSON 格式：
重點包含：
1. 臨床異常事件或跨領域照護案例背景說明
2. 根本原因分析與標準作業流程 (SOP) 檢討（顯影劑過敏處理、病人辨識、跌倒預防、重照率改善等）
3. 具體改善對策 (PDCA) 與跨團隊協作決議`,

  dept: `你現在是「新樓基督教醫院 影像醫學科」的科務會議秘書。
請將以下語音逐字稿或會議筆記，整理為結構化的「科務暨行政會議紀錄」JSON 格式：
重點包含：
1. 主席報告與宣導事項
2. 各檢查組別（一般攝影、CT、MRI、乳房攝影、特殊攝影）業務與排班運作討論
3. 專案進度追蹤（如當責 Q10、低碳永續、資訊化作業優化）
4. 臨時動議、具體決議事項與待辦追蹤事項 (Action Items)`,

  other: `你現在是「新樓基督教醫院 影像醫學科」的專業會議紀錄秘書。
請將以下語音逐字稿或會議筆記，依討論內容自動歸納為結構化的正式會議紀錄 JSON 格式：
重點包含：
1. 會議討論背景與主席報告事項
2. 專案或跨團隊討論重點條列
3. 具體決議事項與後續待辦追蹤事項 (Action Items)`
};

/**
 * 內建離線智慧結構化引擎：當尚未設定 Gemini API Key 時，自動解析逐字稿、科內人名、主題段落與待辦事項
 */
function buildSmartOfflineStructuredMinutes(rawText, category = 'dept', customTitle = '') {
  const cleanText = (rawText || '').trim();
  const lines = cleanText
    .split(/[\n。；;！!]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);

  const detectedStaff = RADIOLOGY_STAFF_NAMES.filter((name) => cleanText.includes(name));

  // 依類別設定預設標題與分段架構
  const categoryDefaults = {
    ccc: {
      defaultTitle: `${new Date().getFullYear() - 1911} 年新樓醫院醫事放射師 教學暨CCC會議紀錄`,
      headings: ['1. 實習生與臨床教學事項討論', '2. EPA 可信賴專業活動評量與標準共識', '3. PGY 暨學員臨床能力評核討論']
    },
    qa: {
      defaultTitle: `${new Date().getFullYear() - 1911} 年影像醫學科 輻射醫療曝露品保會議紀錄`,
      headings: ['1. 年度/非年度品保與輻防訓練成果', '2. 儀器設備品保檢測與執照更新追蹤', '3. 品保人員組織異動與資格培訓']
    },
    rad: {
      defaultTitle: `${new Date().getFullYear() - 1911} 年影像醫學科 輻射防護會議紀錄`,
      headings: ['1. 輻射劑量監測與安全管理報告', '2. 輻射設備證照與環境檢測追蹤', '3. 輻射防護教育訓練與宣導事項']
    },
    safety: {
      defaultTitle: `${new Date().getFullYear() - 1911} 年影像醫學科 病安案例暨跨領域討論會議紀錄`,
      headings: ['1. 案例背景與事件經過報告', '2. 原因分析與臨床檢查流程檢討', '3. 改善對策 (PDCA) 與預防再發措施']
    },
    dept: {
      defaultTitle: `${new Date().getFullYear() - 1911} 年影像醫學科 科務暨品質檢討會議紀錄`,
      headings: ['1. 主席報告與科內重要宣導', '2. 各組臨床業務與專案改善討論', '3. 臨時動議與排班人力協調']
    },
    other: {
      defaultTitle: `${new Date().getFullYear() - 1911} 年影像醫學科 會議紀錄`,
      headings: ['1. 主席報告與討論主題一', '2. 討論主題二', '3. 臨時動議與後續追蹤事項']
    }
  };

  const config = categoryDefaults[category] || categoryDefaults.dept;
  const discussionSections = [];
  const resolutions = [];
  const actionItems = [];

  if (lines.length === 0) {
    return {
      title: customTitle || config.defaultTitle,
      agendaItems: config.headings,
      discussionSections: config.headings.map((h) => ({ heading: h, bullets: ['（待補充討論細節）'] })),
      resolutions: ['請各組依會議討論事項配合辦理。'],
      actionItems: [],
      presentStaffNames: detectedStaff,
      mode: 'smart_offline'
    };
  }

  // 自動歸類句子至對應段落
  const bucket0 = [];
  const bucket1 = [];
  const bucket2 = [];

  lines.forEach((line, idx) => {
    // 偵測是否為決議或待辦事項
    if (/決議|通過|核定|確立|准予|原則同意/.test(line)) {
      resolutions.push(line.replace(/^(決議[:：]?)/, '').trim());
    }
    if (/請|負責|追蹤|完成|期限|預計|需加強|自行取得|呈報/.test(line)) {
      const matchedPerson = RADIOLOGY_STAFF_NAMES.find((n) => line.includes(n)) || '相關組別負責人';
      if (actionItems.length < 5) {
        actionItems.push({
          id: `ACT-${Date.now().toString().slice(-3)}-${idx}`,
          task: line,
          assignee: matchedPerson,
          dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          status: '進行中'
        });
      }
    }

    // 依關鍵字或順序分配到三個主題段落
    if (category === 'ccc') {
      if (/實習生|樹人|導師|週|補班|放腫|核醫/.test(line)) bucket0.push(line);
      else if (/EPA|護照|共識|紙本|標準/.test(line)) bucket1.push(line);
      else if (/PGY|LEVEL|品睿|思霈|詠勛|完訓|斷層|乳房|Mammo/.test(line)) bucket2.push(line);
      else (idx % 3 === 0 ? bucket0 : idx % 3 === 1 ? bucket1 : bucket2).push(line);
    } else if (category === 'qa') {
      if (/訓練|課程|3小時|參加/.test(line)) bucket0.push(line);
      else if (/執照|換照|年度品保|工程師|校驗|檢測/.test(line)) bucket1.push(line);
      else if (/新進|異動|離職|組織|登銷/.test(line)) bucket2.push(line);
      else (idx % 3 === 0 ? bucket0 : idx % 3 === 1 ? bucket1 : bucket2).push(line);
    } else {
      const third = Math.ceil(lines.length / 3) || 1;
      if (idx < third) bucket0.push(line);
      else if (idx < third * 2) bucket1.push(line);
      else bucket2.push(line);
    }
  });

  [bucket0, bucket1, bucket2].forEach((b, i) => {
    if (b.length > 0) {
      discussionSections.push({
        heading: config.headings[i] || `${i + 1}. 討論事項`,
        bullets: b
      });
    }
  });

  if (resolutions.length === 0) {
    resolutions.push(
      ...discussionSections.map((s) => `通過「${s.heading.replace(/^\d+\.\s*/, '')}」之討論內容，請相關同仁依決議執行。`)
    );
  }

  return {
    title: customTitle || config.defaultTitle,
    agendaItems: discussionSections.map((s) => s.heading),
    discussionSections,
    resolutions,
    actionItems,
    presentStaffNames: detectedStaff,
    transcript: cleanText,
    mode: 'smart_offline'
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      action = 'structure',
      transcript = '',
      category = 'dept',
      meetingTitle = '',
      audioBase64 = null,
      audioMimeType = 'audio/mp3',
      handwrittenImages = [],
      customApiKey = ''
    } = body;

    const validImages = Array.isArray(handwrittenImages)
      ? handwrittenImages.filter((img) => img && img.base64)
      : [];

    const settings = (await db.read('settings.json')) || {};
    const apiKey = (customApiKey || settings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();

    // 先以內建放射科專有名詞與科內 22 位人名同音字典進行初步校正與手寫速記潤飾
    const { correctedText: preCorrectedText, corrections } = polishAndCorrectTranscript(transcript);

    // 若使用者點選「📷 辨識手寫稿並潤飾」或「🪄 講完後：智慧修正錯別字與潤飾詞句」
    if (action === 'polish_transcript' || action === 'extract_handwritten') {
      if (!transcript.trim() && validImages.length === 0) {
        return NextResponse.json({ error: '請先上傳手寫稿照片、進行語音辨識或輸入筆記內容可供修正潤飾' }, { status: 400 });
      }

      // 若有設定 Gemini API Key，結合 Gemini 進行手寫影像辨識 (Vision OCR) 與醫療上下文潤飾
      if (apiKey) {
        try {
          const isHandwrittenMode = validImages.length > 0;
          const polishPrompt = isHandwrittenMode
            ? `你現在是「新樓基督教醫院 影像醫學科」的資深醫療會議秘書與手寫辨識專家。
請仔細辨識附帶圖片中的「手寫會議筆記 / 速記稿」，將手寫字跡、縮寫（如 CT、MRI、Mammo、EPA、CCC、PGY、PACS、RIS、f/u、-> 箭頭等）、塗改痕跡與條列重點，完整轉換並潤飾為通順、正式、條理分明的繁體中文會議筆記文字（請保留所有數據、日期与人名）。
${preCorrectedText ? `\n使用者額外補充之文字說明：\n${preCorrectedText}\n` : ''}
本院影像醫學科 22 位在職人員正確姓名供手寫辨識與同音校正參考：${RADIOLOGY_STAFF_NAMES.join('、')}。
請只回傳合法 JSON 物件：
{
  "correctedText": "辨識手寫稿並潤飾擴寫後的完整正式會議紀錄文字（可分段條列）",
  "extraCorrections": ["說明辨識與潤飾了哪些手寫速記、專有名詞或人名，例如：手寫速記箭頭擴寫為正式決議句、校正人名與放射科術語"]
}`
            : `你現在是「新樓基督教醫院 影像醫學科」的專業醫療語音與手寫筆記校正師。
請將以下口語逐字稿或手寫速記文字，修正同音錯別字、放射科醫學術語、科內人員姓名，並將斷裂的口語或速記句子潤飾為通順、自然的正式繁體中文句子（請保留原本的所有語意、數據與人名，不要刪減重要資訊）。
本院影像醫學科人員正確姓名供同音校正參考：${RADIOLOGY_STAFF_NAMES.join('、')}。
請只回傳合法 JSON 物件：
{
  "correctedText": "修正並潤飾通順後的完整逐字稿文字",
  "extraCorrections": ["說明修正了哪些同音字或語句，例如：將『評保』修正為『品保』"]
}

原始輸入文字：
${preCorrectedText}`;

          const polishParts = [];
          validImages.forEach((img) => {
            polishParts.push({
              inlineData: {
                mimeType: img.mimeType || 'image/jpeg',
                data: img.base64
              }
            });
          });
          polishParts.push({ text: polishPrompt });

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: polishParts }],
                generationConfig: {
                  temperature: 0.15,
                  responseMimeType: 'application/json'
                }
              })
            }
          );

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const rawJsonText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanedJson = rawJsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            const parsed = JSON.parse(cleanedJson);
            const allCorrections = [...corrections, ...(parsed.extraCorrections || [])];
            return NextResponse.json({
              success: true,
              mode: isHandwrittenMode
                ? `Gemini Vision 手寫影像辨識與潤飾 (${validImages.length} 張圖片)`
                : 'Gemini AI 醫療語意校正 + 科內專有名詞字典',
              correctedTranscript: parsed.correctedText || preCorrectedText,
              corrections: allCorrections,
              message: isHandwrittenMode
                ? `📷 已成功辨識 ${validImages.length} 張手寫稿照片並潤飾為正式會議文字！`
                : allCorrections.length > 0
                ? `✨ 已自動完成詞句潤飾與同音校正（${allCorrections.slice(0, 4).join('、')}）`
                : '✨ 已完成全篇語句標點與通順度潤飾！'
            });
          }
        } catch (err) {
          console.error('Gemini polish/handwritten fallback to offline:', err);
        }
      }

      if (!transcript.trim() && validImages.length > 0 && !apiKey) {
        return NextResponse.json(
          {
            error:
              '直接由手寫稿「照片圖檔」進行 AI 視覺辨識，需先於下方或後台「系統設定」填入免費的 Google Gemini API Key；若無金鑰，您也可以直接在文字框輸入或貼上手寫速記重點，或點擊「🧪 載入手寫速記範例」測試離線潤飾與結構化轉換！'
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        mode: '影醫科專有名詞與手寫速記潤飾引擎',
        correctedTranscript: preCorrectedText,
        corrections,
        message:
          corrections.length > 0
            ? `✨ 已為您修正並潤飾 ${corrections.length} 處速記與語句：${corrections.slice(0, 4).join('、')}`
            : '✨ 已完成手寫速記擴寫、口語贅字清理與標點潤飾！'
      });
    }

    // 進入結構化整理前，自動使用已校正過同音錯字與人名的逐字稿
    const effectiveTranscript = preCorrectedText || transcript;

    // 若有設定 Gemini API Key，優先呼叫 Google Gemini 多模態模型進行音訊/手寫圖片轉譯與結構化整理
    if (apiKey) {
      const systemInstruction = TEMPLATE_PROMPTS[category] || TEMPLATE_PROMPTS.dept;
      const schemaInstruction = `
請務必只回傳合法的 JSON 物件（不要加上 markdown \`\`\`json 標籤），格式如下：
{
  "title": "建議的正式會議標題",
  "transcript": "若輸入為手寫稿圖片或音訊檔，請附上辨識並潤飾後的完整繁體中文會議筆記/逐字稿；若輸入為文字則保留潤飾後文字",
  "agendaItems": ["1. 議程一", "2. 議程二"],
  "discussionSections": [
    {
      "heading": "1. 討論主題標題",
      "bullets": ["具體討論重點條列一（請將手寫簡寫或口語潤飾為完整正式語句）", "具體討論重點條列二"]
    }
  ],
  "resolutions": ["決議事項一", "決議事項二"],
  "actionItems": [
    {
      "id": "ACT-01",
      "task": "待辦事項具體內容",
      "assignee": "負責人姓名",
      "dueDate": "YYYY-MM-DD",
      "status": "進行中"
    }
  ],
  "presentStaffNames": ["偵測到的科內人員姓名"]
}
本院影像醫學科 22 位在職人員名單供辨識校正參考：${RADIOLOGY_STAFF_NAMES.join('、')}。`;

      const parts = [];
      if (audioBase64) {
        parts.push({
          inlineData: {
            mimeType: audioMimeType || 'audio/mp3',
            data: audioBase64
          }
        });
      }
      validImages.forEach((img) => {
        parts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/jpeg',
            data: img.base64
          }
        });
      });
      parts.push({
        text: `${systemInstruction}\n${schemaInstruction}\n\n會議預設標題：${meetingTitle || '未指定'}\n${
          validImages.length > 0
            ? `已附帶 ${validImages.length} 張手寫會議筆記照片，請仔細辨識手寫內容並擴寫潤飾為正式會議紀錄。\n`
            : ''
        }使用者輸入之會議語音逐字稿或手寫速記內容：\n${
          effectiveTranscript || '（請直接由上方附帶的手寫筆記圖片或錄音檔轉譯，並潤飾整理為結構化會議紀錄）'
        }`
      });

      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash'];
      for (const modelName of modelsToTry) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  temperature: 0.2,
                  responseMimeType: 'application/json'
                }
              })
            }
          );

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const rawJsonText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanedJson = rawJsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            const parsed = JSON.parse(cleanedJson);
            return NextResponse.json({
              success: true,
              mode:
                validImages.length > 0
                  ? `Gemini Vision 手寫稿辨識與結構化 (${modelName})`
                  : `gemini (${modelName})`,
              correctedTranscript: parsed.transcript || effectiveTranscript,
              corrections,
              result: {
                title: (meetingTitle || '').trim() || parsed.title || '影像醫學科 會議紀錄',
                transcript: parsed.transcript || effectiveTranscript || transcript,
                agendaItems: parsed.agendaItems || [],
                discussionSections: parsed.discussionSections || [],
                resolutions: parsed.resolutions || [],
                actionItems: (parsed.actionItems || []).map((a, i) => ({
                  id: a.id || `ACT-${Date.now().toString().slice(-3)}-${i}`,
                  task: a.task || '',
                  assignee: a.assignee || '待指派',
                  dueDate: a.dueDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                  status: a.status || '進行中'
                })),
                presentStaffNames: parsed.presentStaffNames || []
              }
            });
          }
        } catch (geminiErr) {
          console.error(`Gemini ${modelName} call failed:`, geminiErr);
        }
      }
    }

    // 若無 API Key 或僅有文字逐字稿，使用內建智慧結構化引擎
    if (!transcript.trim() && (audioBase64 || validImages.length > 0) && !apiKey) {
      return NextResponse.json(
        {
          error:
            validImages.length > 0
              ? '上傳手寫稿照片直接進行 AI 視覺辨識，需要設定免費的 Google Gemini API Key（可於後台「系統設定」填入）；或請搭配下方文字框輸入手寫重點／點選「載入手寫速記範例」進行免金鑰智慧潤飾轉換！'
              : '上傳錄音檔直接轉譯需要設定 Google Gemini API Key（可於後台「系統設定」免費填入），或請直接使用頁面上的「瀏覽器即時麥克風語音辨識（免金鑰）」功能！'
        },
        { status: 400 }
      );
    }

    const offlineResult = buildSmartOfflineStructuredMinutes(effectiveTranscript, category, meetingTitle);
    return NextResponse.json({
      success: true,
      mode: '內建智慧會議結構化引擎（含同音與手寫速記潤飾）',
      correctedTranscript: effectiveTranscript,
      corrections,
      result: offlineResult
    });
  } catch (error) {
    console.error('AI Transcribe Route Error:', error);
    return NextResponse.json({ error: '語音/手寫稿轉換與結構化整理發生錯誤' }, { status: 500 });
  }
}

