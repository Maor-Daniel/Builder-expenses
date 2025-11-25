import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Textarea from '../components/common/Textarea';
import projectService from '../services/projectService';

// Project statuses
const PROJECT_STATUSES = [
  { value: 'active', label: 'פעיל' },
  { value: 'completed', label: 'הושלם' },
  { value: 'on-hold', label: 'בהמתנה' },
  { value: 'cancelled', label: 'בוטל' }
];

// Status badge colors
const STATUS_COLORS = {
  active: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  'on-hold': 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-red-100 text-red-800'
};

/**
 * Projects Page Component
 *
 * Backend API Contract:
 * - name (required) - Project name
 * - startDate (required) - Project start date
 * - description (optional) - Project description
 * - status (optional) - Default: 'active'
 * - budget (optional) - Project budget
 * - spentAmount (optional) - Managed by backend
 * - assignedTo (optional) - User IDs array
 * - isPublic (optional) - Default: true
 */
export default function Projects() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  // Fetch projects
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const token = await getToken();
      return projectService.getProjects(token);
    }
  });

  // Create project mutation
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const token = await getToken();
      return projectService.createProject(data, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects']);
      setIsAddModalOpen(false);
      toast.success('הפרויקט נוסף בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Update project mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const token = await getToken();
      return projectService.updateProject(id, data, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects']);
      setIsEditModalOpen(false);
      setSelectedProject(null);
      toast.success('הפרויקט עודכן בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Delete project mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const token = await getToken();
      return projectService.deleteProject(id, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects']);
      toast.success('הפרויקט נמחק בהצלחה');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Handle edit
  const handleEdit = (project) => {
    setSelectedProject(project);
    setIsEditModalOpen(true);
  };

  // Handle delete
  const handleDelete = (project) => {
    if (window.confirm(`האם למחוק את הפרויקט "${project.name}"?`)) {
      deleteMutation.mutate(project.projectId);
    }
  };

  // Table columns
  const columns = [
    {
      key: 'name',
      label: 'שם הפרויקט',
      sortable: true,
      width: '25%'
    },
    {
      key: 'status',
      label: 'סטטוס',
      sortable: true,
      render: (value) => {
        const status = PROJECT_STATUSES.find(s => s.value === value);
        return (
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[value] || 'bg-gray-100 text-gray-800'}`}>
            {status ? status.label : value}
          </span>
        );
      }
    },
    {
      key: 'startDate',
      label: 'תאריך התחלה',
      sortable: true,
      render: (value) => value ? new Date(value).toLocaleDateString('he-IL') : '-'
    },
    {
      key: 'budget',
      label: 'תקציב',
      sortable: true,
      render: (value) => value ? `₪${Number(value).toLocaleString('he-IL')}` : '-'
    },
    {
      key: 'totalCost',
      label: 'עלות בפועל',
      sortable: true,
      render: (value, row) => {
        const cost = Number(value || 0);
        const budget = Number(row.budget || 0);
        const overBudget = budget > 0 && cost > budget;

        return (
          <span className={overBudget ? 'text-red-600 font-medium' : ''}>
            {cost > 0 ? `₪${cost.toLocaleString('he-IL')}` : '-'}
          </span>
        );
      }
    },
    {
      key: 'actions',
      label: 'פעולות',
      sortable: false,
      render: (_, project) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(project);
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            aria-label="ערוך"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(project);
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
          <span>הוסף פרויקט</span>
        </button>

        <div>
          <h1 className="text-3xl font-bold text-content-text">פרויקטים</h1>
          <p className="text-gray-600 mt-1">ניהול וצפייה בפרויקטים</p>
        </div>
      </div>

      {/* Table */}
      <Table
        data={projects}
        columns={columns}
        searchable
        searchPlaceholder="חפש לפי שם פרויקט או סטטוס..."
        loading={isLoading}
        emptyMessage="אין פרויקטים להצגה. התחל בהוספת פרויקט ראשון!"
        itemsPerPage={10}
      />

      {/* Add Project Modal */}
      <ProjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={createMutation.mutate}
        isLoading={createMutation.isPending}
        title="הוסף פרויקט חדש"
      />

      {/* Edit Project Modal */}
      {selectedProject && (
        <ProjectModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedProject(null);
          }}
          onSubmit={(data) => updateMutation.mutate({ id: selectedProject.projectId, data })}
          isLoading={updateMutation.isPending}
          initialData={selectedProject}
          title="ערוך פרויקט"
        />
      )}
    </div>
  );
}

/**
 * Project Modal Component
 *
 * Backend API expects:
 * - name (required)
 * - startDate (required)
 * - description (optional)
 * - status (optional)
 * - budget (optional)
 */
function ProjectModal({ isOpen, onClose, onSubmit, isLoading, initialData, title }) {
  const [formData, setFormData] = useState(initialData || {
    name: '',
    status: 'active',
    startDate: new Date().toISOString().split('T')[0],
    budget: '',
    description: ''
  });

  const [errors, setErrors] = useState({});

  // Update form data when initialData changes
  React.useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        startDate: initialData.startDate
          ? new Date(initialData.startDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]
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

    if (!formData.name?.trim()) {
      newErrors.name = 'שם הפרויקט הוא שדה חובה';
    }

    if (!formData.status) {
      newErrors.status = 'יש לבחור סטטוס';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'תאריך התחלה הוא שדה חובה';
    }

    if (formData.budget && Number(formData.budget) < 0) {
      newErrors.budget = 'תקציב חייב להיות מספר חיובי';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      const submitData = {
        ...formData,
        budget: formData.budget ? Number(formData.budget) : undefined
      };
      onSubmit(submitData);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="שם הפרויקט"
          name="name"
          value={formData.name}
          onChange={handleChange}
          error={errors.name}
          required
          placeholder="לדוגמה: בניית בית משפחתי"
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="סטטוס"
            name="status"
            value={formData.status}
            onChange={handleChange}
            options={PROJECT_STATUSES}
            error={errors.status}
            required
          />

          <Input
            label="תאריך התחלה"
            name="startDate"
            type="date"
            value={formData.startDate}
            onChange={handleChange}
            error={errors.startDate}
            required
          />
        </div>

        <Input
          label="תקציב"
          name="budget"
          type="number"
          step="0.01"
          value={formData.budget}
          onChange={handleChange}
          error={errors.budget}
          placeholder="0.00"
        />

        <Textarea
          label="תיאור הפרויקט"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="תיאור מפורט של הפרויקט (אופציונלי)"
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
