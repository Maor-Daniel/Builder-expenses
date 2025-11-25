import React, { useState, useEffect } from 'react';
import ReactApexChart from 'react-apexcharts';

export default function RevenueChart() {
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    // Mock data - will be replaced with API call
    const mockData = {
      labels: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני'],
      expenses: [30000, 35000, 32000, 45000, 55000, 48000]
    };

    setChartData(mockData);
  }, []);

  if (!chartData) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const options = {
    chart: {
      type: 'area',
      height: 350,
      fontFamily: 'Rubik, sans-serif',
      toolbar: {
        show: false
      },
      zoom: {
        enabled: false
      }
    },
    colors: ['#667eea'],
    dataLabels: {
      enabled: false
    },
    stroke: {
      curve: 'smooth',
      width: 3
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.6,
        opacityTo: 0.1,
        stops: [0, 90, 100]
      }
    },
    grid: {
      show: true,
      borderColor: '#e2e8f0',
      strokeDashArray: 4,
    },
    xaxis: {
      categories: chartData.labels,
      labels: {
        style: {
          colors: '#718096',
          fontSize: '12px'
        }
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: '#718096',
          fontSize: '12px'
        },
        formatter: (value) => `₪${value.toLocaleString('he-IL')}`
      }
    },
    tooltip: {
      enabled: true,
      theme: 'light',
      style: {
        fontSize: '12px',
        fontFamily: 'Rubik, sans-serif'
      },
      y: {
        formatter: (value) => `₪${value.toLocaleString('he-IL')}`
      }
    }
  };

  const series = [{
    name: 'הוצאות',
    data: chartData.expenses
  }];

  return (
    <ReactApexChart
      options={options}
      series={series}
      type="area"
      height={260}
    />
  );
}