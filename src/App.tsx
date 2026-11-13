import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { SchoolsManagement } from './pages/admin/SchoolsManagement';
import { UsersManagement } from './pages/admin/UsersManagement';
import { AcademicConfig } from './pages/admin/AcademicConfig';
import { AuditLogs } from './pages/admin/AuditLogs';
import { PrincipalDashboard } from './pages/principal/PrincipalDashboard';
import { TeacherAssignments } from './pages/principal/TeacherAssignments';
import { CurriculumOversight } from './pages/principal/CurriculumOversight';
import { PrincipalReports } from './pages/principal/PrincipalReports';
import { TeacherDashboard } from './pages/teacher/TeacherDashboard';
import { MyClasses } from './pages/teacher/MyClasses';
import { AssessmentBuilder } from './pages/teacher/AssessmentBuilder';
import { CurriculumPlanner180 } from './pages/teacher/CurriculumPlanner180';
import { ScanReview } from './pages/teacher/ScanReview';
import { TimeAwareEngine } from './pages/time-aware/TimeAwareEngine';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { StudentRecords } from './pages/student/StudentRecords';
import { ParentDashboard } from './pages/parent/ParentDashboard';
import { NotFoundPage } from './pages/shared/NotFoundPage';
import { UnauthorizedPage } from './pages/shared/UnauthorizedPage';
import { OnboardingPage } from './pages/shared/OnboardingPage';
import { WelcomePage } from './pages/shared/WelcomePage';
import { SchoolStudents } from './pages/principal/SchoolStudents';
import { SchoolTeachers } from './pages/principal/SchoolTeachers';
import { SchoolPerformancePage } from './pages/principal/SchoolPerformancePage';
import { StudentHomework } from './pages/teacher/StudentHomework';
import { StudentAnswerSheets } from './pages/student/StudentAnswerSheets';
import {
  AccessLog,
  CompetencyFramework,
  DataQuality,
  DeveloperHome,
  FeatureFlags,
  GeminiModel,
  ModelWorkshop,
  PlatformHealth,
  ReleaseNotes,
  SampleRoster,
} from './pages/developer/DeveloperPages';
import { DifferentiatedHomeworkPage } from './pages/homework/DifferentiatedHomeworkPage';
import { CurriculumModule, CatalogueDashboard, CatalogueCombinationPage } from './features/curriculum/CurriculumModule';
import { CoverageOversight } from './pages/principal/CoverageOversight';
import { PlanLogs } from './pages/shared/PlanLogs';
import {
  EducatorProgressOverviewPage,
  ParentProgressOverviewPage,
  StudentProgressOverviewPage,
} from './pages/progress/ProgressOverviewPage';
import {
  EducatorSubjectProgressPage,
  ParentSubjectProgressPage,
  StudentSubjectProgressPage,
} from './pages/progress/SubjectProgressPage';
import { ParentProgressHomePage } from './pages/progress/ParentProgressHomePage';
import { getDefaultDashboardPath } from './lib/permissions';
import { DEMO_MODE } from './lib/runtime';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isLoading, isRestoringSession } = useAuth();
  if (isLoading || isRestoringSession) return <p role="status" className="p-6">Checking your session…</p>;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const DefaultRedirect: React.FC = () => {
  const { currentUser, isLoading, isRestoringSession } = useAuth();
  if (isLoading || isRestoringSession) return <p role="status" className="p-6">Checking your session…</p>;
  if (!currentUser) return <WelcomePage />;
  return <Navigate to={getDefaultDashboardPath(currentUser.role)} replace />;
};

