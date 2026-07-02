import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import ActivityTracker from "@/components/presence/ActivityTracker";
import { Skeleton } from "@/components/ui/skeleton";
import { PresenceProvider } from "@/context/PresenceContext";
import { useAuth } from "@/hooks/use-auth";
import {
  ADMIN_PANEL_ROLES,
  getDashboardPathByRole,
  ROLE_ADMIN,
  ROLE_DEVELOPER,
  ROLE_TEAM_LEAD,
  ROLE_TESTER,
} from "@/lib/roles";

const AuthPage = lazy(() => import("@/pages/AuthPage"));
const AdminBugsPage = lazy(() => import("@/pages/AdminBugsPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const DeveloperDashboardPage = lazy(() => import("@/pages/DeveloperDashboardPage"));
const DeveloperBugBoardPage = lazy(() => import("@/pages/DeveloperBugBoardPage"));
const DeveloperSettingsPage = lazy(() => import("@/pages/DeveloperSettingsPage"));
const TesterDashboardPage = lazy(() => import("@/pages/TesterDashboardPage"));
const TesterBugsPage = lazy(() => import("@/pages/TesterBugsPage"));
const ProjectsPage = lazy(() => import("@/pages/ProjectsPage"));
const BacklogPage = lazy(() => import("@/pages/BacklogPage"));
const ChatPage = lazy(() => import("@/pages/ChatPage"));
const IssuesPage = lazy(() => import("@/pages/IssuesPage"));
const TasksPage = lazy(() => import("@/pages/TasksPage"));
const StoriesPage = lazy(() => import("@/pages/StoriesPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const UserSettingsPage = lazy(() => import("@/pages/UserSettingsPage"));
const TeamDetailsPage = lazy(() => import("@/pages/TeamDetailsPage"));
const TeamActivityPage = lazy(() => import("@/pages/TeamActivityPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));

const PublicRouteFallback = () => (
  <main className="flex min-h-screen items-center justify-center px-6 py-12">
    <div className="w-full max-w-6xl space-y-5">
      <Skeleton className="h-[220px] w-full rounded-[36px]" />
      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Skeleton className="h-[520px] w-full rounded-[32px]" />
        <Skeleton className="h-[520px] w-full rounded-[32px]" />
      </div>
    </div>
  </main>
);

const getSafeRedirectPath = (search = "", fallback = "") => {
  const redirect = new URLSearchParams(search).get("redirect") || "";

  if (
    !redirect ||
    !redirect.startsWith("/") ||
    redirect.startsWith("//") ||
    redirect.includes("\\")
  ) {
    return fallback;
  }

  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsedUrl = new URL(redirect, origin);

    if (parsedUrl.origin !== origin || ["/login", "/auth", "/admin"].includes(parsedUrl.pathname)) {
      return fallback;
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch (error) {
    return fallback;
  }
};

const ProtectedRoute = ({ children, roles }) => {
  const { isAuthenticated, role } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const redirectTarget = `${location.pathname}${location.search}${location.hash}`;

    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(redirectTarget)}`}
        replace
      />
    );
  }

  if (roles?.length && !roles.includes(role)) {
    return <Navigate to={getDashboardPathByRole(role)} replace />;
  }

  return children;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, role } = useAuth();
  const location = useLocation();

  if (isAuthenticated) {
    return (
      <Navigate
        to={getSafeRedirectPath(location.search, getDashboardPathByRole(role))}
        replace
      />
    );
  }

  return children;
};

const RootRoute = () => {
  const { isAuthenticated, role } = useAuth();

  return (
    <Navigate to={isAuthenticated ? getDashboardPathByRole(role) : "/login"} replace />
  );
};

const LegacyDashboardRedirect = () => {
  const { role } = useAuth();

  return <Navigate to={getDashboardPathByRole(role)} replace />;
};

const SelfSettingsRoute = () => {
  const { role } = useAuth();

  return role === ROLE_TESTER ? <UserSettingsPage /> : <DeveloperSettingsPage />;
};

const BugsRoute = () => {
  const { role } = useAuth();

  return ADMIN_PANEL_ROLES.includes(role) ? <AdminBugsPage /> : <TesterBugsPage />;
};

const TasksRoute = () => {
  const { role } = useAuth();

  return ADMIN_PANEL_ROLES.includes(role) ? <IssuesPage /> : <TasksPage />;
};

const App = () => (
  <PresenceProvider>
    <ActivityTracker />
    <Routes>
    <Route path="/" element={<RootRoute />} />
    <Route
      path="/login"
      element={
        <PublicRoute>
          <Suspense fallback={<PublicRouteFallback />}>
            <AuthPage />
          </Suspense>
        </PublicRoute>
      }
    />
    <Route
      path="/admin"
      element={
        <PublicRoute>
          <Suspense fallback={<PublicRouteFallback />}>
            <AuthPage />
          </Suspense>
        </PublicRoute>
      }
    />
    <Route
      path="/auth"
      element={
        <PublicRoute>
          <Suspense fallback={<PublicRouteFallback />}>
            <AuthPage />
          </Suspense>
        </PublicRoute>
      }
    />
    <Route
      element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }
    >
      <Route path="/dashboard" element={<LegacyDashboardRedirect />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_TESTER]}>
            <Suspense fallback={<PublicRouteFallback />}>
              <ProfilePage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute roles={[ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_TESTER, ...ADMIN_PANEL_ROLES]}>
            <SelfSettingsRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/team-activity"
        element={
          <ProtectedRoute roles={[ROLE_ADMIN]}>
            <TeamActivityPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dev/dashboard"
        element={
          <ProtectedRoute roles={[ROLE_DEVELOPER, ROLE_TEAM_LEAD]}>
            <DeveloperDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dev/bugs"
        element={
          <ProtectedRoute roles={[ROLE_DEVELOPER, ROLE_TEAM_LEAD]}>
            <DeveloperBugBoardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dev/settings"
        element={
          <ProtectedRoute roles={[ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_TESTER]}>
            <SelfSettingsRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tester/dashboard"
        element={
          <ProtectedRoute roles={[ROLE_TESTER]}>
            <TesterDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bugs"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_TESTER]}>
            <BugsRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/bugs"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <AdminBugsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/backlog"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <BacklogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <ProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teams"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <Navigate to="/projects" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teams/create"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <Navigate to="/projects" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teams/:id"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <TeamDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/users"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <UserSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="/issues" element={<IssuesPage />} />
      <Route path="/issues/:issueId" element={<IssuesPage />} />
      <Route
        path="/stories"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_TEAM_LEAD, ROLE_DEVELOPER, ROLE_TESTER]}>
            <StoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stories/:storyId"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_TEAM_LEAD, ROLE_DEVELOPER, ROLE_TESTER]}>
            <StoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute
            roles={[...ADMIN_PANEL_ROLES, ROLE_TEAM_LEAD, ROLE_DEVELOPER, ROLE_TESTER]}
          >
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_TESTER]}>
            <TasksRoute />
          </ProtectedRoute>
        }
      />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/reports/:reportKey" element={<ReportsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </PresenceProvider>
);

export default App;
