import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ActivityTracker from "@/components/presence/ActivityTracker";
import { PresenceProvider } from "@/context/PresenceContext";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import {
  ADMIN_PANEL_ROLES,
  getDashboardPathByRole,
  getFirstAllowedPathByRole,
  hasWorkspaceMailAccess,
  isScreenAllowed,
  ROLE_ADMIN,
  ROLE_DEVELOPER,
  ROLE_QA_LEAD,
  ROLE_TEAM_LEAD,
  ROLE_TESTER,
  SCREEN_PERMISSION_ROLES,
  TASK_STORY_LEAD_ROLES,
  TESTER_PANEL_ROLES,
} from "@/lib/roles";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchScreenPermissions } from "@/lib/api";

const AppShell = lazy(() => import("@/components/layout/AppShell"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const PublicSite = lazy(() => import("@/pages/PublicSite"));
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
const PlatformLoginPage = lazy(() => import("@/pages/PlatformLoginPage"));
const PlatformDashboardPage = lazy(() => import("@/pages/PlatformDashboardPage"));
const PlatformCompaniesPage = lazy(() => import("@/pages/PlatformCompaniesPage"));
const PlatformCompanyDetailsPage = lazy(() => import("@/pages/PlatformCompanyDetailsPage"));
const PlatformPlaceholderPage = lazy(() => import("@/pages/PlatformPlaceholderPage"));
const PlatformSubscriptionsPage = lazy(() => import("@/pages/PlatformSubscriptionsPage"));
const PlatformStoragePage = lazy(() => import("@/pages/PlatformStoragePage"));
const PlatformPaymentsPage = lazy(() => import("@/pages/PlatformPaymentsPage"));
const PlatformAIUsagePage = lazy(() => import("@/pages/PlatformAIUsagePage"));
const BillingPage = lazy(() => import("@/pages/BillingPage"));
const CompanyCheckoutPage = lazy(() => import("@/pages/CompanyCheckoutPage"));

const PublicRouteFallback = () => (
  <main className="grid min-h-screen place-items-center bg-[#111113] px-6 py-12 text-white">
    <div className="grid justify-items-center gap-4">
      <img
        src="/icons/icon-192x192.png?v=20260727-3"
        alt=""
        className="h-24 w-24 rounded-3xl shadow-[0_20px_55px_rgba(0,0,0,0.35),0_0_36px_rgba(193,38,255,0.24)]"
      />
      <p className="text-sm font-bold">Loading CureCode</p>
    </div>
  </main>
);

const ModuleFallback = () => (
  <div className="mx-auto w-full max-w-6xl space-y-4 px-5 py-8" aria-label="Loading module">
    <Skeleton className="h-8 w-56 rounded-lg" />
    <Skeleton className="h-28 w-full rounded-2xl" />
    <div className="grid gap-4 md:grid-cols-2">
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  </div>
);

const SCREEN_PERMISSIONS_STALE_TIME = 5 * 60 * 1000;

const useScreenPermissions = (enabled, userId) =>
  useQuery({
    queryKey: ["screen-permissions", userId || "anonymous"],
    queryFn: fetchScreenPermissions,
    enabled,
    staleTime: SCREEN_PERMISSIONS_STALE_TIME,
  });

const LegacyBacklogRedirect = () => {
  const location = useLocation();
  return <Navigate to={`/sprint-planning${location.search}`} replace />;
};

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

const ProtectedRoute = ({ children, roles, screenId }) => {
  const { isAuthenticated, role, user } = useAuth();
  const location = useLocation();
  const roleAllowed = !roles?.length || roles.includes(role);
  const shouldCheckPermissions = Boolean(
    isAuthenticated &&
      role &&
      SCREEN_PERMISSION_ROLES.includes(role) &&
      (screenId || !roleAllowed)
  );
  const { data: screenPermissions = null, isLoading: isPermissionsLoading } =
    useScreenPermissions(shouldCheckPermissions, user?._id);

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
    return <Navigate to={getFirstAllowedPathByRole(role, screenPermissions)} replace />;
  }

  if (screenId && shouldCheckPermissions) {
    if (isPermissionsLoading && !screenPermissions) {
      return <ModuleFallback />;
    }

    if (!isScreenAllowed(role, screenId, screenPermissions)) {
      const fallbackTarget = getFirstAllowedPathByRole(role, screenPermissions);
      const safeTarget = fallbackTarget === location.pathname ? "/profile" : fallbackTarget;
      return <Navigate to={safeTarget} replace />;
    }
  }

  return children;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, role, user } = useAuth();
  const location = useLocation();
  const shouldCheckPermissions = Boolean(
    isAuthenticated && role && SCREEN_PERMISSION_ROLES.includes(role)
  );
  const { data: screenPermissions = null } = useScreenPermissions(
    shouldCheckPermissions,
    user?._id
  );

  if (isAuthenticated) {
    const defaultTarget = getFirstAllowedPathByRole(role, screenPermissions);
    return (
      <Navigate
        to={getSafeRedirectPath(location.search, defaultTarget)}
        replace
      />
    );
  }

  return children;
};

