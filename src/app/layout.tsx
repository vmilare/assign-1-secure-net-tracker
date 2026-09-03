import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Networking Tracker',
  description: 'A private, secure tracker for the people you want to stay connected with.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
