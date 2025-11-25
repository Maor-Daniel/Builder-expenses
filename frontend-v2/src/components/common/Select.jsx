import React from 'react';
import clsx from 'clsx';

/**
 * Reusable Select component
 */
export default function Select({
  label,
  name,
  value,
  onChange,
  onBlur,
  options = [],
  error,
  required = false,
  disabled = false,
  placeholder = 'בחר אפשרות',
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
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        className={clsx(
          'w-full px-4 py-2.5 text-right border rounded-lg transition-colors',
          'focus:ring-2 focus:ring-primary-500 focus:border-transparent',
          'appearance-none bg-white',
          disabled && 'bg-gray-100 cursor-not-allowed',
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-gray-300'
        )}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: 'left 0.5rem center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '1.5em 1.5em',
          paddingLeft: '2.5rem'
        }}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-red-500 text-right">{error}</p>
      )}
    </div>
  );
}
