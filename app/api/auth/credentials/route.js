import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAdmin } from '@/lib/auth';

export async function POST(request) {
  const role = await verifyAdmin();
  if (!role) {
    return NextResponse.json({ error: '未授權的存取' }, { status: 401 });
  }

  try {
    const { targetRole, newUsername, newPassword, newName } = await request.json();
    const users = await db.read('admin_users.json');

    // 維護人員 (maintainer) 可修改所有人的帳密；主任與副組長僅能修改自己的密碼
    const roleToEdit = role === 'maintainer' ? (targetRole || role) : role;

    if (!users[roleToEdit]) {
      return NextResponse.json({ error: '找不到指定的角色' }, { status: 400 });
    }

    if (role === 'maintainer' && newUsername && newUsername.trim()) {
      users[roleToEdit].username = newUsername.trim();
    }
    if (newPassword && newPassword.trim()) {
      users[roleToEdit].password = newPassword.trim();
    }
    if (newName && newName.trim()) {
      users[roleToEdit].name = newName.trim();
    }

    await db.write('admin_users.json', users);
    return NextResponse.json({
      success: true,
      message: '帳號密碼設定已成功更新'
    });
  } catch (error) {
    return NextResponse.json({ error: '更新帳號密碼失敗' }, { status: 500 });
  }
}

