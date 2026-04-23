import './globals.css';

export const metadata = {
  title: 'SRT → ASS Bilingual Translator',
  description: 'Upload SRT subtitle (English), get bilingual ASS file (EN + VI)',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
