import React from 'react';
import ReactApexChart from 'react-apexcharts';

export default function ExpenseChart() {
  const options = {
    chart: {
      type: 'bar',
      height: 350,
      fontFamily: 'Rubik, sans-serif',
      toolbar: {
        show: false
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 8,
        horizontal: false,
        columnWidth: '60%',
      }
    },
    colors: ['#48bb78', '#f6ad55', '#667eea', '#f56565', '#9f7aea'],
    dataLabels: {
      enabled: false
    },
    xaxis: {
      categories: ['חומרים', 'עבודה', 'ציוד', 'הובלה', 'אחר'],
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
    grid: {
      borderColor: '#e2e8f0',
      strokeDashArray: 4,
    },
    tooltip: {
      enabled: true,
      theme: 'light',
      y: {
        formatter: (value) => `₪${value.toLocaleString('he-IL')}`
      }
    },
    legend: {
      show: false
    }
  };

  const series = [{
    name: 'הוצאות',
    data: [45000, 28000, 15000, 12000, 8000]
  }];

  return (
    <ReactApexChart
      options={options}
      series={series}
      type="bar"
      height={260}
    />
  );
}