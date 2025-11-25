import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Textarea from '../components/common/Textarea';
import expenseService from '../services/expenseService';
import projectService from '../services/projectService';
import contractorService from '../services/contractorService';

// Payment methods
const PAYMENT_METHODS = [
  { value: 'cash', label: 'מזומן' },
  { value: 'check', label: 'צ׳ק' },
  { value: 'transfer', label: 'העברה בנקאית' },
  { value: 'credit', label: 'כרטיס אשראי' },
  { value: 'other', label: 'אחר' }
];

/**
 * Expenses Page Component
 *
 * Backend API Contract:
 * - projectId (required) - FK to project
 * - contractorId (required) - FK to contractor
 * - invoiceNum (required) - Invoice number
 * - amount (required) - Expense amount
 * - paymentMethod (required) - Payment method
 * - date (required) - Expense date
 * - description (optional) - Additional notes
 * - receiptImage (optional) - Image data object
 */
export default function Expenses() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);

  // Fetch expenses
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const token = await getToken();
      return expenseService.getExpenses(token);
    }
  });

  // Fetch projects for dropdown
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const token = await getToken();
      return projectService.getProjects(token);
    }
  });

  // Fetch contractors for dropdown
  const { data: contractors = [] } = useQuery({
    queryKey: ['contractors'],
    queryFn: async () => {
      const token = await getToken();
      return contractorService.getContractors(token);
    }
  });

  // Create expense mutation
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const token = await getToken();
      return expenseService.createExpense(data, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['expenses']);
      setIsAddModalOpen(false);
      toast.success('ההוצאה נוספה בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Update expense mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const token = await getToken();
      return expenseService.updateExpense(id, data, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['expenses']);
      setIsEditModalOpen(false);
      setSelectedExpense(null);
      toast.success('ההוצאה עודכנה בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Delete expense mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const token = await getToken();
      return expenseService.deleteExpense(id, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['expenses']);
      toast.success('ההוצאה נמחקה בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Handle edit
  const handleEdit = (expense) => {
    setSelectedExpense(expense);
    setIsEditModalOpen(true);
  };

  // Handle delete
  const handleDelete = (expense) => {
    if (window.confirm(`האם למחוק את החשבונית "${expense.invoiceNum}"?`)) {
      deleteMutation.mutate(expense.expenseId);
    }
  };

  // Table columns
  const columns = [
    {
      key: 'date',
      label: 'תאריך',
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString('he-IL')
    },
    {
      key: 'invoiceNum',
      label: 'מספר חשבונית',
      sortable: true
    },
    {
      key: 'projectName',
      label: 'פרויקט',
      sortable: true,
      render: (_, expense) => {
        const project = projects.find(p => p.projectId === expense.projectId);
        return project?.name || expense.projectId;
      }
    },
    {
      key: 'contractorName',
      label: 'קבלן',
      sortable: true,
      render: (_, expense) => {
        const contractor = contractors.find(c => c.contractorId === expense.contractorId);
        return contractor?.name || expense.contractorId;
      }
    },
    {
      key: 'amount',
      label: 'סכום',
      sortable: true,
      render: (value) => `₪${Number(value).toLocaleString('he-IL')}`
    },
    {
      key: 'paymentMethod',
      label: 'אמצעי תשלום',
      sortable: true,
      render: (value) => {
        const method = PAYMENT_METHODS.find(m => m.value === value);
        return method ? method.label : value;
      }
    },
    {
      key: 'actions',
      label: 'פעולות',
      sortable: false,
      render: (_, expense) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(expense);
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            aria-label="ערוך"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(expense);
            }}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="מחק"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="animate-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          <span>הוסף הוצאה</span>
        </button>

        <div>
          <h1 className="text-3xl font-bold text-content-text">הוצאות</h1>
          <p className="text-gray-600 mt-1">ניהול וצפייה בהוצאות הפרויקטים</p>
        </div>
      </div>

      {/* Table */}
      <Table
        data={expenses}
        columns={columns}
        searchable
        searchPlaceholder="חפש לפי חשבונית, פרויקט או קבלן..."
        loading={isLoading}
        emptyMessage="אין הוצאות להצגה. התחל בהוספת הוצאה ראשונה!"
        itemsPerPage={15}
      />

      {/* Add Expense Modal */}
      <ExpenseModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={createMutation.mutate}
        isLoading={createMutation.isPending}
        projects={projects}
        contractors={contractors}
        title="הוסף הוצאה חדשה"
      />

      {/* Edit Expense Modal */}
      {selectedExpense && (
        <ExpenseModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedExpense(null);
          }}
          onSubmit={(data) => updateMutation.mutate({ id: selectedExpense.expenseId, data })}
          isLoading={updateMutation.isPending}
          initialData={selectedExpense}
          projects={projects}
          contractors={contractors}
          title="ערוך הוצאה"
        />
      )}
    </div>
  );
}