const LegacyDashboardRedirect = () => {
  const { role, isAuthenticated, user } = useAuth();
  const shouldCheckPermissions = Boolean(
    isAuthenticated && role && SCREEN_PERMISSION_ROLES.includes(role)
  );
  const { data: screenPermissions = null, isLoading } = useScreenPermissions(
    shouldCheckPermissions,
    user?._id
  );

  if (isLoading && !screenPermissions && shouldCheckPermissions) {
    return <ModuleFallback />;
  }

  return <Navigate to={getFirstAllowedPathByRole(role, screenPermissions)} replace />;
};

const SelfSettingsRoute = () => {
  const { role } = useAuth();

  return TESTER_PANEL_ROLES.includes(role) || hasWorkspaceMailAccess(role) ? (
    <UserSettingsPage />
  ) : (
    <DeveloperSettingsPage />
  );
};

const PlatformProtectedRoute = ({ children }) => {
  const { isAuthenticated, isCheckingPlatformSession } = usePlatformAuth();
  const location = useLocation();

  if (isCheckingPlatformSession) {
    return <PublicRouteFallback />;
  }

  if (!isAuthenticated) {
    const redirectTarget = `${location.pathname}${location.search}${location.hash}`;

    return (
      <Navigate
        to={`/platform/login?redirect=${encodeURIComponent(redirectTarget)}`}
        replace
      />
    );
  }

  return children;
};

const PlatformPublicRoute = ({ children }) => {
  const { isAuthenticated, isCheckingPlatformSession } = usePlatformAuth();

  if (isCheckingPlatformSession) {
    return <PublicRouteFallback />;
  }

  if (isAuthenticated) {
    return <Navigate to="/platform/dashboard" replace />;
  }

  return children;
};

const BugsRoute = () => {
  const { role } = useAuth();

  if (ADMIN_PANEL_ROLES.includes(role)) {
    return <AdminBugsPage />;
  }

  if (role === ROLE_TEAM_LEAD) {
    return <DeveloperBugBoardPage />;
  }

  return <TesterBugsPage />;
};

const TasksRoute = () => {
  const { role } = useAuth();

  return ADMIN_PANEL_ROLES.includes(role) ? <IssuesPage /> : <TasksPage />;
};

