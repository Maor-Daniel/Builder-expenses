import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNav from './MobileNav';

export default function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-content-bg" dir="rtl">
      {/* Sidebar - Desktop */}
      <Sidebar className="hidden md:block" />

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <MobileNav
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="md:pr-64 flex flex-col flex-1">
        <Header onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 p-4 md:p-8">
          <div className="animate-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}