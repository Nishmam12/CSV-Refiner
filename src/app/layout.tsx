import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OSLTT Data Studio — by notsonabil",
  description: "Local-first OSLTT latency data refinement — crafted by notsonabil",
  authors: [{ name: "notsonabil" }],
  creator: "notsonabil",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
