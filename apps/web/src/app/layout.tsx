import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VittixBiz',
  description: 'GST billing, e-invoicing and accounting',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}