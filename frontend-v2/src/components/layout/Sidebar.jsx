import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  DocumentTextIcon,
  UserGroupIcon,
  BriefcaseIcon,
  WrenchScrewdriverIcon,
  ChartBarIcon,
  CreditCardIcon,
  Cog6ToothIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';
import { useUser } from '@clerk/clerk-react';
import clsx from 'clsx';

export default function Sidebar({ className = '' }) {
  const location = useLocation();
  const { user } = useUser();

  const navigation = [
    {
      name: 'לוח בקרה',
      href: '/',
      icon: HomeIcon,
      show: true
    },
    {
      name: 'הוצאות',
      href: '/expenses',
      icon: DocumentTextIcon,
      show: true
    },
    {
      name: 'פרויקטים',
      href: '/projects',
      icon: BriefcaseIcon,
      show: true
    },
    {
      name: 'קבלנים',
      href: '/contractors',
      icon: UserGroupIcon,
      show: true
    },
    {
      name: 'עבודות',
      href: '/works',
      icon: WrenchScrewdriverIcon,
      show: true
    },
    {
      name: 'דוחות',
      href: '/reports',
      icon: ChartBarIcon,
      show: true
    },
    {
      name: 'חיוב ומנוי',
      href: '/billing',
      icon: CreditCardIcon,
      show: true
    },
    {
      name: 'הגדרות',
      href: '/settings',
      icon: Cog6ToothIcon,
      show: true
    }
  ].filter(item => item.show);

  return (
    <div className={clsx('fixed inset-y-0 right-0 w-64 bg-sidebar-bg', className)}>
      {/* Logo Section */}
      <div className="flex items-center justify-center h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
            <BuildingOfficeIcon className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-sidebar-text">
            מעקב הוצאות
          </h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={clsx(
                'group flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                isActive
                  ? 'bg-sidebar-active text-white shadow-md'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.name}</span>
              {isActive && (
                <div className="mr-auto w-1 h-6 bg-primary-500 rounded-full" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User Section at Bottom */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-white font-semibold">
            {user?.firstName?.[0] || user?.username?.[0] || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-text truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {user?.primaryEmailAddress?.emailAddress}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}