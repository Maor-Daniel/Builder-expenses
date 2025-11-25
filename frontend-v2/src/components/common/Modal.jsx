import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

/**
 * Reusable Modal component built with Headless UI
 *
 * @param {Boolean} isOpen - Controls modal visibility
 * @param {Function} onClose - Callback to close the modal
 * @param {String} title - Modal title
 * @param {ReactNode} children - Modal content
 * @param {String} size - Modal size: 'sm', 'md', 'lg', 'xl' (default: 'md')
 * @param {Boolean} showCloseButton - Show X button in top right (default: true)
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true
}) {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-7xl'
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" />
        </Transition.Child>

        {/* Modal container */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={clsx(
                  'w-full transform overflow-hidden rounded-2xl bg-white text-right',
                  'shadow-xl transition-all',
                  sizeClasses[size]
                )}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  {/* Close button */}
                  {showCloseButton && (
                    <button
                      onClick={onClose}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="סגור"
                    >
                      <XMarkIcon className="w-6 h-6" />
                    </button>
                  )}

                  {/* Title */}
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-semibold text-gray-900"
                  >
                    {title}
                  </Dialog.Title>

                  {/* Spacer for alignment when close button is hidden */}
                  {!showCloseButton && <div className="w-6" />}
                </div>

                {/* Content */}
                <div className="px-6 py-4">
                  {children}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

/**
 * Modal Footer component for action buttons
 */
Modal.Footer = function ModalFooter({ children, className = '' }) {
  return (
    <div className={clsx(
      'flex items-center justify-start gap-3 px-6 py-4 mt-6',
      'border-t border-gray-200 bg-gray-50',
      className
    )}>
      {children}
    </div>
  );
};

/**
 * Button component for use in modals
 */
Modal.Button = function ModalButton({
  children,
  variant = 'primary',
  onClick,
  disabled = false,
  type = 'button',
  className = ''
}) {
  const variantClasses = {
    primary: 'bg-primary-500 text-white hover:bg-primary-600 focus:ring-primary-500',
    secondary: 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500',
    danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500',
    success: 'bg-green-500 text-white hover:bg-green-600 focus:ring-green-500'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'px-4 py-2 rounded-lg font-medium transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-offset-2',
        disabled && 'opacity-50 cursor-not-allowed',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </button>
  );
};
