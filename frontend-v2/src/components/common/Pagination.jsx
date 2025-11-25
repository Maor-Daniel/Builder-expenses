import React from 'react';
import { ChevronRightIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

/**
 * Pagination component with page numbers and navigation
 */
export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage
}) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const showEllipsis = totalPages > 7;

    if (!showEllipsis) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage <= 3) {
        // Near the beginning
        pages.push(2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Near the end
        pages.push('...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        // In the middle
        pages.push('...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex items-center justify-between">
      {/* Results info */}
      <div className="text-sm text-gray-700">
        מציג <span className="font-medium">{startItem}</span> עד{' '}
        <span className="font-medium">{endItem}</span> מתוך{' '}
        <span className="font-medium">{totalItems}</span> תוצאות
      </div>

      {/* Page controls */}
      <div className="flex items-center gap-2">
        {/* Next button (appears first in RTL) */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={clsx(
            'p-2 rounded-lg border transition-colors',
            currentPage === totalPages
              ? 'border-gray-200 text-gray-400 cursor-not-allowed'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          )}
          aria-label="עמוד הבא"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((page, index) => {
            if (page === '...') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="px-3 py-2 text-gray-400"
                >
                  ...
                </span>
              );
            }

            return (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={clsx(
                  'min-w-[40px] px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  currentPage === page
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Previous button (appears last in RTL) */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={clsx(
            'p-2 rounded-lg border transition-colors',
            currentPage === 1
              ? 'border-gray-200 text-gray-400 cursor-not-allowed'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          )}
          aria-label="עמוד קודם"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
