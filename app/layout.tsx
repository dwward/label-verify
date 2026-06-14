import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "react-medium-image-zoom/dist/styles.css";

export const metadata: Metadata = {
  title: "Label Verification",
  description: "AI-powered alcohol label verification for TTB compliance",
  icons: {
    icon: "/images/ttb-logo.jpg",
  },
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
