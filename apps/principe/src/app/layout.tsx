// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { DPThemeProvider } from "@dp/theme";
import { principeTheme } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Príncipe",
  description: "Prove what's coming before reality runs the experiment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DPThemeProvider theme={principeTheme}>{children}</DPThemeProvider>
      </body>
    </html>
  );
}
