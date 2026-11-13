import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { usePlanning } from '../../lib/planning/usePlanning';
import { calculateAverageCompetencies } from '../../lib/calculations';
import { KPICard } from '../../components/common/KPICard';
import { PlanningStatusCard } from '../time-aware/PlanningStatusCard';
import { summarizeCalendar, validateConfig } from '../../lib/planning/calendar';
import { workspaceProgress } from '../../lib/planning/progress';
import { Card, CardHeader, CardBody } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { CompetencyRadarChart } from '../../components/charts/CompetencyRadarChart';
import { ClassHeatmap } from '../../components/charts/ClassHeatmap';
import {
  Users,
  BookOpen,
  Clock,
  Sparkles,
  ScanLine,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export const TeacherDashboard: React.FC = () => {
  const { classes, students, homeworkRemediations } = useData();
  const planned = usePlanning(); // calendar and plans are the school's / teacher's relational records
  const calendar = validateConfig(planned.workspace.config).length ? null : summarizeCalendar(planned.workspace.config);
  const today = new Date().toISOString().slice(0, 10);
  const remainingInstructionalDays = calendar ? calendar.instructionalDates.filter((d) => d >= today).length : null;
  const progress = workspaceProgress(planned.workspace.plans.filter((x) => x.status === 'APPROVED'));
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Class 8-A context
  const targetClass = classes.find((c) => c.id === 'class-8a') || classes[0];
  const classStudents = students.filter((s) => s.classId === targetClass.id);
  const avgCompetencies = calculateAverageCompetencies(classStudents);

  const baselineComparison = {
    LU: 68,
    CU: 70,
    AU: 62,
    CT: 58,
    overall: 65,
  };


  return (
    <div className="space-y-6">
      {/* Teacher Welcome & Pacing Deficit Banner */}
      <div className="bg-white p-5 rounded-2xl border border-surface-border shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">
              Namaste, {currentUser?.name || 'Vikram Sengupta'}
            </h1>
            <Badge variant="teal" size="sm">
              TGT Lead Educator
            </Badge>
          </div>
          <p className="text-xs text-content-secondary mt-1">
            Assigned: Class 8-A (32 students) & Class 9-B (28 students) • Sunrise Public Campus
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/teacher/scan-review')}
            icon={<ScanLine className="w-4 h-4 text-teal-600" />}
          >
            Review Scanned Sheets
          </Button>
          <Button
            variant="teal"
            size="sm"
            onClick={() => navigate('/teacher/time-aware')}
            icon={<Clock className="w-4 h-4" />}
          >
            Time-Aware Pacing Center
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Assigned Students"
          value={classStudents.length}
          subtitle="Class 8-A Active Roster"
          icon={<Users className="w-5 h-5 text-navy-800" />}
          iconBg="bg-navy-50"
          onClick={() => navigate('/teacher/classes')}
        />
        <KPICard
          title="Class Baseline (NEP)"
          value={`${avgCompetencies.overall}%`}
          subtitle="+7% growth from Cycle 1 baseline"
          icon={<TrendingUp className="w-5 h-5 text-teal-600" />}
          iconBg="bg-teal-50"
          trend={{ value: '+7%', isPositive: true, label: 'vs Cycle 1' }}
        />
        <KPICard
          title="School Days Left"
          value={remainingInstructionalDays == null ? '—' : `${remainingInstructionalDays}d`}
          subtitle={
            calendar
                ? `Instructional days from today · Academic Configuration ${planned.workspace.config.year}`
                : 'Academic Configuration not valid'
          }
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          iconBg="bg-amber-50"
          onClick={() => navigate('/teacher/time-aware')}
        />
        <KPICard
          title="Differentiated Remediations"
          value={homeworkRemediations.length}
          subtitle="Targeted LU/AU assignments"
          icon={<Sparkles className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          onClick={() => navigate('/teacher/remediation')}
        />
      </div>

      {/* Middle Grid: Competency Radar & Quick Action Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (1 col): Class 8-A Competency Radar */}
        <Card>
          <CardHeader
            title="Competency Baseline Profile"
            subtitle="Comparing Class 8-A current vs Cycle 1 baseline"
            action={
              <Badge variant="teal" size="sm">
                4-Dimensional
              </Badge>
            }
          />
          <CardBody>
            <CompetencyRadarChart
              current={avgCompetencies}
              baseline={baselineComparison}
              benchmarkName="Cycle 1 Baseline"
              height={260}
            />
            <div className="mt-3 pt-3 border-t border-surface-border grid grid-cols-2 gap-2 text-xs text-center">
              <div className="p-2 bg-surface-bg rounded-lg">
                <span className="text-content-secondary text-[11px] block">Language (LU)</span>
                <span className="font-bold text-navy-800">{avgCompetencies.LU}%</span>
              </div>
              <div className="p-2 bg-surface-bg rounded-lg">
                <span className="text-content-secondary text-[11px] block">Concept (CU)</span>
                <span className="font-bold text-emerald-700">{avgCompetencies.CU}%</span>
              </div>
              <div className="p-2 bg-surface-bg rounded-lg">
                <span className="text-content-secondary text-[11px] block">Application (AU)</span>
                <span className="font-bold text-amber-700">{avgCompetencies.AU}%</span>
              </div>
              <div className="p-2 bg-surface-bg rounded-lg">
                <span className="text-content-secondary text-[11px] block">Critical Thinking (CT)</span>
                <span className="font-bold text-indigo-700">{avgCompetencies.CT}%</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Right (2 cols): Daily Curriculum progress & Quick Navigation */}
        <div className="lg:col-span-2 space-y-6">
          <PlanningStatusCard link="/teacher/curriculum-180" linkLabel="View Daily Curriculum" />

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => navigate('/teacher/assessments')}
              className="p-4 bg-white rounded-xl border border-surface-border hover:border-teal-400 hover:shadow-card cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-50 text-teal-600 rounded-lg">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-content-primary text-sm">Assessment Builder</h4>
                  <p className="text-xs text-content-secondary">Create Cycle 3 test tagged to LU, CU, AU, CT</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-content-muted" />
            </div>

            <div
              onClick={() => navigate('/teacher/scan-review')}
              className="p-4 bg-white rounded-xl border border-surface-border hover:border-teal-400 hover:shadow-card cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
                  <ScanLine className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-content-primary text-sm">Scan Review (OCR)</h4>
                  <p className="text-xs text-content-secondary">Verify offline handwritten answer sheets</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-content-muted" />
            </div>
          </div>
        </div>
      </div>

      {/* Classroom Competency Heatmap */}
      <Card>
        <CardHeader
          title="Class 8-A Competency Heatmap Matrix"
          subtitle="Student-by-student mastery across Language (LU), Concept (CU), Application (AU), and Critical Thinking (CT)"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/teacher/classes')}
              icon={<Users className="w-3.5 h-3.5" />}
            >
              Full Roster Detail
            </Button>
          }
        />
        <CardBody>
          <ClassHeatmap
            students={classStudents}
            onTriggerRemediation={(st) => {
              navigate('/teacher/remediation');
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
};
