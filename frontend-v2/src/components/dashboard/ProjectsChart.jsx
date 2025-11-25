import React from 'react';
import ReactApexChart from 'react-apexcharts';

export default function ProjectsChart() {
  const options = {
    chart: {
      type: 'donut',
      fontFamily: 'Rubik, sans-serif',
    },
    labels: ['פעיל', 'הושלם', 'בהמתנה', 'מבוטל'],
    colors: ['#48bb78', '#667eea', '#f6ad55', '#f56565'],
    legend: {
      position: 'bottom',
      horizontalAlign: 'center',
      fontSize: '12px',
      fontFamily: 'Rubik, sans-serif',
      markers: {
        width: 12,
        height: 12,
        radius: 6
      }
    },
    dataLabels: {
      enabled: true,
      style: {
        fontSize: '14px',
        fontFamily: 'Rubik, sans-serif',
        fontWeight: 'bold'
      }
    },
    plotOptions: {
      pie: {
        donut: {
          size: '65%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'סה״כ',
              fontSize: '16px',
              fontWeight: 600,
              color: '#2d3748',
              formatter: function (w) {
                return w.globals.seriesTotals.reduce((a, b) => a + b, 0)
              }
            }
          }
        }
      }
    },
    responsive: [{
      breakpoint: 480,
      options: {
        chart: {
          width: 200
        },
        legend: {
          position: 'bottom'
        }
      }
    }]
  };

  const series = [8, 12, 3, 2]; // Mock data

  return (
    <ReactApexChart
      options={options}
      series={series}
      type="donut"
      height={260}
    />
  );
}