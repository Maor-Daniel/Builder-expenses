import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Sidebar from './Sidebar';

export default function MobileNav({ isOpen, onClose }) {
  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50 md:hidden">
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="transition-opacity duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        </Transition.Child>

        {/* Sidebar Panel */}
        <div className="fixed inset-0 flex">
          <Transition.Child
            as={Fragment}
            enter="transition duration-300 transform"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="transition duration-200 transform"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <Dialog.Panel className="relative right-0 flex w-full max-w-xs flex-1">
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 left-4 z-10 p-2 text-sidebar-text hover:bg-sidebar-hover rounded-lg transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>

              {/* Sidebar Content */}
              <Sidebar className="w-full" />
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}