/** Main LumenEIOS host: teammate frontend routes + Differentiated Homework workspaces. */
const MainApp: React.FC = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/welcome" element={<WelcomePage />} />
    <Route path="/" element={<DefaultRedirect />} />

    <Route
      element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/admin/schools" element={<SchoolsManagement />} />
      <Route path="/admin/schools/add" element={<OnboardingPage key="school" kind="School" />} />
      <Route path="/admin/users" element={<UsersManagement />} />
      <Route path="/admin/academic-config" element={<AcademicConfig />} />
      <Route path="/admin/audit-logs" element={<AuditLogs />} />

      <Route path="/developer" element={<DeveloperHome />} />
      <Route path="/developer/health" element={<PlatformHealth />} />
      <Route path="/developer/gemini" element={<GeminiModel />} />
      <Route path="/developer/roster" element={<SampleRoster />} />
      <Route path="/developer/flags" element={<FeatureFlags />} />
      <Route path="/developer/access" element={<AccessLog />} />
      <Route path="/developer/framework" element={<CompetencyFramework />} />
      <Route path="/developer/workshop" element={<ModelWorkshop />} />
      <Route path="/developer/quality" element={<DataQuality />} />
      <Route path="/developer/releases" element={<ReleaseNotes />} />

      <Route path="/principal/academic-config" element={<AcademicConfig />} />
      <Route path="/principal/coverage" element={<CoverageOversight />} />
      <Route path="/logs" element={<PlanLogs />} />
      <Route path="/principal/dashboard" element={<PrincipalDashboard />} />
      <Route path="/principal/teachers" element={<TeacherAssignments />} />
      <Route path="/principal/teachers/add" element={<OnboardingPage key="teacher" kind="Teacher" />} />
      <Route path="/principal/curriculum" element={<CurriculumOversight />} />
      <Route path="/principal/reports" element={<PrincipalReports />} />
      <Route path="/principal/students" element={<SchoolStudents />} />
      <Route path="/principal/performance" element={<SchoolPerformancePage />} />
      <Route path="/principal/staff" element={<SchoolTeachers />} />

      <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
      <Route path="/teacher/classes" element={<MyClasses />} />
      <Route path="/teacher/students/add" element={<OnboardingPage key="student" kind="Student" />} />
      <Route path="/teacher/assessments" element={<AssessmentBuilder key="studio" />} />
      <Route path="/teacher/assessments-beta" element={<AssessmentBuilder key="studio-beta" />} />
      <Route path="/teacher/curriculum-180" element={<CurriculumPlanner180 />} />
      <Route path="/teacher/time-aware" element={<TimeAwareEngine />} />
      <Route path="/upload" element={<ScanReview />} />
      <Route path="/upload-beta" element={<ScanReview beta />} />
      <Route path="/teacher/scan-review" element={<Navigate to="/upload" replace />} />
      {/* Sidebar "Differentiated Homework" → live role-aware workspaces */}
      <Route path="/teacher/remediation" element={<DifferentiatedHomeworkPage />} />
      <Route path="/teacher/homework" element={<DifferentiatedHomeworkPage />} />
      <Route path="/teacher/student-homework" element={<StudentHomework />} />
      <Route path="/teacher/students/:studentId/progress" element={<EducatorProgressOverviewPage />} />
      <Route
        path="/teacher/students/:studentId/progress/subjects/:subjectId"
        element={<EducatorSubjectProgressPage />}
      />

      {/* Curriculum Catalogue (Classes VI–VIII Mathematics & Science) */}
      <Route element={<CurriculumModule />}>
        <Route path="/curriculum/catalogue" element={<CatalogueDashboard />} />
        <Route path="/curriculum/catalogue/:grade/:subject" element={<CatalogueCombinationPage />} />
      </Route>

      <Route path="/student/dashboard" element={<StudentDashboard />} />
      <Route path="/student/homework" element={<DifferentiatedHomeworkPage />} />
      <Route path="/student/progress" element={<StudentProgressOverviewPage />} />
      <Route path="/student/progress/subjects/:subjectId" element={<StudentSubjectProgressPage />} />
      <Route path="/student/history" element={<StudentRecords view="history" />} />
      <Route path="/student/profile" element={<StudentRecords view="profile" />} />
      <Route path="/student/answer-sheets" element={<StudentAnswerSheets />} />

      <Route path="/parent/dashboard" element={<ParentDashboard />} />
      <Route path="/parent/homework" element={<DifferentiatedHomeworkPage />} />
      <Route path="/parent/progress" element={<ParentProgressHomePage />} />
      <Route path="/parent/students/:studentId/progress" element={<ParentProgressOverviewPage />} />
      <Route
        path="/parent/students/:studentId/progress/subjects/:subjectId"
        element={<ParentSubjectProgressPage />}
      />

      <Route path="/homework" element={<DifferentiatedHomeworkPage />} />

      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>
);

const OfflineDemoRoot = DEMO_MODE
  ? lazy(() =>
      import('./DemoApp').then(async (module) => {
        const { DataProvider } = await import('./context/DataContext');
        return {
          default: () => (
            <DataProvider>
              <module.DemoApp />
            </DataProvider>
          ),
        };
      }),
    )
  : null;

export const App: React.FC = () => {
  if (DEMO_MODE) {
    return (
      <Suspense fallback={<p role="status" className="p-6">Loading offline demonstration…</p>}>
        {OfflineDemoRoot && <OfflineDemoRoot />}
      </Suspense>
    );
  }
  return <MainApp />;
};
