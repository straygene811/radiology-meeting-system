import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { setAdminCookie } from '@/lib/auth';

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    const users = await db.read('admin_users.json');

    let matchedRole = null;
    let userInfo = null;

    if (users?.manager && username === users.manager.username && password === users.manager.password) {
      matchedRole = 'manager';
      userInfo = users.manager;
    } else if (users?.maintainer && username === users.maintainer.username && password === users.maintainer.password) {
      matchedRole = 'maintainer';
      userInfo = users.maintainer;
    } else if (users?.deputy && username === users.deputy.username && password === users.deputy.password) {
      matchedRole = 'deputy';
      userInfo = users.deputy;
    }

    if (matchedRole) {
      await setAdminCookie(matchedRole);
      return NextResponse.json({
        success: true,
        role: matchedRole,
        name: userInfo?.name || username,
        roleLabel: userInfo?.roleLabel || matchedRole
      });
    }

    return NextResponse.json({ error: '帳號或密碼錯誤，請重新確認' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: '伺服器發生錯誤' }, { status: 500 });
  }
}

