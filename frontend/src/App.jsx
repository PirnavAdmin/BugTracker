import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import ActivityTracker from "@/components/presence/ActivityTracker";
import { PresenceProvider } from "@/context/PresenceContext";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import {
  ADMIN_PANEL_ROLES,
  getDashboardPathByRole,
  hasWorkspaceMailAccess,
  ROLE_ADMIN,
  ROLE_DEVELOPER,
  ROLE_QA_LEAD,
  ROLE_TEAM_LEAD,
  ROLE_TESTER,
  TASK_STORY_LEAD_ROLES,
  TESTER_PANEL_ROLES,
} from "@/lib/roles";

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

const AUTH_SPLASH_DESKTOP_VIDEO = "/animations/create_a_animation_for_mobile.mp4";
const AUTH_SPLASH_MOBILE_VIDEO = "/animations/need_this_for_mobile_aspect_ra.mp4";
const AUTH_SPLASH_FALLBACK_MS = 12000;
const MOBILE_SPLASH_MEDIA_QUERY = "(max-width: 767px)";

const LegacyBacklogRedirect = () => {
  const location = useLocation();
  return <Navigate to={`/sprint-planning${location.search}`} replace />;
};

const useIsMobileSplashViewport = () => {
  const getIsMobile = () =>
    typeof window !== "undefined" &&
    window.matchMedia(MOBILE_SPLASH_MEDIA_QUERY).matches;

  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_SPLASH_MEDIA_QUERY);
    const handleChange = (event) => setIsMobile(event.matches);

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
};

const AuthSplashScreen = ({ onComplete }) => {
  const isMobile = useIsMobileSplashViewport();
  const splashVideo = isMobile ? AUTH_SPLASH_MOBILE_VIDEO : AUTH_SPLASH_DESKTOP_VIDEO;

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#020617] text-white"
      style={{ minHeight: "var(--app-viewport-height)" }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(14,165,233,0.16),transparent_34%),linear-gradient(135deg,#031A33_0%,#020617_62%,#000814_100%)]" />
      <video
        key={splashVideo}
        autoPlay
        className="absolute inset-0 z-10 h-full w-full object-cover"
        muted
        playsInline
        preload="auto"
        src={splashVideo}
        onEnded={onComplete}
        onError={onComplete}
      />
      <span className="sr-only">Loading CureCode</span>
    </main>
  );
};

const AuthSplashGate = ({ children }) => {
  const [isSplashComplete, setIsSplashComplete] = useState(false);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setIsSplashComplete(true);
    }, AUTH_SPLASH_FALLBACK_MS);

    return () => window.clearTimeout(timerId);
  }, []);

  if (!isSplashComplete) {
    return (
      <AuthSplashScreen onComplete={() => setIsSplashComplete(true)} />
    );
  }

  return children;
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

const LegacyDashboardRedirect = () => {
  const { role } = useAuth();

  return <Navigate to={getDashboardPathByRole(role)} replace />;
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
          <AuthSplashGate>
            <Suspense fallback={<PublicRouteFallback />}>
              <AuthPage />
            </Suspense>
          </AuthSplashGate>
        </PublicRoute>
      }
    />
    <Route
      path="/auth"
      element={
        <PublicRoute>
          <AuthSplashGate>
            <Suspense fallback={<PublicRouteFallback />}>
              <AuthPage />
            </Suspense>
          </AuthSplashGate>
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
          <ProtectedRoute roles={[ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_TESTER]}>
            <SelfSettingsRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tester/dashboard"
        element={
          <ProtectedRoute roles={TESTER_PANEL_ROLES}>
            <TesterDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bugs"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ...TESTER_PANEL_ROLES, ...TASK_STORY_LEAD_ROLES]}>
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
      <Route path="/issues" element={<IssuesPage />} />
      <Route path="/issues/:issueId" element={<IssuesPage />} />
      <Route
        path="/stories"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_DEVELOPER, ROLE_TESTER]}>
            <StoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stories/:storyId"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_DEVELOPER, ROLE_TESTER]}>
            <StoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute
            roles={[...ADMIN_PANEL_ROLES, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_DEVELOPER, ROLE_TESTER]}
          >
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute roles={[...ADMIN_PANEL_ROLES, ROLE_DEVELOPER, ROLE_TEAM_LEAD, ROLE_QA_LEAD, ROLE_TESTER]}>
            <TasksRoute />
          </ProtectedRoute>
        }
      />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/reports/:reportKey" element={<ReportsPage />} />
      <Route path="/analytics" element={<ReportsPage />} />
      <Route path="/analytics/:reportKey" element={<ReportsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </PresenceProvider>
);

export default App;