const App = () => (
  <PresenceProvider>
    <ActivityTracker />
    <Routes>
    <Route path="/" element={<Suspense fallback={<PublicRouteFallback />}><PublicSite /></Suspense>} />
    <Route path="/pricing" element={<Suspense fallback={<PublicRouteFallback />}><PublicSite /></Suspense>} />
    <Route path="/features" element={<Suspense fallback={<PublicRouteFallback />}><PublicSite /></Suspense>} />
    <Route path="/resources" element={<Suspense fallback={<PublicRouteFallback />}><PublicSite /></Suspense>} />
    <Route path="/enterprise" element={<Suspense fallback={<PublicRouteFallback />}><PublicSite /></Suspense>} />
    <Route path="/contact" element={<Suspense fallback={<PublicRouteFallback />}><PublicSite /></Suspense>} />
    <Route path="/subscribe" element={<Suspense fallback={<PublicRouteFallback />}><CompanyCheckoutPage /></Suspense>} />
    <Route
      path="/platform/login"
      element={
        <PlatformPublicRoute>
          <Suspense fallback={<PublicRouteFallback />}>
            <PlatformLoginPage />
          </Suspense>
        </PlatformPublicRoute>
      }
    />
    <Route
      path="/platform/dashboard"
      element={
        <PlatformProtectedRoute>
          <Suspense fallback={<PublicRouteFallback />}>
            <PlatformDashboardPage />
          </Suspense>
        </PlatformProtectedRoute>
      }
    />
    <Route
      path="/platform/companies"
      element={
        <PlatformProtectedRoute>
          <Suspense fallback={<PublicRouteFallback />}>
            <PlatformCompaniesPage />
          </Suspense>
        </PlatformProtectedRoute>
      }
    />
    <Route
      path="/platform/companies/:companyId"
      element={
        <PlatformProtectedRoute>
          <Suspense fallback={<PublicRouteFallback />}>
            <PlatformCompanyDetailsPage />
          </Suspense>
        </PlatformProtectedRoute>
      }
    />
    <Route
      path="/platform/subscriptions"
      element={
        <PlatformProtectedRoute>
          <Suspense fallback={<PublicRouteFallback />}>
            <PlatformSubscriptionsPage />
          </Suspense>
        </PlatformProtectedRoute>
      }
    />
    <Route
      path="/platform/storage"
      element={<PlatformProtectedRoute><Suspense fallback={<PublicRouteFallback />}><PlatformStoragePage /></Suspense></PlatformProtectedRoute>}
    />
    <Route path="/platform/payments" element={<PlatformProtectedRoute><Suspense fallback={<PublicRouteFallback />}><PlatformPaymentsPage /></Suspense></PlatformProtectedRoute>} />
    <Route path="/platform/ai-usage" element={<PlatformProtectedRoute><Suspense fallback={<PublicRouteFallback />}><PlatformAIUsagePage /></Suspense></PlatformProtectedRoute>} />
    <Route
      path="/platform/:platformModule"
      element={
        <PlatformProtectedRoute>
          <Suspense fallback={<PublicRouteFallback />}>
            <PlatformPlaceholderPage />
          </Suspense>
        </PlatformProtectedRoute>
      }
    />
    <Route path="/platform" element={<Navigate to="/platform/dashboard" replace />} />
    <Route
      path="/platform/*"
      element={
        <PlatformProtectedRoute>
          <Suspense fallback={<PublicRouteFallback />}>
            <PlatformDashboardPage />
          </Suspense>
        </PlatformProtectedRoute>
      }
    />
    <Route
      path="/login"
      element={
        <PublicRoute>
          <Suspense fallback={<PublicRouteFallback />}><LoginPage /></Suspense>
        </PublicRoute>
      }
    />
    <Route path="/signup" element={<PublicRoute><Suspense fallback={<PublicRouteFallback />}><LoginPage signup /></Suspense></PublicRoute>} />
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
          <Suspense fallback={<ModuleFallback />}>
            <AppShell />
          </Suspense>
        </ProtectedRoute>
      }
    >
      <Route path="/dashboard" element={<LegacyDashboardRedirect />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_TESTER]}>
            <Suspense fallback={<PublicRouteFallback />}>
              <ProfilePage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute roles={[ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_TESTER, ...ADMIN_PANEL_ROLES]}>
            <SelfSettingsRoute />
          </ProtectedRoute>
        }
      />
      <Route path="/settings/billing" element={<ProtectedRoute roles={ADMIN_PANEL_ROLES}><Suspense fallback={<PublicRouteFallback />}><BillingPage /></Suspense></ProtectedRoute>} />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES} screenId="dashboard">
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
          <ProtectedRoute roles={[ROLE_DEVELOPER, ROLE_TEAM_LEAD]} screenId="dashboard">
            <DeveloperDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dev/bugs"
        element={
          <ProtectedRoute roles={[ROLE_DEVELOPER, ROLE_TEAM_LEAD]} screenId="bugs">
            <DeveloperBugBoardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dev/settings"
        element={
          <ProtectedRoute roles={[ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_TESTER]}>
            <SelfSettingsRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tester/dashboard"
        element={
          <ProtectedRoute roles={TESTER_PANEL_ROLES} screenId="dashboard">
            <TesterDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bugs"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ...TESTER_PANEL_ROLES, ...TASK_STORY_LEAD_ROLES]} screenId="bugs">
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
        path="/sprint-planning"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <BacklogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/backlog"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <LegacyBacklogRedirect />
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
        path="/projects/:projectId/ai-assist"
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
            <Navigate to="/projects?tab=teams" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teams/create"
        element={
          <ProtectedRoute roles={ADMIN_PANEL_ROLES}>
            <Navigate to="/projects?tab=teams" replace />
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
      <Route
        path="/issues"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_TESTER]} screenId="tasks">
            <IssuesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/issues/:issueId"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_TESTER]} screenId="tasks">
            <IssuesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stories"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_DEVELOPER, ROLE_TESTER]} screenId="stories">
            <StoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stories/:storyId"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_DEVELOPER, ROLE_TESTER]} screenId="stories">
            <StoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute
            roles={[...ADMIN_PANEL_ROLES, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_DEVELOPER, ROLE_TESTER]}
            screenId="chat"
          >
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_TESTER]} screenId="tasks">
            <TasksRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute screenId="reports">
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/:reportKey"
        element={
          <ProtectedRoute screenId="reports">
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute screenId="reports">
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics/:reportKey"
        element={
          <ProtectedRoute screenId="reports">
            <ReportsPage />
          </ProtectedRoute>
        }
      />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </PresenceProvider>
);

export default App;
