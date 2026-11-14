import './globals.css';

export const metadata = {
  title: '新樓基督教醫院 — 影像醫學科會議整合系統',
  description: '影像醫學科行動會議紀錄、電子簽核、語音轉會議紀錄、待辦追蹤與人員維護整合系統',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  );
}

