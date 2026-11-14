import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAdmin } from '@/lib/auth';

export async function GET() {
  const role = await verifyAdmin();
  if (!role) {
    return NextResponse.json({ error: '未授權的存取' }, { status: 401 });
  }

  try {
    const [settings, users] = await Promise.all([
      db.read('settings.json'),
      db.read('admin_users.json')
    ]);

    return NextResponse.json({
      role,
      storageMode: db.getStorageMode(),
      settings: settings || {},
      accounts: {
        manager: { username: users?.manager?.username || 'x7260', name: users?.manager?.name || '科主任' },
        deputy: { username: users?.deputy?.username || 'x3137a', name: users?.deputy?.name || '副組長/紀錄人' },
        maintainer: { username: users?.maintainer?.username || 'x3137', name: users?.maintainer?.name || '系統維護人員' }
      }
    });
  } catch (error) {
    return NextResponse.json({ error: '讀取設定失敗' }, { status: 500 });
  }
}

export async function POST(request) {
  const role = await verifyAdmin();
  if (!role) {
    return NextResponse.json({ error: '未授權的存取' }, { status: 401 });
  }

  try {
    const updates = await request.json();
    const currentSettings = (await db.read('settings.json')) || {};
    const newSettings = {
      ...currentSettings,
      ...updates
    };
    await db.write('settings.json', newSettings);
    return NextResponse.json({
      success: true,
      settings: newSettings,
      message: '系統設定已儲存'
    });
  } catch (error) {
    return NextResponse.json({ error: '更新系統設定失敗' }, { status: 500 });
  }
}

