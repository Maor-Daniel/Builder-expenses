import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  UserCircleIcon,
  BuildingOfficeIcon,
  BellIcon,
  AdjustmentsHorizontalIcon,
  ArrowRightOnRectangleIcon,
  TrashIcon,
  CloudArrowDownIcon,
  CloudArrowUpIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Modal from '../components/common/Modal';

/**
 * Settings Page Component
 *
 * Comprehensive settings interface with:
 * - User profile information (from Clerk)
 * - Company settings (name, default currency)
 * - Notification preferences
 * - Display preferences (date format, number format)
 * - Data management (export/import)
 * - Account actions (sign out)
 *
 * Note: Settings are stored in localStorage for now
 * In production, these should be stored in a backend database
 */
export default function Settings() {
  const { signOut } = useAuth();
  const { user } = useUser();

  // Default settings
  const defaultSettings = {
    companyName: '',
    currency: 'ILS',
    dateFormat: 'he-IL',
    numberFormat: 'he-IL',
    itemsPerPage: 15,
    notifications: {
      emailAlerts: true,
      weeklyReports: true,
      budgetAlerts: true,
      overdueAlerts: true
    }
  };

  const [settings, setSettings] = useState(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(savedSettings) });
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }
  }, []);

  // Handle input changes
  const handleChange = (field, value) => {
    setSettings(prev => {
      const newSettings = { ...prev };

      // Handle nested notification settings
      if (field.startsWith('notifications.')) {
        const notificationField = field.split('.')[1];
        newSettings.notifications = {
          ...prev.notifications,
          [notificationField]: value
        };
      } else {
        newSettings[field] = value;
      }

      return newSettings;
    });
    setHasChanges(true);
  };

  // Save settings
  const handleSave = () => {
    try {
      localStorage.setItem('appSettings', JSON.stringify(settings));
      setHasChanges(false);
      toast.success('ההגדרות נשמרו בהצלחה');
    } catch (error) {
      toast.error('שגיאה בשמירת ההגדרות');
    }
  };

  // Reset to defaults
  const handleReset = () => {
    if (window.confirm('האם לאפס את כל ההגדרות לברירת מחדל?')) {
      setSettings(defaultSettings);
      localStorage.removeItem('appSettings');
      setHasChanges(false);
      toast.success('ההגדרות אופסו לברירת מחדל');
    }
  };

  // Export data
  const handleExport = () => {
    try {
      // Collect all data from localStorage
      const expenses = JSON.parse(localStorage.getItem('expenses') || '[]');
      const projects = JSON.parse(localStorage.getItem('projects') || '[]');
      const contractors = JSON.parse(localStorage.getItem('contractors') || '[]');
      const works = JSON.parse(localStorage.getItem('works') || '[]');

      const exportData = {
        exportDate: new Date().toISOString(),
        settings,
        data: { expenses, projects, contractors, works }
      };

      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `construction-expenses-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('הנתונים יוצאו בהצלחה');
    } catch (error) {
      toast.error('שגיאה בייצוא הנתונים');
    }
  };

  // Import data
  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);

        if (window.confirm('האם לייבא את הנתונים? פעולה זו תדרוס את הנתונים הקיימים.')) {
          // Import settings
          if (importData.settings) {
            setSettings(importData.settings);
            localStorage.setItem('appSettings', JSON.stringify(importData.settings));
          }

          // Import data (this would normally go through the API)
          if (importData.data) {
            if (importData.data.expenses) localStorage.setItem('expenses', JSON.stringify(importData.data.expenses));
            if (importData.data.projects) localStorage.setItem('projects', JSON.stringify(importData.data.projects));
            if (importData.data.contractors) localStorage.setItem('contractors', JSON.stringify(importData.data.contractors));
            if (importData.data.works) localStorage.setItem('works', JSON.stringify(importData.data.works));
          }

          toast.success('הנתונים יובאו בהצלחה');
          setTimeout(() => window.location.reload(), 1000);
        }
      } catch (error) {
        toast.error('שגיאה בייבוא הנתונים - קובץ לא תקין');
      }
    };
    reader.readAsText(file);
  };

  // Clear all data
  const handleClearData = () => {
    localStorage.clear();
    toast.success('כל הנתונים נמחקו');
    setTimeout(() => window.location.reload(), 1000);
  };

  // Sign out
  const handleSignOut = async () => {
    if (window.confirm('האם לצאת מהמערכת?')) {
      try {
        await signOut();
        toast.success('התנתקת בהצלחה');
      } catch (error) {
        toast.error('שגיאה בהתנתקות');
      }
    }
  };

  return (
    <div className="animate-in space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-content-text flex items-center gap-2">
          <AdjustmentsHorizontalIcon className="w-8 h-8" />
          הגדרות
        </h1>
        <p className="text-gray-600 mt-1">ניהול העדפות ופרטי המערכת</p>
      </div>

      {/* User Profile Section */}
      <SettingsSection icon={UserCircleIcon} title="פרופיל משתמש">
        <div className="flex items-center gap-4 mb-6">
          {user?.imageUrl ? (
            <img
              src={user.imageUrl}
              alt={user.fullName || 'User'}
              className="w-20 h-20 rounded-full border-2 border-primary-500"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center">
              <UserCircleIcon className="w-12 h-12 text-primary-600" />
            </div>
          )}
          <div>
            <h3 className="text-xl font-semibold text-content-text">
              {user?.fullName || 'משתמש'}
            </h3>
            <p className="text-gray-600">{user?.primaryEmailAddress?.emailAddress}</p>
            <p className="text-sm text-gray-500 mt-1">
              הצטרף ב-{new Date(user?.createdAt).toLocaleDateString('he-IL')}
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* Company Settings */}
      <SettingsSection icon={BuildingOfficeIcon} title="הגדרות חברה">
        <div className="space-y-4">
          <Input
            label="שם החברה"
            value={settings.companyName}
            onChange={(e) => handleChange('companyName', e.target.value)}
            placeholder="הזן שם חברה"
          />

          <Select
            label="מטבע ברירת מחדל"
            value={settings.currency}
            onChange={(e) => handleChange('currency', e.target.value)}
            options={[
              { value: 'ILS', label: '₪ שקל חדש (ILS)' },
              { value: 'USD', label: '$ דולר אמריקאי (USD)' },
              { value: 'EUR', label: '€ יורו (EUR)' }
            ]}
          />
        </div>
      </SettingsSection>

      {/* Notification Preferences */}
      <SettingsSection icon={BellIcon} title="העדפות התראות">
        <div className="space-y-4">
          <CheckboxSetting
            label="התראות בדוא״ל"
            description="קבל התראות על אירועים חשובים במייל"
            checked={settings.notifications.emailAlerts}
            onChange={(checked) => handleChange('notifications.emailAlerts', checked)}
          />

          <CheckboxSetting
            label="דוחות שבועיים"
            description="קבל סיכום שבועי של פעילות המערכת"
            checked={settings.notifications.weeklyReports}
            onChange={(checked) => handleChange('notifications.weeklyReports', checked)}
          />

          <CheckboxSetting
            label="התראות על חריגת תקציב"
            description="התראה כאשר פרויקט חורג מהתקציב"
            checked={settings.notifications.budgetAlerts}
            onChange={(checked) => handleChange('notifications.budgetAlerts', checked)}
          />

          <CheckboxSetting
            label="התראות על איחורים"
            description="התראה על משימות ופרויקטים שמאחרים"
            checked={settings.notifications.overdueAlerts}
            onChange={(checked) => handleChange('notifications.overdueAlerts', checked)}
          />
        </div>
      </SettingsSection>

      {/* Display Preferences */}
      <SettingsSection icon={AdjustmentsHorizontalIcon} title="העדפות תצוגה">
        <div className="space-y-4">
          <Select
            label="פורמט תאריך"
            value={settings.dateFormat}
            onChange={(e) => handleChange('dateFormat', e.target.value)}
            options={[
              { value: 'he-IL', label: 'עברית (DD/MM/YYYY)' },
              { value: 'en-US', label: 'אנגלית (MM/DD/YYYY)' },
              { value: 'en-GB', label: 'בריטית (DD/MM/YYYY)' }
            ]}
          />

          <Select
            label="פורמט מספרים"
            value={settings.numberFormat}
            onChange={(e) => handleChange('numberFormat', e.target.value)}
            options={[
              { value: 'he-IL', label: 'עברית (1,234.56)' },
              { value: 'en-US', label: 'אנגלית (1,234.56)' },
              { value: 'de-DE', label: 'גרמנית (1.234,56)' }
            ]}
          />

          <Select
            label="מספר רשומות בטבלה"
            value={settings.itemsPerPage}
            onChange={(e) => handleChange('itemsPerPage', Number(e.target.value))}
            options={[
              { value: 10, label: '10 רשומות' },
              { value: 15, label: '15 רשומות' },
              { value: 25, label: '25 רשומות' },
              { value: 50, label: '50 רשומות' }
            ]}
          />
        </div>
      </SettingsSection>

      {/* Data Management */}
      <SettingsSection icon={CloudArrowDownIcon} title="ניהול נתונים">
        <div className="space-y-3">
          <button
            onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <CloudArrowDownIcon className="w-5 h-5" />
            <span>ייצא את כל הנתונים</span>
          </button>

          <label className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer">
            <CloudArrowUpIcon className="w-5 h-5" />
            <span>ייבא נתונים</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>

          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <TrashIcon className="w-5 h-5" />
            <span>מחק את כל הנתונים</span>
          </button>
        </div>

        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>שים לב:</strong> ייצוא הנתונים יוצר קובץ גיבוי שניתן לייבא בחזרה. ייבוא נתונים ידרוס את הנתונים הקיימים.
          </p>
        </div>
      </SettingsSection>

      {/* Save/Reset Buttons */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
            hasChanges
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          שמור שינויים
        </button>

        <button
          onClick={handleReset}
          className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
        >
          אפס לברירת מחדל
        </button>
      </div>

      {/* Sign Out */}
      <div className="pt-6 border-t border-gray-200">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
          <span>התנתק מהמערכת</span>
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="אישור מחיקת נתונים"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-semibold">אזהרה: פעולה זו בלתי הפיכה!</p>
            <p className="text-red-700 mt-2">
              כל הנתונים שלך יימחקו לצמיתות, כולל:
            </p>
            <ul className="list-disc list-inside text-red-700 mt-2 space-y-1">
              <li>הוצאות</li>
              <li>פרויקטים</li>
              <li>קבלנים</li>
              <li>רשומות עבודה</li>
              <li>הגדרות אישיות</li>
            </ul>
          </div>

          <p className="text-gray-700">
            מומלץ לייצא גיבוי לפני מחיקת הנתונים.
          </p>
        </div>

        <Modal.Footer>
          <Modal.Button
            variant="primary"
            onClick={() => {
              handleClearData();
              setIsDeleteModalOpen(false);
            }}
            className="bg-red-600 hover:bg-red-700"
          >
            מחק הכל
          </Modal.Button>
          <Modal.Button
            variant="secondary"
            onClick={() => setIsDeleteModalOpen(false)}
          >
            ביטול
          </Modal.Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

/**
 * Settings Section Component
 */
function SettingsSection({ icon: Icon, title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-content-border p-6">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200">
        <div className="p-2 bg-primary-100 rounded-lg">
          <Icon className="w-6 h-6 text-primary-600" />
        </div>
        <h2 className="text-xl font-bold text-content-text">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/**
 * Checkbox Setting Component
 */
function CheckboxSetting({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
      />
      <div className="flex-1">
        <p className="font-medium text-content-text">{label}</p>
        <p className="text-sm text-gray-600 mt-0.5">{description}</p>
      </div>
    </label>
  );
}
