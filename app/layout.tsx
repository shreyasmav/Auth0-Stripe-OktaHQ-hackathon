import type { Metadata } from 'next';
import './globals.css';
import TopNav from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'Mandate',
  description:
    'Agents negotiate. Humans hold the money. Auth0 governs whether an agent may act, Stripe governs where the money goes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* No container here on purpose: pages own their own gutter via .page,
          so a section can go full-bleed for an alternating grey band. */}
      <body className="antialiased">
        <TopNav />
        <main>{children}</main>
      </body>
    </html>
  );
}
