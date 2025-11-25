import React from 'react';
import KPICard from '../components/dashboard/KPICard';
import RevenueChart from '../components/dashboard/RevenueChart';
import ExpenseChart from '../components/dashboard/ExpenseChart';
import ProjectsChart from '../components/dashboard/ProjectsChart';
import RecentActivity from '../components/dashboard/RecentActivity';
import {
  BanknotesIcon,
  BriefcaseIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline';

export default function Dashboard() {
  // Mock data for now - will be replaced with API calls
  const stats = {
    totalExpenses: 125000,
    activeProjects: 8,
    totalContractors: 15,
    monthlyExpenses: 45000,
    expenseChange: '+12%',
    projectChange: '+3',
    contractorChange: '+2',
    monthlyChange: '-5%'
  };

  return (
    <div className="space-y-6 animate-in">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-content-text">לוח בקרה</h1>
        <p className="text-gray-600 mt-1">סקירה כללית של המערכת</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 stagger-children">
        <KPICard
          title="סה״כ הוצאות"
          value={`₪${stats.totalExpenses.toLocaleString('he-IL')}`}
          change={stats.expenseChange}
          changeType="positive"
          icon={BanknotesIcon}
          color="blue"
        />

        <KPICard
          title="פרויקטים פעילים"
          value={stats.activeProjects}
          change={stats.projectChange}
          changeType="positive"
          icon={BriefcaseIcon}
          color="green"
        />

        <KPICard
          title="קבלנים"
          value={stats.totalContractors}
          change={stats.contractorChange}
          changeType="positive"
          icon={UserGroupIcon}
          color="purple"
        />

        <KPICard
          title="הוצאות החודש"
          value={`₪${stats.monthlyExpenses.toLocaleString('he-IL')}`}
          change={stats.monthlyChange}
          changeType="negative"
          icon={DocumentTextIcon}
          color="yellow"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-content-border p-6 card-hover">
          <h2 className="text-lg font-semibold text-content-text mb-4">
            מגמת הוצאות
          </h2>
          <RevenueChart />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-content-border p-6 card-hover">
          <h2 className="text-lg font-semibold text-content-text mb-4">
            הוצאות לפי קטגוריה
          </h2>
          <ExpenseChart />
        </div>
      </div>

      {/* Projects and Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-content-border p-6 card-hover">
          <h2 className="text-lg font-semibold text-content-text mb-4">
            פיזור פרויקטים
          </h2>
          <ProjectsChart />
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-content-border p-6">
          <h2 className="text-lg font-semibold text-content-text mb-4">
            פעילות אחרונה
          </h2>
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}