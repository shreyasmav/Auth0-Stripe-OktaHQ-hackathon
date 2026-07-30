import type { Metadata } from 'next';
import './globals.css';
import TopNav from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'AgentMarketplace',
  description: 'Agents negotiate. Humans hold the money. Auth0 governs whether an agent may act, Stripe governs where the money goes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <TopNav />
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
