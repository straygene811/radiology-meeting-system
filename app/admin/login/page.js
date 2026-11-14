'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, KeyRound, UserCheck } from 'lucide-react';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        router.push('/admin/dashboard');
      } else {
        setError(data.error || '帳號或密碼錯誤');
      }
    } catch (err) {
      setError('連線發生錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '92vh',
        padding: '1rem'
      }}
    >
      <div className="glass-panel" style={{ maxWidth: '460px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#ede9fe',
              color: '#5b21b6',
              padding: '0.35rem 0.85rem',
              borderRadius: '999px',
              fontSize: '0.8rem',
              fontWeight: 700,
              marginBottom: '0.7rem'
            }}
          >
            <ShieldCheck size={16} /> 影像醫學科會議整合系統・管理後台
          </div>
          <h1 style={{ fontSize: '1.55rem', marginBottom: '0.35rem' }}>主管審核與系統管理登入</h1>
          <p className="subtitle" style={{ margin: 0 }}>
            支援語音轉會議紀錄、紀錄維護、三級簽核、人員維護與報表匯出
          </p>
        </div>

        {/* 預設角色快速帶入區 */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '0.75rem 0.9rem',
            marginBottom: '1.25rem',
            fontSize: '0.82rem'
          }}
        >
          <div style={{ fontWeight: 700, color: '#334155', marginBottom: '0.45rem' }}>
            🔑 快速帶入角色帳號（與影醫科問卷系統相同）：
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => quickFill('x7260', 'x7260')}
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
            >
              👔 主任簽核 (x7260)
            </button>
            <button
              type="button"
              onClick={() => quickFill('x3137a', 'x3137a')}
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
            >
              📝 副組長/紀錄人 (x3137a)
            </button>
            <button
              type="button"
              onClick={() => quickFill('x3137', 'straygene')}
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
            >
              🛠️ 系統維護 (x3137)
            </button>
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="username">管理帳號</label>
            <input
              id="username"
              type="text"
              placeholder="請輸入管理帳號 (如 x7260 / x3137a / x3137)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">管理密碼</label>
            <input
              id="password"
              type="password"
              placeholder="請輸入密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn" style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem' }} disabled={loading}>
            <KeyRound size={17} /> {loading ? '驗證中...' : '登入管理後台'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.35rem' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              color: '#475569',
              textDecoration: 'none',
              fontSize: '0.88rem',
              fontWeight: 600
            }}
          >
            <ArrowLeft size={16} /> 返回同仁手機端首頁（看紀錄與簽名）
          </Link>
        </div>
      </div>
    </div>
  );
}

