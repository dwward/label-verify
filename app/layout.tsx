import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Label Verification",
  description: "AI-powered alcohol label verification for TTB compliance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <header className="bg-white border-b-2 border-gray-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="py-6">
                <h1 className="text-3xl font-bold text-gray-900">
                  Label Verification
                </h1>
              </div>

              {/* Navigation tabs */}
              <nav className="flex gap-6 -mb-px">
                <Link
                  href="/"
                  className="border-b-4 border-blue-600 px-4 py-3 text-base font-medium text-blue-600"
                >
                  Single Label
                </Link>
                <Link
                  href="/batch"
                  className="border-b-4 border-transparent px-4 py-3 text-base font-medium text-gray-600 hover:text-gray-900 hover:border-gray-300"
                >
                  Batch
                </Link>
              </nav>
            </div>
          </header>

          {/* Main content */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
