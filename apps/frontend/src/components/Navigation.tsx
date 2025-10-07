'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Navigation = () => {
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', href: '/', icon: '📊' },
    { name: 'Strategies', href: '/strategies', icon: '🎯' },
    { name: 'Trades', href: '/trades', icon: '📈' },
    { name: 'Portfolio', href: '/portfolio', icon: '💼' },
    { name: 'Settings', href: '/settings', icon: '⚙️' },
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="bg-[#0f1419] border-r border-gray-700 w-64 min-h-screen fixed left-0 top-0 z-50">
      <div className="p-6">
        {/* Logo */}
        <div className="flex items-center mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
            <span className="text-white font-bold text-lg">⚡</span>
          </div>
          <h1 className="text-xl font-bold text-white">FastBreak</h1>
        </div>

        {/* Navigation Items */}
        <div className="space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="mr-3 text-lg">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </div>

        {/* Connect Wallet Button */}
        <div className="mt-8 pt-8 border-t border-gray-700">
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors">
            Connect Wallet
          </button>
        </div>

        {/* Help and Docs */}
        <div className="mt-6">
          <Link
            href="/help"
            className="flex items-center px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <span className="mr-3">❓</span>
            Help and Docs
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;