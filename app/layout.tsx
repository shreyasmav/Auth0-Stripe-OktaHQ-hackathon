import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mandate — agent-to-agent procurement",
  description: "Auth0 governs whether an agent may act. Stripe governs where the money goes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-white antialiased">{children}</body>
    </html>
  );
}
