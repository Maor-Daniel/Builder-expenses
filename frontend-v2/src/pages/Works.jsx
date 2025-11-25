import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { PlusIcon, PencilIcon, TrashIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Textarea from '../components/common/Textarea';
import workService from '../services/workService';
import projectService from '../services/projectService';
import contractorService from '../services/contractorService';

// Work statuses - Backend default is 'planned'
const WORK_STATUSES = [
  { value: 'planned', label: 'מתוכנן' },
  { value: 'in-progress', label: 'בביצוע' },
  { value: 'completed', label: 'הושלם' }
];

const STATUS_COLORS = {
  planned: 'bg-yellow-100 text-yellow-800',
  'in-progress': 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800'
};

/**
 * Works Page Component
 *
 * Backend API Contract:
 * - WorkName (required) - Name of the work
 * - projectId (required) - FK to project
 * - contractorId (required) - FK to contractor
 * - TotalWorkCost (required) - Total cost as number
 * - description (optional) - Additional notes
 * - status (optional) - Default: 'planned'
 * - expenseId (optional) - Link to expense
 */
export default function Works() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedWork, setSelectedWork] = useState(null);

  // Fetch works
  const { data: works = [], isLoading } = useQuery({
    queryKey: ['works'],
    queryFn: async () => {
      const token = await getToken();
      return workService.getWorks(token);
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

  // Create work mutation
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const token = await getToken();
      return workService.createWork(data, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['works']);
      setIsAddModalOpen(false);
      toast.success('העבודה נוספה בהצלחה');
    },
    onError: (error) => toast.error(`שגיאה: ${error.message}`)
  });

  // Update work mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const token = await getToken();
      return workService.updateWork(id, data, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['works']);
      setIsEditModalOpen(false);
      setSelectedWork(null);
      toast.success('העבודה עודכנה בהצלחה');
    },
    onError: (error) => toast.error(`שגיאה: ${error.message}`)
  });

  // Delete work mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const token = await getToken();
      return workService.deleteWork(id, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['works']);
      toast.success('העבודה נמחקה בהצלחה');
    },
    onError: (error) => toast.error(`שגיאה: ${error.message}`)
  });

  // Table columns
  const columns = [
    {
      key: 'WorkName',
      label: 'שם העבודה',
      sortable: true
    },
    {
      key: 'projectName',
      label: 'פרויקט',
      sortable: true,
      render: (_, work) => {
        const project = projects.find(p => p.projectId === work.projectId);
        return project?.name || work.projectId;
      }
    },
    {
      key: 'contractorName',
      label: 'קבלן',
      sortable: true,
      render: (_, work) => {
        const contractor = contractors.find(c => c.contractorId === work.contractorId);
        return contractor?.name || work.contractorId;
      }
    },
    {
      key: 'TotalWorkCost',
      label: 'עלות כוללת',
      sortable: true,
      render: (value) => `₪${Number(value).toLocaleString('he-IL')}`
    },
    {
      key: 'status',
      label: 'סטטוס',
      sortable: true,
      render: (value) => {
        const status = WORK_STATUSES.find(s => s.value === value);
        return (
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[value] || 'bg-gray-100 text-gray-800'}`}>
            {status ? status.label : value}
          </span>
        );
      }
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
      render: (_, work) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedWork(work); setIsEditModalOpen(true); }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (window.confirm(`האם למחוק את העבודה "${work.WorkName}"?`)) deleteMutation.mutate(work.workId); }}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          <span>הוסף עבודה</span>
        </button>
        <div>
          <h1 className="text-3xl font-bold text-content-text">עבודות</h1>
          <p className="text-gray-600 mt-1">ניהול וצפייה בעבודות</p>
        </div>
      </div>

      <Table
        data={works}
        columns={columns}
        searchable
        searchPlaceholder="חפש לפי שם עבודה, פרויקט או קבלן..."
        loading={isLoading}
        emptyMessage="אין עבודות להצגה. התחל בהוספת עבודה ראשונה!"
        itemsPerPage={15}
      />

      <WorkModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={createMutation.mutate}
        isLoading={createMutation.isPending}
        projects={projects}
        contractors={contractors}
        title="הוסף עבודה חדשה"
      />

      {selectedWork && (
        <WorkModal
          isOpen={isEditModalOpen}
          onClose={() => { setIsEditModalOpen(false); setSelectedWork(null); }}
          onSubmit={(data) => updateMutation.mutate({ id: selectedWork.workId, data })}
          isLoading={updateMutation.isPending}
          initialData={selectedWork}
          projects={projects}
          contractors={contractors}
          title="ערוך עבודה"
        />
      )}
    </div>
  );
}

/**
 * Work Modal Component
 *
 * Backend API expects:
 * - WorkName (required)
 * - projectId (required)
 * - contractorId (required)
 * - TotalWorkCost (required)
 * - description (optional)
 * - status (optional)
 */
function WorkModal({ isOpen, onClose, onSubmit, isLoading, initialData, projects, contractors, title }) {
  const [formData, setFormData] = useState(initialData || {
    WorkName: '',
    projectId: '',
    contractorId: '',
    TotalWorkCost: '',
    description: '',
    status: 'planned'
  });

  const [errors, setErrors] = useState({});

  React.useEffect(() => {
    if (initialData) {
      setFormData({
        WorkName: initialData.WorkName || '',
        projectId: initialData.projectId || '',
        contractorId: initialData.contractorId || '',
        TotalWorkCost: initialData.TotalWorkCost || '',
        description: initialData.description || '',
        status: initialData.status || 'planned'
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.WorkName?.trim()) newErrors.WorkName = 'שם העבודה הוא שדה חובה';
    if (!formData.projectId) newErrors.projectId = 'יש לבחור פרויקט';
    if (!formData.contractorId) newErrors.contractorId = 'יש לבחור קבלן';
    if (!formData.TotalWorkCost || Number(formData.TotalWorkCost) <= 0) newErrors.TotalWorkCost = 'עלות חייבת להיות מספר חיובי';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit({
        ...formData,
        TotalWorkCost: Number(formData.TotalWorkCost)
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="שם העבודה"
          name="WorkName"
          value={formData.WorkName}
          onChange={handleChange}
          error={errors.WorkName}
          required
          placeholder="לדוגמה: התקנת חשמל"
        />

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
            label="עלות כוללת"
            name="TotalWorkCost"
            type="number"
            step="0.01"
            value={formData.TotalWorkCost}
            onChange={handleChange}
            error={errors.TotalWorkCost}
            required
            placeholder="0.00"
          />

          <Select
            label="סטטוס"
            name="status"
            value={formData.status}
            onChange={handleChange}
            options={WORK_STATUSES}
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
          <Modal.Button type="submit" variant="primary" disabled={isLoading}>
            {isLoading ? 'שומר...' : initialData ? 'עדכן' : 'הוסף'}
          </Modal.Button>
          <Modal.Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            ביטול
          </Modal.Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
