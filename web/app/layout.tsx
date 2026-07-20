import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TinyLink — URL Shortener with Analytics",
  description: "Base62-encoded short links with real-time click analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-10">{children}</div>
      </body>
    </html>
  );
}
