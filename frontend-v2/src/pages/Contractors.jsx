import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { PlusIcon, PencilIcon, TrashIcon, PhoneIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import contractorService from '../services/contractorService';

/**
 * Contractors Page Component
 *
 * Manages contractor database with:
 * - Contact information (name, phone)
 * - Full CRUD operations
 * - Search and filter functionality
 *
 * Backend API Contract:
 * - name (required) - Contractor name
 * - phone (optional) - Phone number
 */
export default function Contractors() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState(null);

  // Fetch contractors
  const { data: contractors = [], isLoading } = useQuery({
    queryKey: ['contractors'],
    queryFn: async () => {
      const token = await getToken();
      return contractorService.getContractors(token);
    }
  });

  // Create contractor mutation
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const token = await getToken();
      return contractorService.createContractor(data, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contractors']);
      setIsAddModalOpen(false);
      toast.success('הקבלן נוסף בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Update contractor mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const token = await getToken();
      return contractorService.updateContractor(id, data, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contractors']);
      setIsEditModalOpen(false);
      setSelectedContractor(null);
      toast.success('הקבלן עודכן בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Delete contractor mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const token = await getToken();
      return contractorService.deleteContractor(id, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contractors']);
      toast.success('הקבלן נמחק בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Handle edit
  const handleEdit = (contractor) => {
    setSelectedContractor(contractor);
    setIsEditModalOpen(true);
  };

  // Handle delete
  const handleDelete = (contractor) => {
    if (window.confirm(`האם למחוק את הקבלן "${contractor.name}"?`)) {
      deleteMutation.mutate(contractor.contractorId);
    }
  };

  // Table columns
  const columns = [
    {
      key: 'name',
      label: 'שם הקבלן',
      sortable: true,
      width: '40%'
    },
    {
      key: 'phone',
      label: 'טלפון',
      sortable: true,
      width: '30%',
      render: (value) => value ? (
        <a href={`tel:${value}`} className="text-primary-600 hover:text-primary-700 flex items-center gap-1">
          <PhoneIcon className="w-4 h-4" />
          <span className="text-left">{value}</span>
        </a>
      ) : '-'
    },
    {
      key: 'createdAt',
      label: 'תאריך יצירה',
      sortable: true,
      render: (value) => value ? new Date(value).toLocaleDateString('he-IL') : '-'
    },
    {
      key: 'actions',
      label: 'פעולות',
      sortable: false,
      render: (_, contractor) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(contractor);
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            aria-label="ערוך"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(contractor);
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
          <span>הוסף קבלן</span>
        </button>

        <div>
          <h1 className="text-3xl font-bold text-content-text">קבלנים</h1>
          <p className="text-gray-600 mt-1">ניהול וצפייה בקבלנים</p>
        </div>
      </div>

      {/* Table */}
      <Table
        data={contractors}
        columns={columns}
        searchable
        searchPlaceholder="חפש לפי שם או טלפון..."
        loading={isLoading}
        emptyMessage="אין קבלנים להצגה. התחל בהוספת קבלן ראשון!"
        itemsPerPage={15}
      />

      {/* Add Contractor Modal */}
      <ContractorModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={createMutation.mutate}
        isLoading={createMutation.isPending}
        title="הוסף קבלן חדש"
      />

      {/* Edit Contractor Modal */}
      {selectedContractor && (
        <ContractorModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedContractor(null);
          }}
          onSubmit={(data) => updateMutation.mutate({ id: selectedContractor.contractorId, data })}
          isLoading={updateMutation.isPending}
          initialData={selectedContractor}
          title="ערוך קבלן"
        />
      )}
    </div>
  );
}

/**
 * Contractor Modal Component
 *
 * Reusable modal for adding and editing contractors
 * Backend API Contract:
 * - name (required) - Contractor name
 * - phone (optional) - Phone number
 */
function ContractorModal({ isOpen, onClose, onSubmit, isLoading, initialData, title }) {
  const [formData, setFormData] = useState(initialData || {
    name: '',
    phone: ''
  });

  const [errors, setErrors] = useState({});

  // Update form data when initialData changes
  React.useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        phone: initialData.phone || ''
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

  /**
   * Validate Israeli phone format
   * Accepts: 05X-XXXXXXX, 05XXXXXXXXX, 0X-XXXXXXX, etc.
   */
  const validatePhone = (phone) => {
    if (!phone) return true; // Phone is optional
    const phoneRegex = /^0\d{1,2}-?\d{7,8}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'שם הקבלן הוא שדה חובה';
    }

    if (formData.phone && !validatePhone(formData.phone)) {
      newErrors.phone = 'מספר טלפון לא תקין (פורמט: 05X-XXXXXXX)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="שם הקבלן"
          name="name"
          value={formData.name}
          onChange={handleChange}
          error={errors.name}
          required
          placeholder="לדוגמה: יוסי כהן"
        />

        <Input
          label="טלפון"
          name="phone"
          type="tel"
          value={formData.phone}
          onChange={handleChange}
          error={errors.phone}
          placeholder="05X-XXXXXXX"
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
