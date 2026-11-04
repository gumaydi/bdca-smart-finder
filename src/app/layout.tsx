import type { Metadata } from "next";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/jetbrains-mono/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Denah Kursi Orang Tua Wisudawan",
  description: "Sistem manajemen denah kursi orang tua wisudawan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
