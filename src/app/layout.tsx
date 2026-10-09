import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LegalAI — Indian Advocate Litigation Workspace',
  description:
    'Full-stack Next.js legal workspace for Indian advocates: matters, calendar, multilingual OCR evidence miner, limitation calculator, eCourts case status, and case law search.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
