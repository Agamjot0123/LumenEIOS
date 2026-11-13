import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  BookOpen,
  Calendar,
  Clock,
  ScanLine,
  FileSpreadsheet,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  BarChart3,
  Award,
  HeartHandshake,
  Settings,
  Library,
  ScrollText,
} from 'lucide-react';
import { cn } from '../../lib/utils';

/** `drawer` renders the same navigation inside the mobile slide-out (the desktop sidebar is hidden below md). */
export const Sidebar: React.FC<{ drawer?: boolean }> = ({ drawer = false }) => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const role = currentUser?.role || 'admin';

  interface NavItem {
    label: string;
    path: string;
    icon: React.ReactNode;
    badge?: string;
    highlight?: boolean;
  }

  const getNavItems = (): NavItem[] => {
    switch (role) {
      case 'admin':
        return [
          { label: 'Platform Overview', path: '/admin/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
          { label: 'Schools Directory', path: '/admin/schools', icon: <Building2 className="w-4 h-4" /> },
          { label: 'Users & Roles', path: '/admin/users', icon: <Users className="w-4 h-4" /> },
          { label: 'Academic Config', path: '/admin/academic-config', icon: <Settings className="w-4 h-4" /> },
          { label: 'Planning Oversight', path: '/principal/curriculum', icon: <BookOpen className="w-4 h-4" /> },
          { label: 'Curriculum Oversight', path: '/principal/coverage', icon: <BookOpen className="w-4 h-4" /> },
          { label: 'Central Logs', path: '/logs', icon: <ScrollText className="w-4 h-4" /> },
          {
            label: 'Time-Aware Engine',
            path: '/teacher/time-aware',
            icon: <Clock className="w-4 h-4" />,
            highlight: true,
            badge: 'Core',
          },
          {
            label: 'AI Question Studio',
            path: '/teacher/assessments',
            icon: <Sparkles className="w-4 h-4" />,
            badge: 'AI',
          },
          {
            label: 'Auto-Grade & OCR',
            path: '/teacher/scan-review',
            icon: <ScanLine className="w-4 h-4" />,
            badge: 'Batch',
          },
          {
            label: 'Curriculum Catalogue',
            path: '/curriculum/catalogue',
            icon: <Library className="w-4 h-4" />,
            badge: 'VI–VIII',
          },
          { label: 'Audit & Security', path: '/admin/audit-logs', icon: <ShieldCheck className="w-4 h-4" /> },
        ];

      case 'principal':
        return [
          { label: 'Academic Config', path: '/principal/academic-config', icon: <Settings className="w-4 h-4" /> },
          { label: 'Campus Dashboard', path: '/principal/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
          { label: 'Teacher Assignments', path: '/principal/teachers', icon: <Users className="w-4 h-4" /> },
          { label: 'Classes & Roster', path: '/teacher/classes', icon: <GraduationCap className="w-4 h-4" /> },
          { label: 'Planning Oversight', path: '/principal/curriculum', icon: <BookOpen className="w-4 h-4" /> },
          { label: 'Curriculum Oversight', path: '/principal/coverage', icon: <BookOpen className="w-4 h-4" /> },
          { label: 'Central Logs', path: '/logs', icon: <ScrollText className="w-4 h-4" /> },
          {
            label: 'Time-Aware Engine',
            path: '/teacher/time-aware',
            icon: <Clock className="w-4 h-4" />,
            highlight: true,
            badge: 'Pacing',
          },
          {
            label: 'AI Question Studio',
            path: '/teacher/assessments',
            icon: <Sparkles className="w-4 h-4" />,
            badge: 'AI',
          },
          {
            label: 'Auto-Grade & OCR',
            path: '/teacher/scan-review',
            icon: <ScanLine className="w-4 h-4" />,
            badge: 'Batch',
          },
          {
            label: 'Curriculum Catalogue',
            path: '/curriculum/catalogue',
            icon: <Library className="w-4 h-4" />,
            badge: 'VI–VIII',
          },
          { label: 'Compliance Reports', path: '/principal/reports', icon: <FileSpreadsheet className="w-4 h-4" /> },
        ];

      case 'teacher':
        return [
          { label: 'Teacher Dashboard', path: '/teacher/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
          { label: 'My Classes & Heatmap', path: '/teacher/classes', icon: <Users className="w-4 h-4" /> },
          {
            label: 'Time-Aware Engine',
            path: '/teacher/time-aware',
            icon: <Clock className="w-4 h-4" />,
            highlight: true,
            badge: 'Key',
          },
          {
            label: 'Curriculum Catalogue',
            path: '/curriculum/catalogue',
            icon: <Library className="w-4 h-4" />,
            badge: 'VI–VIII',
          },
          { label: 'Central Logs', path: '/logs', icon: <ScrollText className="w-4 h-4" /> },
          { label: 'Daily Curriculum', path: '/teacher/curriculum-180', icon: <Calendar className="w-4 h-4" /> },
          {
            label: 'AI Question Studio',
            path: '/teacher/assessments',
            icon: <BookOpen className="w-4 h-4" />,
            badge: 'AI',
          },
          { label: 'Differentiated Homework', path: '/teacher/remediation', icon: <Sparkles className="w-4 h-4" /> },
          {
            label: 'Auto-Grade & OCR',
            path: '/teacher/scan-review',
            icon: <ScanLine className="w-4 h-4" />,
            badge: 'Batch',
          },
        ];

      case 'student':
        return [
          { label: 'My Learning Mission', path: '/student/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
          { label: 'My Competencies', path: '/student/dashboard#competencies', icon: <Award className="w-4 h-4" /> },
          { label: 'Adaptive Practice', path: '/student/dashboard#practice', icon: <Sparkles className="w-4 h-4" /> },
        ];

      case 'parent':
        return [
          { label: 'Family Progress', path: '/parent/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
          { label: 'Competency Growth', path: '/parent/dashboard#growth', icon: <BarChart3 className="w-4 h-4" /> },
          { label: 'Home Learning Guide', path: '/parent/dashboard#home-activities', icon: <HeartHandshake className="w-4 h-4" /> },
        ];

      default:
        return [];
    }
  };

  const navItems = getNavItems();

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        'w-64 bg-navy-800 text-white shrink-0 flex-col border-r border-navy-700 print:hidden',
        drawer ? 'flex h-full overflow-y-auto' : 'hidden md:flex min-h-[calc(100vh-4rem)]',
      )}
    >
      {/* Brand Header */}
      <div className="p-5 border-b border-navy-700/60 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-teal-500 text-navy-950 flex items-center justify-center font-black text-lg shadow-sm">
          L
        </div>
        <div>
          <p className="font-bold text-base tracking-tight text-white leading-none">
            Lumen<span className="text-teal-400">EIOS</span>
          </p>
          <p className="text-[11px] text-gray-400 mt-1 font-medium">Adaptive EdTech NEP 2020</p>
        </div>
      </div>

      {/* Role Pill Banner */}
      <div className="px-5 py-3 bg-navy-900/60 border-b border-navy-700/40">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Workspace:</span>
          <span className="capitalize font-semibold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
            {role} Portal
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 p-3.5 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const [itemPath, itemHash = ''] = item.path.split('#');
          const isActive =
            (location.pathname === itemPath && location.hash === (itemHash ? `#${itemHash}` : '')) ||
            (item.path === '/curriculum/catalogue' && location.pathname.startsWith('/curriculum/catalogue/'));
          return (
            <Link
              key={item.label}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                isActive
                  ? 'bg-teal-500 text-white shadow-sm'
                  : item.highlight
                  ? 'text-amber-300 hover:bg-navy-700 hover:text-white bg-amber-500/10'
                  : 'text-gray-300 hover:bg-navy-700 hover:text-white'
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn('shrink-0', isActive ? 'text-white' : 'text-gray-400 group-hover:text-white')}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded font-semibold',
                    isActive
                      ? 'bg-white/20 text-white'
                      : item.highlight
                      ? 'bg-amber-400 text-navy-900'
                      : 'bg-navy-700 text-gray-300'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Info Box */}
      <div className="p-4 m-3 rounded-xl bg-navy-900/80 border border-navy-700 text-xs">
        <p className="font-semibold text-teal-300">Pedagogical Guardrail</p>
        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
          Approved topic requirements determine Core and Non-Core periods. Core classroom periods remain protected.
        </p>
      </div>
    </aside>
  );
};