/**
 * Expense Modal Component
 *
 * Backend API expects:
 * - projectId (required)
 * - contractorId (required)
 * - invoiceNum (required)
 * - amount (required)
 * - paymentMethod (required)
 * - date (required)
 * - description (optional)
 */
function ExpenseModal({ isOpen, onClose, onSubmit, isLoading, initialData, projects, contractors, title }) {
  const [formData, setFormData] = useState(initialData || {
    projectId: '',
    contractorId: '',
    invoiceNum: '',
    amount: '',
    paymentMethod: '',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });

  const [errors, setErrors] = useState({});

  // Update form data when initialData changes
  React.useEffect(() => {
    if (initialData) {
      setFormData({
        projectId: initialData.projectId || '',
        contractorId: initialData.contractorId || '',
        invoiceNum: initialData.invoiceNum || '',
        amount: initialData.amount || '',
        paymentMethod: initialData.paymentMethod || '',
        date: initialData.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        description: initialData.description || ''
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.projectId) newErrors.projectId = 'יש לבחור פרויקט';
    if (!formData.contractorId) newErrors.contractorId = 'יש לבחור קבלן';
    if (!formData.invoiceNum?.trim()) newErrors.invoiceNum = 'מספר חשבונית הוא שדה חובה';
    if (!formData.amount || Number(formData.amount) <= 0) newErrors.amount = 'סכום חייב להיות מספר חיובי';
    if (!formData.paymentMethod) newErrors.paymentMethod = 'יש לבחור אמצעי תשלום';
    if (!formData.date) newErrors.date = 'תאריך הוא שדה חובה';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit({
        ...formData,
        amount: Number(formData.amount)
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="פרויקט"
            name="projectId"
            value={formData.projectId}
            onChange={handleChange}
            options={projects.map(p => ({ value: p.projectId, label: p.name }))}
            error={errors.projectId}
            required
          />

          <Select
            label="קבלן"
            name="contractorId"
            value={formData.contractorId}
            onChange={handleChange}
            options={contractors.map(c => ({ value: c.contractorId, label: c.name }))}
            error={errors.contractorId}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="מספר חשבונית"
            name="invoiceNum"
            value={formData.invoiceNum}
            onChange={handleChange}
            error={errors.invoiceNum}
            required
            placeholder="לדוגמה: INV-2025-001"
          />

          <Input
            label="סכום"
            name="amount"
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={handleChange}
            error={errors.amount}
            required
            placeholder="0.00"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="אמצעי תשלום"
            name="paymentMethod"
            value={formData.paymentMethod}
            onChange={handleChange}
            options={PAYMENT_METHODS}
            error={errors.paymentMethod}
            required
          />

          <Input
            label="תאריך"
            name="date"
            type="date"
            value={formData.date}
            onChange={handleChange}
            error={errors.date}
            required
          />
        </div>

        <Textarea
          label="תיאור נוסף"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="תיאור או הערות נוספות (אופציונלי)"
          rows={3}
        />

        <Modal.Footer>
          <Modal.Button
            type="submit"
            variant="primary"
            disabled={isLoading}
          >
            {isLoading ? 'שומר...' : initialData ? 'עדכן' : 'הוסף'}
          </Modal.Button>
          <Modal.Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            ביטול
          </Modal.Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
