import React from 'react';
import {
  DocumentTextIcon,
  BriefcaseIcon,
  UserGroupIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';
import clsx from 'clsx';

export default function RecentActivity() {
  // Mock data - will be replaced with API call
  const activities = [
    {
      id: 1,
      type: 'expense',
      title: 'הוצאה חדשה נוספה',
      description: 'חומרי בניה לפרויקט בתל אביב',
      amount: '₪12,500',
      time: 'לפני 5 דקות',
      icon: DocumentTextIcon,
      color: 'blue'
    },
    {
      id: 2,
      type: 'project',
      title: 'פרויקט חדש נוצר',
      description: 'בניין מגורים ברמת גן',
      time: 'לפני שעה',
      icon: BriefcaseIcon,
      color: 'green'
    },
    {
      id: 3,
      type: 'contractor',
      title: 'קבלן התווסף',
      description: 'דני כהן - קבלן חשמל',
      time: 'לפני 2 שעות',
      icon: UserGroupIcon,
      color: 'purple'
    },
    {
      id: 4,
      type: 'payment',
      title: 'תשלום התקבל',
      description: 'תשלום מלקוח עבור פרויקט הרצליה',
      amount: '₪45,000',
      time: 'לפני 3 שעות',
      icon: CurrencyDollarIcon,
      color: 'green'
    },
    {
      id: 5,
      type: 'expense',
      title: 'הוצאה עודכנה',
      description: 'עדכון סכום לרכישת ציוד',
      amount: '₪8,300',
      time: 'לפני 5 שעות',
      icon: DocumentTextIcon,
      color: 'yellow'
    }
  ];

  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {activities.map((activity, activityIdx) => (
          <li key={activity.id}>
            <div className="relative pb-8">
              {activityIdx !== activities.length - 1 ? (
                <span
                  className="absolute top-4 right-4 -mr-px h-full w-0.5 bg-gray-200"
                  aria-hidden="true"
                />
              ) : null}
              <div className="relative flex space-x-3 space-x-reverse">
                <div>
                  <span className={clsx(
                    colorClasses[activity.color],
                    'h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white'
                  )}>
                    <activity.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 space-x-reverse pt-1.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {activity.title}
                    </p>
                    <p className="text-sm text-gray-500">{activity.description}</p>
                    {activity.amount && (
                      <p className="text-sm font-semibold text-primary-600 mt-1">
                        {activity.amount}
                      </p>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-left text-sm text-gray-500">
                    {activity.time}
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}