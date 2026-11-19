import {
  Building2,
  CreditCard,
  Database,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/layout/ThemeToggle";

export const platformNavItems = [
  { key: "dashboard", label: "Dashboard", path: "/platform/dashboard", Icon: LayoutDashboard },
  { key: "companies", label: "Companies", path: "/platform/companies", Icon: Building2 },
  { key: "subscriptions", label: "Subscriptions", path: "/platform/subscriptions", Icon: ShieldCheck },
  { key: "payments", label: "Payments", path: "/platform/payments", Icon: CreditCard },
  { key: "ai-usage", label: "AI Usage", path: "/platform/ai-usage", Icon: Sparkles },
  { key: "storage", label: "Storage", path: "/platform/storage", Icon: Database },
  { key: "settings", label: "Platform Settings", path: "/platform/settings", Icon: Settings },
];

const PlatformShell = ({ actions, children, title = "SaaS Control Center" }) => {
  const navigate = useNavigate();
  const { logout, platformAdmin } = usePlatformAuth();
  const { theme } = useTheme();

  const handleLogout = async () => {
    await logout();
    navigate("/platform/login", { replace: true });
  };

  return (
    <main
      data-theme={theme}
      className={cn(
        "app-theme-root min-h-screen bg-[var(--app-page-background)] text-[var(--app-text-primary)] lg:h-[var(--app-viewport-height)] lg:overflow-hidden",
        theme === "dark" && "dark"
      )}
    >
      <div className="grid min-h-screen lg:h-full lg:min-h-0 lg:grid-cols-[244px_1fr]">
        <aside className="border-r border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-950 lg:min-h-0 lg:overflow-y-auto">
          <div className="flex items-center gap-3 px-2">
            <img src="/icons/icon-192x192.png?v=20260727-3" alt="" className="h-10 w-10 rounded-xl" />
            <div>
              <p className="text-lg font-bold tracking-normal">CureCode</p>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">Platform</p>
            </div>
          </div>

          <nav className="mt-7 space-y-1">
            {platformNavItems.map(({ label, Icon, path }) => (
              <NavLink
                key={label}
                className={({ isActive }) =>
                  cn(
                    "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition",
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  )
                }
                to={path}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
          <header className="flex shrink-0 flex-col gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                CureCode Platform
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-normal">{title}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {platformAdmin?.name || "Platform Admin"} - {platformAdmin?.role || "SaaS Admin"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              <ThemeToggle />
              <Button className="h-10 rounded-lg" type="button" variant="outline" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </header>

          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
};

export default PlatformShell;
