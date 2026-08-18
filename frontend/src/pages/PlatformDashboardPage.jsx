import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CreditCard,
  Database,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchPlatformDashboard } from "@/lib/api";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", Icon: LayoutDashboard, active: true },
  { label: "Companies", Icon: Building2 },
  { label: "Subscriptions", Icon: ShieldCheck },
  { label: "Payments", Icon: CreditCard },
  { label: "AI Usage", Icon: Sparkles },
  { label: "Storage", Icon: Database },
  { label: "Platform Settings", Icon: Settings },
];

const overviewIcons = {
  companies: Building2,
  subscriptions: ShieldCheck,
  payments: CreditCard,
  "ai-usage": Sparkles,
  storage: Database,
};

const PlatformDashboardPage = () => {
  const navigate = useNavigate();
  const { logout, platformAdmin } = usePlatformAuth();
  const dashboardQuery = useQuery({
    queryKey: ["platform-dashboard"],
    queryFn: fetchPlatformDashboard,
  });
  const dashboardAdmin = dashboardQuery.data?.platformAdmin || platformAdmin || {};
  const overview = dashboardQuery.data?.overview || [];

  const handleLogout = async () => {
    await logout();
    navigate("/platform/login", { replace: true });
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-slate-200 bg-white px-4 py-5">
          <div className="flex items-center gap-3 px-2">
            <img src="/icons/icon-192x192.png?v=20260727-3" alt="" className="h-10 w-10 rounded-xl" />
            <div>
              <p className="text-lg font-bold tracking-normal">CureCode</p>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Platform</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {navItems.map(({ label, Icon, active }) => (
              <button
                key={label}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition",
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "cursor-not-allowed text-slate-500 opacity-70"
                )}
                disabled={!active}
                type="button"
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                CureCode Platform
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-normal">Platform Overview</h1>
            </div>
            <Button className="h-10 rounded-xl" type="button" variant="outline" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </header>

          <div className="space-y-5 p-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              {dashboardQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl bg-blue-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Logged in as</p>
                    <p className="mt-1 text-lg font-semibold">{dashboardAdmin.name || "Platform Admin"}</p>
                    <p className="text-sm text-slate-600">{dashboardAdmin.email}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">Role</p>
                    <p className="mt-1 text-lg font-semibold">{dashboardAdmin.role || "SaaS Admin"}</p>
                    <p className="text-sm text-slate-600">{dashboardAdmin.permissions?.length || 0} permissions prepared</p>
                  </div>
                </div>
              )}
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {overview.map((item) => {
                const Icon = overviewIcons[item.key] || BarChart3;

                return (
                  <div key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-blue-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <p className="mt-4 font-semibold">{item.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.status}</p>
                  </div>
                );
              })}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
};

export default PlatformDashboardPage;
