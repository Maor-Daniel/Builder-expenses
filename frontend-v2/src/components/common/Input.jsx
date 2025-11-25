import React from 'react';
import clsx from 'clsx';

/**
 * Reusable Input component with validation support
 */
export default function Input({
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  required = false,
  disabled = false,
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
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={clsx(
          'w-full px-4 py-2.5 text-right border rounded-lg transition-colors',
          'focus:ring-2 focus:ring-primary-500 focus:border-transparent',
          'placeholder:text-gray-400',
          disabled && 'bg-gray-100 cursor-not-allowed',
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-gray-300',
          type === 'number' && 'text-left'
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-500 text-right">{error}</p>
      )}
    </div>
  );
}
