"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface AppNavigationProps {
  reviewQueueCount?: number;
}

export default function AppNavigation({ reviewQueueCount = 0 }: AppNavigationProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-white border border-gray-300 rounded-lg shadow-lg hover:bg-gray-50"
        aria-label="Open navigation menu"
      >
        <svg
          className="w-6 h-6 text-gray-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop: always visible, Mobile: drawer overlay */}
      <div className={`
        w-60 bg-white border-r border-gray-200 flex flex-col h-screen
        md:relative md:translate-x-0
        fixed top-0 left-0 z-50 transition-transform duration-300
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
      {/* Close button - mobile only */}
      <button
        onClick={() => setMobileMenuOpen(false)}
        className="md:hidden absolute top-4 right-4 p-2 hover:bg-gray-100 rounded z-10"
        aria-label="Close navigation menu"
      >
        <svg
          className="w-6 h-6 text-gray-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        <Link
          href="/upload"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        >
          <img
            src="/images/ttb-logo.jpg"
            alt="TTB"
            className="w-10 h-10 object-contain"
            onError={(e) => {
              // Fallback to text square if logo fails to load
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
          <div className="w-10 h-10 bg-blue-600 rounded hidden items-center justify-center text-white font-bold text-sm">
            TTB
          </div>
          <span className="font-semibold text-base">TTB Label Verify</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3">
        <Link
          href="/upload"
          className={`flex items-center gap-3 px-3 py-2 text-base font-medium rounded mb-1 ${
            isActive("/upload")
              ? "bg-blue-50 text-blue-700"
              : "text-gray-700 hover:bg-gray-100"
          }`}
          onClick={() => setMobileMenuOpen(false)}
        >
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <span className="flex-shrink-0">Upload Applications</span>
        </Link>
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2 text-base font-medium rounded mb-1 ${
            isActive("/dashboard")
              ? "bg-blue-50 text-blue-700"
              : "text-gray-700 hover:bg-gray-100"
          }`}
          onClick={() => setMobileMenuOpen(false)}
        >
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span className="flex-shrink-0">Batch Dashboard</span>
          {reviewQueueCount > 0 && (
            <span className="ml-auto bg-yellow-100 text-yellow-800 text-sm font-bold px-2 py-1 rounded">
              {reviewQueueCount}
            </span>
          )}
        </Link>
      </nav>

      {/* Version Info */}
      <div className="p-3 border-t border-gray-200 text-sm text-gray-500">
        <div>Label Verify v1.0</div>
        <div>TTB Compliance Tool</div>
        <div>Author: <a href="mailto:dwward@gmail.com">Don Ward</a></div>
      </div>
    </div>
    </>
  );
}
