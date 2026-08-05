import { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Bug,
  CheckCircle2,
  FileText,
  PauseCircle,
  PlayCircle,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const readStoredTestingSession = () => {
  try {
    const rawSession = window.localStorage.getItem("curecode_active_testing_session");
    return rawSession ? JSON.parse(rawSession) : null;
  } catch {
    return null;
  }
};

const TesterProjectWorkspacePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId = "" } = useParams();
  const session = useMemo(
    () => location.state?.session || readStoredTestingSession(),
    [location.state]
  );
  const modules = Array.isArray(session?.modules) && session.modules.length
    ? session.modules
    : ["Login", "Dashboard", "Reports", "API"];

  return (
    <div className="min-h-full space-y-6">
      <section className="overflow-hidden rounded-[24px] border border-blue-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_55%,#f4f0ff_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(37,99,235,0.58)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <Badge className="border-blue-200 bg-blue-50 text-blue-700" variant="outline">
              Project Testing Workspace
            </Badge>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {session?.projectName || "Selected project"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Test the selected build, create bugs as you find them, and finish the session when coverage is complete.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => navigate(`/bugs?view=report&projectId=${encodeURIComponent(projectId || session?.projectId || "")}`)}
              type="button"
            >
              <Bug className="h-4 w-4" />
              Create Bug
            </Button>
            <Button className="rounded-2xl" variant="outline" type="button">
              <FileText className="h-4 w-4" />
              Release Notes
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[20px] border-slate-200/80 bg-white/92 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.36)]">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Rocket className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Build Information</h2>
                <p className="text-sm text-slate-500">Captured when the session started.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Build Version", session?.buildVersion || "-"],
                ["Environment", session?.environment || "-"],
                ["Start Time", session?.startedAt ? new Date(session.startedAt).toLocaleString() : "-"],
                ["Status", session?.status || "Not Started"],
              ].map(([label, value]) => (
                <div className="rounded-2xl bg-slate-50 px-4 py-3" key={label}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[20px] border-slate-200/80 bg-white/92 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.36)]">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Modules Being Tested</h2>
                <p className="text-sm text-slate-500">Coverage areas for this session.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {modules.map((module) => (
                <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-slate-700" key={module}>
                  {module}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-wrap gap-3 rounded-[20px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.36)]">
        <Button className="rounded-2xl bg-blue-600 text-white hover:bg-blue-700" type="button">
          <PlayCircle className="h-4 w-4" />
          Continue Testing
        </Button>
        <Button className="rounded-2xl" variant="outline" type="button">
          <PauseCircle className="h-4 w-4" />
          Pause Testing
        </Button>
        <Button className="rounded-2xl" variant="outline" type="button">
          <CheckCircle2 className="h-4 w-4" />
          Finish Testing
        </Button>
      </section>
    </div>
  );
};

export default TesterProjectWorkspacePage;
