import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import Chart from 'react-apexcharts';
import { pdf } from '@react-pdf/renderer';
import {
  BanknotesIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  ClockIcon,
  ChartBarIcon,
  CalendarIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

import expenseService from '../services/expenseService';
import projectService from '../services/projectService';
import contractorService from '../services/contractorService';
import workService from '../services/workService';
import ExpenseReportPDF from '../components/reports/ExpenseReportPDF';
import ExpenseReportPDF_Compact from '../components/reports/ExpenseReportPDF_Compact';
import { downloadReceiptsForPDF, estimatePDFSize } from '../utils/pdfImageDownloader';

/**
 * Reports Page Component
 *
 * Comprehensive analytics dashboard showing:
 * - Financial summaries (total expenses, project costs, contractor costs)
 * - Expense trends over time (line chart)
 * - Costs by project (bar chart)
 * - Costs by contractor (pie chart)
 * - Work status distribution (donut chart)
 * - Budget utilization metrics
 * - Top spending projects/contractors tables
 */
export default function Reports() {
  const { getToken } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

  // Fetch all data
  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const token = await getToken();
      return expenseService.getExpenses(token);
    }
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const token = await getToken();
      return projectService.getProjects(token);
    }
  });

  const { data: contractors = [], isLoading: contractorsLoading } = useQuery({
    queryKey: ['contractors'],
    queryFn: async () => {
      const token = await getToken();
      return contractorService.getContractors(token);
    }
  });

  const { data: works = [], isLoading: worksLoading } = useQuery({
    queryKey: ['works'],
    queryFn: async () => {
      const token = await getToken();
      return workService.getWorks(token);
    }
  });

  const isLoading = expensesLoading || projectsLoading || contractorsLoading || worksLoading;

  // Calculate metrics
  const metrics = useMemo(() => {
    // Ensure all data is arrays
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const safeWorks = Array.isArray(works) ? works : [];
    const safeProjects = Array.isArray(projects) ? projects : [];

    // Total expenses
    const totalExpenses = safeExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

    // Total work costs
    const totalWorkCosts = safeWorks.reduce((sum, work) => sum + Number(work.cost || 0), 0);

    // Total costs (expenses + works)
    const totalCosts = totalExpenses + totalWorkCosts;

    // Total budget
    const totalBudget = safeProjects.reduce((sum, proj) => sum + Number(proj.budget || 0), 0);

    // Budget utilization
    const budgetUtilization = totalBudget > 0 ? (totalCosts / totalBudget) * 100 : 0;

    // Total hours worked
    const totalHours = safeWorks.reduce((sum, work) => sum + Number(work.hours || 0), 0);

    // Active projects
    const activeProjects = safeProjects.filter(p => p.status === 'active').length;

    // Costs by project
    const costsByProject = {};
    safeProjects.forEach(project => {
      costsByProject[project.projectId] = {
        name: project.name,
        expenses: 0,
        works: 0,
        budget: Number(project.budget || 0)
      };
    });

    safeExpenses.forEach(exp => {
      if (exp.projectId && costsByProject[exp.projectId]) {
        costsByProject[exp.projectId].expenses += Number(exp.amount || 0);
      }
    });

    safeWorks.forEach(work => {
      if (work.projectId && costsByProject[work.projectId]) {
        costsByProject[work.projectId].works += Number(work.cost || 0);
      }
    });

    // Costs by contractor
    const safeContractors = Array.isArray(contractors) ? contractors : [];
    const costsByContractor = {};
    safeContractors.forEach(contractor => {
      costsByContractor[contractor.contractorId] = {
        name: contractor.name,
        totalCost: 0,
        totalHours: 0
      };
    });

    safeWorks.forEach(work => {
      if (work.contractorId && costsByContractor[work.contractorId]) {
        costsByContractor[work.contractorId].totalCost += Number(work.cost || 0);
        costsByContractor[work.contractorId].totalHours += Number(work.hours || 0);
      }
    });

    // Work status distribution
    const workStatusDistribution = {
      pending: safeWorks.filter(w => w.status === 'pending').length,
      'in-progress': safeWorks.filter(w => w.status === 'in-progress').length,
      completed: safeWorks.filter(w => w.status === 'completed').length,
      approved: safeWorks.filter(w => w.status === 'approved').length
    };

    // Expense trends (group by month)
    const expenseTrends = {};
    [...safeExpenses, ...safeWorks].forEach(item => {
      const date = new Date(item.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!expenseTrends[monthKey]) {
        expenseTrends[monthKey] = 0;
      }

      expenseTrends[monthKey] += Number(item.amount || item.cost || 0);
    });

    return {
      totalExpenses,
      totalWorkCosts,
      totalCosts,
      totalBudget,
      budgetUtilization,
      totalHours,
      activeProjects,
      costsByProject: Object.values(costsByProject),
      costsByContractor: Object.values(costsByContractor),
      workStatusDistribution,
      expenseTrends
    };
  }, [expenses, projects, contractors, works]);

  // Export to PDF function
  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      toast.loading('מייצא דוח לPDF...', { id: 'pdf-export' });

      // Generate PDF document
      const doc = (
        <ExpenseReportPDF
          expenses={expenses}
          projects={projects}
          contractors={contractors}
          works={works}
          filters={null}
        />
      );

      // Generate PDF blob
      const blob = await pdf(doc).toBlob();

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `דוח_הוצאות_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`דוח PDF עם ${expenses.length} הוצאות יוצא בהצלחה`, { id: 'pdf-export' });
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('שגיאה בייצוא הדוח', { id: 'pdf-export' });
    } finally {
      setIsExporting(false);
    }
  };

  // Export to PDF with embedded receipt images (permanent access)
  const handleExportPDFWithReceipts = async () => {
    try {
      setIsExporting(true);
      setDownloadProgress({ current: 0, total: 0 });

      // Ensure expenses is an array
      const safeExpenses = Array.isArray(expenses) ? expenses : [];

      if (safeExpenses.length === 0) {
        toast.error('אין הוצאות לייצוא', { id: 'pdf-export' });
        setIsExporting(false);
        return;
      }

      // Step 1: Show initial toast
      toast.loading('מכין ייצוא עם קבלות מוטמעות...', { id: 'pdf-export' });

      // Step 2: Download receipt images in parallel
      toast.loading('מוריד קבלות...', { id: 'pdf-export' });

      const expensesWithImages = await downloadReceiptsForPDF(safeExpenses, {
        concurrentLimit: 5,
        compress: true,
        compressionOptions: {
          maxWidth: 400, // Smaller thumbnails for compact PDF
          maxHeight: 600,
          quality: 0.7
        },
        onProgress: (current, total) => {
          setDownloadProgress({ current, total });
          toast.loading(`מוריד קבלות... ${current} מתוך ${total}`, { id: 'pdf-export' });
        }
      });

      // Step 3: Estimate final PDF size
      const sizeEstimate = estimatePDFSize(expensesWithImages);
      console.log('PDF size estimate:', sizeEstimate);

      // Step 4: Generate PDF with embedded images
      toast.loading('יוצר PDF עם קבלות מוטמעות...', { id: 'pdf-export' });

      const doc = (
        <ExpenseReportPDF_Compact
          expenses={expensesWithImages}
          projects={projects}
          contractors={contractors}
          filters={null}
        />
      );

      // Step 5: Generate PDF blob
      const blob = await pdf(doc).toBlob();

      // Step 6: Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `דוח_הוצאות_עם_קבלות_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const successCount = expensesWithImages.filter(e => e.receiptImageData).length;
      const errorCount = expensesWithImages.filter(e => e.receiptError).length;

      toast.success(
        `דוח PDF יוצא בהצלחה! ${successCount} קבלות מוטמעות${errorCount > 0 ? ` (${errorCount} שגיאות)` : ''}. גודל: ${sizeEstimate.totalSizeMB}MB`,
        { id: 'pdf-export', duration: 5000 }
      );

    } catch (error) {
      console.error('PDF export with receipts error:', error);
      toast.error('שגיאה בייצוא הדוח עם קבלות', { id: 'pdf-export' });
    } finally {
      setIsExporting(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  };

  // Charts configuration
  const expenseTrendChartOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      fontFamily: 'inherit'
    },
    colors: ['#3b82f6'],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.1
      }
    },
    xaxis: {
      categories: Object.keys(metrics.expenseTrends).sort(),
      labels: {
        formatter: (value) => {
          const [year, month] = value.split('-');
          return `${month}/${year.slice(2)}`;
        }
      }
    },
    yaxis: {
      labels: {
        formatter: (value) => `₪${value.toLocaleString('he-IL')}`
      }
    },
    tooltip: {
      y: {
        formatter: (value) => `₪${value.toLocaleString('he-IL')}`
      }
    }
  };

  const expenseTrendChartSeries = [{
    name: 'הוצאות',
    data: Object.keys(metrics.expenseTrends).sort().map(key => metrics.expenseTrends[key])
  }];

  const projectCostsChartOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false }
    },
    colors: ['#3b82f6', '#ef4444'],
    plotOptions: {
      bar: {
        horizontal: true,
        dataLabels: { position: 'top' }
      }
    },
    dataLabels: {
      enabled: true,
      formatter: (value) => `₪${value.toLocaleString('he-IL')}`,
      offsetX: -6,
      style: {
        fontSize: '10px',
        colors: ['#fff']
      }
    },
    xaxis: {
      categories: metrics.costsByProject.map(p => p.name),
      labels: {
        formatter: (value) => `₪${value.toLocaleString('he-IL')}`
      }
    },
    legend: {
      position: 'top'
    }
  };

  const projectCostsChartSeries = [
    {
      name: 'עלות בפועל',
      data: metrics.costsByProject.map(p => p.expenses + p.works)
    },
    {
      name: 'תקציב',
      data: metrics.costsByProject.map(p => p.budget)
    }
  ];

  const contractorCostsChartOptions = {
    chart: {
      type: 'pie'
    },
    labels: metrics.costsByContractor.map(c => c.name),
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'],
    legend: {
      position: 'bottom'
    },
    tooltip: {
      y: {
        formatter: (value) => `₪${value.toLocaleString('he-IL')}`
      }
    }
  };

  const contractorCostsChartSeries = metrics.costsByContractor.map(c => c.totalCost);

  const workStatusChartOptions = {
    chart: {
      type: 'donut'
    },
    labels: ['ממתין', 'בביצוע', 'הושלם', 'אושר'],
    colors: ['#fbbf24', '#3b82f6', '#10b981', '#8b5cf6'],
    legend: {
      position: 'bottom'
    }
  };

  const workStatusChartSeries = [
    metrics.workStatusDistribution.pending,
    metrics.workStatusDistribution['in-progress'],
    metrics.workStatusDistribution.completed,
    metrics.workStatusDistribution.approved
  ];

  if (isLoading) {
    return (
      <div className="animate-in flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">טוען נתונים...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-content-text flex items-center gap-2">
            <ChartBarIcon className="w-8 h-8" />
            דוחות ואנליטיקה
          </h1>
          <p className="text-gray-600 mt-1">סיכום מקיף של הוצאות, פרויקטים ועבודות</p>
        </div>
        <div className="flex gap-3">
          {/* Quick PDF Export (no receipts) */}
          <button
            onClick={handleExportPDF}
            disabled={isExporting || isLoading || expenses.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            title="ייצוא מהיר ללא תמונות קבלות"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            <span>ייצוא מהיר</span>
          </button>

          {/* PDF Export with Embedded Receipts (permanent) */}
          <button
            onClick={handleExportPDFWithReceipts}
            disabled={isExporting || isLoading || expenses.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed relative"
            title="ייצוא עם קבלות מוטמעות - תקף לצמיתות"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            <span>
              {isExporting && downloadProgress.total > 0
                ? `מוריד קבלות... ${downloadProgress.current}/${downloadProgress.total}`
                : isExporting
                ? 'מייצא...'
                : 'ייצוא עם קבלות 🔒'}
            </span>
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="סך כל ההוצאות"
          value={`₪${metrics.totalCosts.toLocaleString('he-IL')}`}
          icon={BanknotesIcon}
          color="blue"
          subtitle={`הוצאות: ₪${metrics.totalExpenses.toLocaleString('he-IL')} | עבודות: ₪${metrics.totalWorkCosts.toLocaleString('he-IL')}`}
        />
        <KPICard
          title="ניצול תקציב"
          value={`${metrics.budgetUtilization.toFixed(1)}%`}
          icon={CalendarIcon}
          color={metrics.budgetUtilization > 100 ? 'red' : metrics.budgetUtilization > 80 ? 'yellow' : 'green'}
          subtitle={`תקציב כולל: ₪${metrics.totalBudget.toLocaleString('he-IL')}`}
        />
        <KPICard
          title="פרויקטים פעילים"
          value={metrics.activeProjects}
          icon={BuildingOfficeIcon}
          color="purple"
          subtitle={`מתוך ${projects.length} פרויקטים`}
        />
        <KPICard
          title="סה״כ שעות עבודה"
          value={metrics.totalHours.toLocaleString('he-IL')}
          icon={ClockIcon}
          color="green"
          subtitle={`${works.length} רשומות עבודה`}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Trends */}
        <div className="bg-white rounded-xl shadow-sm border border-content-border p-6">
          <h2 className="text-xl font-bold text-content-text mb-4">מגמת הוצאות לאורך זמן</h2>
          <Chart
            options={expenseTrendChartOptions}
            series={expenseTrendChartSeries}
            type="area"
            height={300}
          />
        </div>

        {/* Work Status Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-content-border p-6">
          <h2 className="text-xl font-bold text-content-text mb-4">התפלגות סטטוס עבודות</h2>
          <Chart
            options={workStatusChartOptions}
            series={workStatusChartSeries}
            type="donut"
            height={300}
          />
        </div>

        {/* Project Costs */}
        <div className="bg-white rounded-xl shadow-sm border border-content-border p-6">
          <h2 className="text-xl font-bold text-content-text mb-4">עלויות לפי פרויקט</h2>
          {metrics.costsByProject.length > 0 ? (
            <Chart
              options={projectCostsChartOptions}
              series={projectCostsChartSeries}
              type="bar"
              height={300}
            />
          ) : (
            <p className="text-gray-500 text-center py-12">אין נתונים להצגה</p>
          )}
        </div>

        {/* Contractor Costs */}
        <div className="bg-white rounded-xl shadow-sm border border-content-border p-6">
          <h2 className="text-xl font-bold text-content-text mb-4">עלויות לפי קבלן</h2>
          {metrics.costsByContractor.length > 0 && contractorCostsChartSeries.some(val => val > 0) ? (
            <Chart
              options={contractorCostsChartOptions}
              series={contractorCostsChartSeries}
              type="pie"
              height={300}
            />
          ) : (
            <p className="text-gray-500 text-center py-12">אין נתונים להצגה</p>
          )}
        </div>
      </div>

      {/* Top Projects Table */}
      <div className="bg-white rounded-xl shadow-sm border border-content-border p-6">
        <h2 className="text-xl font-bold text-content-text mb-4">סיכום פרויקטים</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">פרויקט</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">תקציב</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">הוצאות</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">עבודות</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">סה״כ</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">יתרה</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {metrics.costsByProject
                .sort((a, b) => (b.expenses + b.works) - (a.expenses + a.works))
                .map((project, index) => {
                  const totalCost = project.expenses + project.works;
                  const remaining = project.budget - totalCost;
                  const overBudget = remaining < 0;

                  return (
                    <tr key={index} className={overBudget ? 'bg-red-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {project.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        ₪{project.budget.toLocaleString('he-IL')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        ₪{project.expenses.toLocaleString('he-IL')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        ₪{project.works.toLocaleString('he-IL')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        ₪{totalCost.toLocaleString('he-IL')}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${overBudget ? 'text-red-600' : 'text-green-600'}`}>
                        ₪{remaining.toLocaleString('he-IL')}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Contractors Table */}
      <div className="bg-white rounded-xl shadow-sm border border-content-border p-6">
        <h2 className="text-xl font-bold text-content-text mb-4">סיכום קבלנים</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">קבלן</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">שעות עבודה</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">עלות כוללת</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">ממוצע לשעה</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {metrics.costsByContractor
                .sort((a, b) => b.totalCost - a.totalCost)
                .filter(c => c.totalCost > 0)
                .map((contractor, index) => {
                  const avgHourlyRate = contractor.totalHours > 0
                    ? contractor.totalCost / contractor.totalHours
                    : 0;

                  return (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {contractor.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {contractor.totalHours.toLocaleString('he-IL')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        ₪{contractor.totalCost.toLocaleString('he-IL')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        ₪{avgHourlyRate.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * KPI Card Component
 */
function KPICard({ title, value, icon: Icon, color, subtitle }) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500'
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-content-border p-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-content-text mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}
