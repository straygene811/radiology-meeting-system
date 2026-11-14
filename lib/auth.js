import { cookies } from 'next/headers';

const MANAGER_SECRET = 'rad-mtg-manager-secret-7260';
const MAINTAINER_SECRET = 'rad-mtg-maintainer-secret-3137';
const DEPUTY_SECRET = 'rad-mtg-deputy-secret-3137a';

export async function setAdminCookie(role) {
  const cookieStore = await cookies();
  let token = MANAGER_SECRET;
  if (role === 'maintainer') token = MAINTAINER_SECRET;
  if (role === 'deputy') token = DEPUTY_SECRET;

  cookieStore.set('rad_admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7 // 7 days
  });
}

export async function clearAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.delete('rad_admin_session');
}

export async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('rad_admin_session');
  if (token?.value === MANAGER_SECRET) return 'manager';
  if (token?.value === MAINTAINER_SECRET) return 'maintainer';
  if (token?.value === DEPUTY_SECRET) return 'deputy';
  return false;
}

