import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { calculateAverageCompetencies, calculateTimeAwarePacing } from '../../lib/calculations';
import { KPICard } from '../../components/common/KPICard';
import { Card, CardHeader, CardBody } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { CompetencyRadarChart } from '../../components/charts/CompetencyRadarChart';
import { CompetencyBarChart } from '../../components/charts/CompetencyBarChart';
import { ApiError, apiClient } from '../../lib/apiClient';
import { CLASS_NAME_HELP } from '../../lib/className';
import { SchoolOverview } from '../../components/school/SchoolOverview';
import {
  School,
  Users,
  BookOpen,
  Clock,
  Sparkles,
  AlertTriangle,
  Send,
  CheckCircle2,
  TrendingUp,
  FileSpreadsheet,
  PlusCircle,
} from 'lucide-react';

export const PrincipalDashboard: React.FC = () => {
  const { schools, addClass } = useData();
  const { currentUser, currentSchoolId } = useAuth();
  const navigate = useNavigate();

  const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false);
  const [announceText, setAnnounceText] = useState('');
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [className, setClassName] = useState('');
  const [classError, setClassError] = useState<string | null>(null);
  const [savingClass, setSavingClass] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const activeSchool = schools.find((s) => s.id === currentSchoolId) || schools[0];

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceText.trim()) return;
    try {
      await apiClient.announcements.create({ title: 'Message from the Principal', content: announceText.trim(), target_role: 'teacher' });
      setToast('Announcement sent to all teachers.');
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not send the announcement.');
    }
    setIsAnnounceModalOpen(false);
    setAnnounceText('');
    setTimeout(() => setToast(null), 4000);
  };

  const handleAddClass = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingClass(true);
    setClassError(null);
    try {
      await apiClient.classes.create(activeSchool.id, className);
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) {
        setClassError(error.message || 'A class with this name already exists');
        setSavingClass(false);
        return;
      }
    }
    const saved = addClass(activeSchool.id, className);
    setSavingClass(false);
    if (!saved.ok) {
      setClassError(saved.error);
      return;
    }
    setClassName('');
    setIsClassModalOpen(false);
    setToast(`Added ${saved.name}.`);
    setTimeout(() => setToast(null), 4000);
  };

  if (!activeSchool) return <p role="status" className="p-4 text-sm text-content-secondary">Loading your school…</p>;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-navy-900 text-white px-4 py-3 rounded-xl shadow-modal border border-teal-500/40 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-surface-border shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">
              {activeSchool.name}
            </h1>
            <Badge variant="teal" size="sm">
              Campus Lead
            </Badge>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            {activeSchool.location}, {activeSchool.state} · CBSE · Session {activeSchool.academicYear} · Principal {activeSchool.principalName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAnnounceModalOpen(true)}
            icon={<Send className="w-4 h-4" />}
          >
            Broadcast to Faculty
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setClassName('');
              setClassError(null);
              setIsClassModalOpen(true);
            }}
            icon={<PlusCircle className="w-4 h-4" />}
          >
            Add Class
          </Button>
          <Button
            variant="teal"
            size="sm"
            onClick={() => navigate('/teacher/time-aware')}
            icon={<Clock className="w-4 h-4" />}
          >
            Review Pacing & Lost Days
          </Button>
        </div>
      </div>

      <SchoolOverview schoolIds={[activeSchool.id]} />

      {/* Quick Navigation to Principal Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => navigate('/principal/teachers')}
          className="p-4 bg-white rounded-xl border border-surface-border hover:border-teal-400 hover:shadow-card cursor-pointer transition-all"
        >
          <span className="font-bold text-navy-900 text-sm block">Faculty Class Assignments</span>
          <p className="text-xs text-content-secondary mt-1">
            Assign teachers to classes & subjects, balance teaching workloads
          </p>
        </div>

        <div
          onClick={() => navigate('/principal/curriculum')}
          className="p-4 bg-white rounded-xl border border-surface-border hover:border-teal-400 hover:shadow-card cursor-pointer transition-all"
        >
          <span className="font-bold text-navy-900 text-sm block">Curriculum Oversight</span>
          <p className="text-xs text-content-secondary mt-1">
            Monitor syllabus completion across subjects and review compression
          </p>
        </div>

        <div
          onClick={() => navigate('/principal/reports')}
          className="p-4 bg-white rounded-xl border border-surface-border hover:border-teal-400 hover:shadow-card cursor-pointer transition-all"
        >
          <span className="font-bold text-navy-900 text-sm block">NEP Compliance Reports</span>
          <p className="text-xs text-content-secondary mt-1">
            Download and export school-wide competency progress summaries
          </p>
        </div>
      </div>

      <Modal
        isOpen={isClassModalOpen}
        onClose={() => setIsClassModalOpen(false)}
        title="Add Class"
        subtitle={CLASS_NAME_HELP}
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button variant="secondary" size="md" onClick={() => setIsClassModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="teal" size="md" onClick={handleAddClass} loading={savingClass}>
              Save Class
            </Button>
          </div>
        }
      >
        <form onSubmit={handleAddClass} className="space-y-3 text-sm">
          <label className="block font-semibold text-content-primary">
            Class name
            <input
              value={className}
              onChange={(event) => {
                setClassName(event.target.value);
                setClassError(null);
              }}
              placeholder="8A or 8 Name1"
              className="mt-1 w-full px-3 py-2 bg-white border border-surface-border rounded-lg text-sm font-normal"
            />
          </label>
          <p className="text-xs text-content-secondary leading-relaxed">
            Letter sections look like 8A, 8B, or 8X. Named sections look like 8 Name1. Grade is 1 to 12.
          </p>
          {classError && <p className="text-sm font-semibold text-rose-700">{classError}</p>}
        </form>
      </Modal>

      {/* Broadcast Announcement Modal */}
      <Modal
        isOpen={isAnnounceModalOpen}
        onClose={() => setIsAnnounceModalOpen(false)}
        title="Broadcast Announcement to Campus Faculty"
        subtitle={`Send a message to every teacher at ${activeSchool.name}`}
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button variant="secondary" size="md" onClick={() => setIsAnnounceModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="teal" size="md" onClick={handleSendAnnouncement}>
              Send Announcement
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSendAnnouncement} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-content-primary mb-1">Message Content</label>
            <textarea
              rows={4}
              required
              value={announceText}
              onChange={(e) => setAnnounceText(e.target.value)}
              placeholder="e.g. Please review the 60/40 compacting proposals for Mathematics and Science ahead of tomorrow's faculty meeting..."
              className="w-full px-3 py-2 bg-white border border-surface-border rounded-lg text-xs"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};

