import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RecoveryRedirect } from "@/components/auth/RecoveryRedirect";
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
  title: "Vault OS",
  description: "Operational intelligence for The Fabric Vault.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RecoveryRedirect />
        {children}
      </body>
    </html>
  );
}
