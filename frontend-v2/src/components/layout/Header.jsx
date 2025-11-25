import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Bars3Icon,
  BellIcon,
  MagnifyingGlassIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline';
import { UserButton } from '@clerk/clerk-react';

export default function Header({ onMenuClick }) {
  const location = useLocation();
  const [showSearch, setShowSearch] = useState(false);

  // Get page title based on current route
  const getPageTitle = () => {
    const titles = {
      '/': 'לוח בקרה',
      '/expenses': 'ניהול הוצאות',
      '/projects': 'פרויקטים',
      '/contractors': 'קבלנים',
      '/works': 'עבודות',
      '/reports': 'דוחות',
      '/billing': 'חיוב ומנוי',
      '/settings': 'הגדרות',
    };
    return titles[location.pathname] || 'מערכת מעקב הוצאות';
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-content-border shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 md:px-8">
        {/* Mobile Menu Button */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Bars3Icon className="w-6 h-6 text-gray-600" />
        </button>

        {/* Page Title */}
        <div className="flex items-center gap-4 flex-1">
          <h2 className="text-xl md:text-2xl font-bold text-content-text">
            {getPageTitle()}
          </h2>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          {/* Search Button */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-600" />
          </button>

          {/* Notifications */}
          <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <BellIcon className="w-5 h-5 text-gray-600" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          </button>

          {/* User Menu - Clerk UserButton */}
          <div className="flex items-center">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-10 h-10",
                },
              }}
              afterSignOutUrl="/"
            />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <div className="relative max-w-2xl mx-auto">
            <input
              type="text"
              placeholder="חיפוש..."
              className="w-full px-10 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              autoFocus
            />
            <MagnifyingGlassIcon className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
          </div>
        </div>
      )}
    </header>
  );
}