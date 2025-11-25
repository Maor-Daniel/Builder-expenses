import React from 'react';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/solid';
import clsx from 'clsx';

export default function KPICard({
  title,
  value,
  change,
  changeType = 'positive',
  icon: Icon,
  color = 'blue',
  loading = false
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    teal: 'bg-teal-50 text-teal-600'
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-content-border p-6 animate-pulse">
        <div className="w-12 h-12 bg-gray-200 rounded-lg mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
        <div className="h-8 bg-gray-200 rounded w-32"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-content-border p-6 hover:shadow-md transition-all duration-300 transform hover:-translate-y-1">
      {/* Icon */}
      <div className={clsx(
        'inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4',
        colorClasses[color]
      )}>
        <Icon className="w-6 h-6" />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-gray-600 mb-1">
        {title}
      </h3>

      {/* Value and Change */}
      <div className="flex items-end justify-between">
        <p className="text-3xl font-bold text-content-text">
          {value}
        </p>

        {/* Change Indicator */}
        {change && (
          <div className={clsx(
            'flex items-center gap-1 text-sm font-medium',
            changeType === 'positive' ? 'text-green-600' : 'text-red-600'
          )}>
            {changeType === 'positive' ? (
              <ArrowTrendingUpIcon className="w-4 h-4" />
            ) : (
              <ArrowTrendingDownIcon className="w-4 h-4" />
            )}
            <span>{change}</span>
          </div>
        )}
      </div>

      {/* Mini Progress Bar (optional) */}
      <div className="mt-3">
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className={clsx(
              'h-1.5 rounded-full transition-all duration-500',
              color === 'blue' && 'bg-blue-500',
              color === 'green' && 'bg-green-500',
              color === 'yellow' && 'bg-yellow-500',
              color === 'purple' && 'bg-purple-500',
              color === 'red' && 'bg-red-500',
              color === 'teal' && 'bg-teal-500'
            )}
            style={{ width: '65%' }}
          />
        </div>
      </div>
    </div>
  );
}