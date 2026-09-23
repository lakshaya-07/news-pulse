import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
