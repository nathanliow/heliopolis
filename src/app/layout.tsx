import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Heliopolis",
  description: "A 3D city of Solana wallets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="w-full h-full overflow-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased w-full h-full overflow-hidden bg-[#0a0a12]`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
