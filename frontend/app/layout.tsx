import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const brand = Fraunces({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const body = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "News Pulse – Live News Timeline",
  description:
    "Topic-clustered news timeline from BBC, NPR, The Guardian, and Al Jazeera.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${brand.variable} ${body.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
