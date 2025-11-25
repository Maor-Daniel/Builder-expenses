import React from 'react';
import { Link } from 'react-router-dom';
import { HomeIcon } from '@heroicons/react/24/outline';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-content-bg px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-primary-500 mb-4">404</p>
        <h1 className="text-2xl font-semibold text-content-text mb-4">
          הדף שחיפשת לא נמצא
        </h1>
        <p className="text-gray-600 mb-8">
          ייתכן שהדף הועבר או נמחק
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <HomeIcon className="w-5 h-5" />
          <span>חזרה לדף הבית</span>
        </Link>
      </div>
    </div>
  );
}