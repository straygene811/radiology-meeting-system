import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request) {
  try {
    const { codeOrName } = await request.json();
    if (!codeOrName || !codeOrName.trim()) {
      return NextResponse.json({ error: '請選擇您的姓名或輸入人事代號' }, { status: 400 });
    }

    const q = codeOrName.trim().toLowerCase();
    const staffList = (await db.read('staff.json')) || [];

    const matched = staffList.find(
      (s) =>
        s.name.toLowerCase() === q ||
        (s.code && s.code.toLowerCase() === q) ||
        (s.id && s.id.toLowerCase() === q) ||
        s.name.replace(/\s+/g, '').toLowerCase() === q
    );

    if (!matched) {
      return NextResponse.json(
        { error: `找不到「${codeOrName}」對應的科內人員資料，請由下拉選單點選姓名或洽系統管理員新增。` },
        { status: 404 }
      );
    }

    // 紀錄登入次數與最後登入時間
    const loginRecords = (await db.read('login_records.json')) || {};
    const key = matched.name;
    if (!loginRecords[key]) {
      loginRecords[key] = {
        code: matched.code,
        name: matched.name,
        count: 1,
        last_login: new Date().toISOString()
      };
    } else {
      loginRecords[key].count += 1;
      loginRecords[key].last_login = new Date().toISOString();
    }
    await db.write('login_records.json', loginRecords);

    return NextResponse.json({
      success: true,
      member: matched
    });
  } catch (error) {
    return NextResponse.json({ error: '登入驗證發生錯誤' }, { status: 500 });
  }
}

