import { Navigate, useParams } from "react-router-dom";
import PlatformShell, { platformNavItems } from "@/components/platform/PlatformShell";

const placeholderPages = {
  companies: "Companies",
  subscriptions: "Subscriptions",
  payments: "Payments",
  "ai-usage": "AI Usage",
  storage: "Storage",
  settings: "Platform Settings",
};

const PlatformPlaceholderPage = () => {
  const { platformModule } = useParams();
  const pageTitle = placeholderPages[platformModule];
  const isKnownPlatformModule = platformNavItems.some(
    (item) => item.path === `/platform/${platformModule}`
  );

  if (!pageTitle || !isKnownPlatformModule) {
    return <Navigate to="/platform/dashboard" replace />;
  }

  return (
    <PlatformShell title={pageTitle}>
      <div className="p-4 xl:p-5">
        <section className="rounded-lg border border-slate-200 bg-white px-5 py-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
            {pageTitle}
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-normal text-slate-950">Coming next</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            This platform module will be implemented in the next phase.
          </p>
        </section>
      </div>
    </PlatformShell>
  );
};

export default PlatformPlaceholderPage;
