import React from 'react';
import clsx from 'clsx';

/**
 * Reusable Textarea component
 */
export default function Textarea({
  label,
  name,
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  required = false,
  disabled = false,
  rows = 4,
  className = '',
  ...props
}) {
  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label
          htmlFor={name}
          className="block text-sm font-medium text-gray-700 mb-2 text-right"
        >
          {label}
          {required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}
      <textarea
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        rows={rows}
        className={clsx(
          'w-full px-4 py-2.5 text-right border rounded-lg transition-colors',
          'focus:ring-2 focus:ring-primary-500 focus:border-transparent',
          'placeholder:text-gray-400 resize-none',
          disabled && 'bg-gray-100 cursor-not-allowed',
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-gray-300'
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-500 text-right">{error}</p>
      )}
    </div>
  );
}
