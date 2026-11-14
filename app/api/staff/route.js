import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAdmin } from '@/lib/auth';

export async function GET() {
  try {
    const [staff, settings] = await Promise.all([
      db.read('staff.json'),
      db.read('settings.json')
    ]);
    return NextResponse.json({
      staff: staff || [],
      settings: settings || {}
    });
  } catch (error) {
    return NextResponse.json({ error: '讀取人員名單失敗' }, { status: 500 });
  }
}

export async function POST(request) {
  const role = await verifyAdmin();
  if (!role) {
    return NextResponse.json({ error: '請先登入管理後台' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;
    let staff = (await db.read('staff.json')) || [];

    if (action === 'save_single') {
      const { member } = body;
      if (!member?.name?.trim()) {
        return NextResponse.json({ error: '姓名不能為空' }, { status: 400 });
      }
      const cleanName = member.name.trim();
      const cleanCode = (member.code || cleanName).trim();

      const existingIdx = staff.findIndex((s) => s.id === member.id);
      if (existingIdx >= 0) {
        staff[existingIdx] = {
          ...staff[existingIdx],
          ...member,
          name: cleanName,
          code: cleanCode
        };
      } else {
        const newId = `S${String(staff.length + 1).padStart(2, '0')}-${Date.now().toString().slice(-3)}`;
        staff.push({
          id: newId,
          code: cleanCode,
          name: cleanName,
          title: member.title || '醫事放射師',
          role: member.role || 'staff',
          groups: Array.isArray(member.groups) && member.groups.length > 0 ? member.groups : ['一般科會'],
          status: member.status || '在職',
          note: member.note || ''
        });
      }

      await db.write('staff.json', staff);
      return NextResponse.json({ success: true, staff });
    }

    if (action === 'delete') {
      const { id } = body;
      staff = staff.filter((s) => s.id !== id);
      await db.write('staff.json', staff);
      return NextResponse.json({ success: true, staff });
    }

    if (action === 'toggle_status') {
      const { id, status } = body;
      staff = staff.map((s) => (s.id === id ? { ...s, status } : s));
      await db.write('staff.json', staff);
      return NextResponse.json({ success: true, staff });
    }

    if (action === 'bulk_import') {
      const { rows } = body;
      if (!Array.isArray(rows)) {
        return NextResponse.json({ error: '匯入格式不正確' }, { status: 400 });
      }

      let added = 0;
      let updated = 0;

      rows.forEach((row, idx) => {
        const name = (row.name || '').trim();
        if (!name) return;
        const code = (row.code || `EMP${String(staff.length + idx + 1).padStart(2, '0')}`).trim();
        const existingIdx = staff.findIndex(
          (s) => s.name === name || (s.code && s.code.toLowerCase() === code.toLowerCase())
        );

        const groups = Array.isArray(row.groups)
          ? row.groups
          : typeof row.groups === 'string' && row.groups.trim()
          ? row.groups.split(/[、,，;；/]/).map((g) => g.trim()).filter(Boolean)
          : ['一般科會'];

        if (existingIdx >= 0) {
          staff[existingIdx] = {
            ...staff[existingIdx],
            code: code || staff[existingIdx].code,
            title: row.title || staff[existingIdx].title,
            role: row.role || staff[existingIdx].role,
            groups: groups.length > 0 ? groups : staff[existingIdx].groups,
            status: row.status || staff[existingIdx].status,
            note: row.note !== undefined ? row.note : staff[existingIdx].note
          };
          updated++;
        } else {
          staff.push({
            id: `S${String(staff.length + 1).padStart(2, '0')}-${Math.floor(Math.random() * 900 + 100)}`,
            code,
            name,
            title: row.title || '醫事放射師',
            role: row.role || 'staff',
            groups,
            status: row.status || '在職',
            note: row.note || ''
          });
          added++;
        }
      });

      await db.write('staff.json', staff);
      return NextResponse.json({
        success: true,
        staff,
        message: `批次匯入完成：新增 ${added} 人、更新 ${updated} 人`
      });
    }

    return NextResponse.json({ error: '未知的操作' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: '處理人員資料失敗' }, { status: 500 });
  }
}

