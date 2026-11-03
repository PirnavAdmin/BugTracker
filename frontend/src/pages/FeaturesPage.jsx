import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Bot, Bug, CalendarDays, Code2, FolderKanban, GitBranch, MessageCircle, MonitorDown, ShieldCheck, Sparkles, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { Header } from "@/pages/PublicSite";
import sprintPlanningScreenshot from "@/assets/features/sprint-planning.png";
import bugTriageScreenshot from "@/assets/features/bug-triage.png";
import reportsScreenshot from "@/assets/features/reports.png";
import chatScreenshot from "@/assets/features/chat.png";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const features = [
  [FolderKanban, "Projects", "Organize teams, projects, requirements and delivery work in one place.", ["Projects", "Epics", "Stories", "Tasks"]],
  [CalendarDays, "Sprint Planning", "Plan sprints, estimate work, assign ownership and keep delivery on track.", ["Sprint progress", "Story points", "Task status", "Velocity"]],
  [Bug, "Bug Tracking", "Capture, prioritize, assign and resolve bugs without losing context.", ["Severity", "Priority", "Assignee", "Status"]],
  [ShieldCheck, "QA & Testing", "Give testers a dedicated workflow to validate changes and manage verification.", ["Test cases", "Ready for QA", "Testing", "Verified"]],
  [GitBranch, "Git Integration", "Bring commits, changed files and development activity into CureCode.", ["Commit", "Files", "Branch", "Pull request"]],
  [MessageCircle, "Team Collaboration", "Keep developers, testers, managers and stakeholders connected.", ["Chat", "Notifications", "Mentions", "Activity"]],
  [Bot, "AI Assistance", "Generate descriptions, analyze issues and help teams move faster.", ["Descriptions", "Analysis", "Code review", "Suggestions"]],
  [BarChart3, "Reports & Analytics", "Understand delivery health, bugs, story progress and project performance.", ["Velocity", "Completed work", "Bug trends", "Performance"]],
  [Video, "Real-Time Collaboration", "Communicate through chat, notifications and real-time meetings.", ["Online users", "Chat", "Calls", "Notifications"]],
];

const InstallForWindowsButton = () => {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      navigator.standalone === true;
    setIsInstalled(Boolean(isStandalone));

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (isPrompting) {
      return;
    }
    if (!installPrompt) {
      setShowInstructions(true);
      return;
    }

    const prompt = installPrompt;
    setInstallPrompt(null);
    setIsPrompting(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === "accepted") {
        setIsInstalled(true);
      }
    } catch {
      setShowInstructions(true);
    } finally {
      setIsPrompting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        disabled={isInstalled || isPrompting}
        className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-7 py-3.5 font-bold text-indigo-800 shadow-sm transition hover:border-indigo-300 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 disabled:cursor-default disabled:opacity-70"
        aria-label={isInstalled ? "CureCode is already installed" : "Install CureCode on Windows"}
        aria-busy={isPrompting}
      >
        <MonitorDown className="h-5 w-5" aria-hidden="true" />
        {isInstalled ? "CureCode Installed" : isPrompting ? "Opening installer..." : "Install on Windows"}
      </button>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Install CureCode on Windows</DialogTitle>
            <DialogDescription>
              Install CureCode as an app through Chrome or Microsoft Edge. This adds the website to your desktop experience; it does not download a .exe installer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-6 text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-950">Google Chrome</h3>
              <p>Open CureCode, then select the Install icon in the address bar. If it is not shown, open the menu and choose Cast, save, and share → Install page as app.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-950">Microsoft Edge</h3>
              <p>Open CureCode, then choose Settings and more → More tools → Apps → Install this site as an app.</p>
            </div>
            <p className="text-xs text-slate-500">If your browser does not offer installation, open this page in a current version of Chrome or Edge on Windows.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold">
              <a className="text-indigo-700 underline underline-offset-2" href="https://support.google.com/chrome/answer/9658361" target="_blank" rel="noreferrer">Chrome installation help</a>
              <a className="text-indigo-700 underline underline-offset-2" href="https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge" target="_blank" rel="noreferrer">Edge installation help</a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default function FeaturesPage({ showWindowsInstall = false } = {}) {
  const showcases = [
    ["Sprint planning in one view", "Plan each sprint around a clear goal, choose work your team can complete, and follow progress through delivery.", sprintPlanningScreenshot, "CureCode sprint planning page with backlog, sprint summary, and active sprint area."],
    ["Triage and manage bugs", "Review incoming issues, compare priority and severity, and move bugs through your team’s workflow.", bugTriageScreenshot, "CureCode bug triage board showing reported issues and bug status metrics."],
    ["Reports that clarify delivery", "Explore project, sprint, task, and bug reports to understand delivery trends and team workload.", reportsScreenshot, "CureCode enterprise reports page with report categories, filters, and delivery summaries."],
    ["Keep team conversations connected", "Chat with teammates and project channels, with meetings and shared files close at hand.", chatScreenshot, "CureCode chat page with direct messages, project channels, and conversation workspace."]
  ];
  return <><Header/><main className="relative isolate overflow-hidden bg-[#f9fbff] text-slate-950"><section className="relative overflow-hidden border-b border-slate-200/70"><div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(220,228,247,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(220,228,247,.5)_1px,transparent_1px)] bg-[size:100px_100px]"/><div className="absolute -left-32 top-10 -z-10 h-96 w-96 rounded-full bg-cyan-200/50 blur-3xl"/><div className="absolute -right-32 top-24 -z-10 h-[30rem] w-[30rem] rounded-full bg-violet-200/50 blur-3xl"/><div className="mx-auto flex min-h-[690px] max-w-7xl flex-col items-center justify-center px-5 py-20 text-center sm:px-8"><p className="rounded-full border border-violet-200 bg-white/75 px-5 py-2 text-sm font-bold tracking-[.12em] text-violet-700 shadow-sm">✦ THE CURECODE PLATFORM</p><h1 className="mt-8 max-w-5xl text-[clamp(3.2rem,7vw,6.8rem)] font-black leading-[.95] tracking-[-.06em]">Everything your team needs to <span className="bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600 bg-clip-text text-transparent">build better software.</span></h1><p className="mt-7 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">Plan, build, test, track and ship software together in one connected workspace.</p><div className="mt-9 flex flex-wrap justify-center gap-3"><Link to="/signup" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-700 to-blue-600 px-7 py-3.5 font-bold text-white shadow-xl shadow-indigo-200">Get Started <ArrowRight className="h-5 w-5"/></Link>{showWindowsInstall ? <InstallForWindowsButton /> : null}<Link to="/login" className="rounded-full border border-indigo-200 bg-white/75 px-7 py-3.5 font-bold text-slate-800">Sign In</Link></div><div className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm font-bold"><span className="text-blue-600">▣ Plan</span><span className="text-violet-600">&lt;/&gt; Build</span><span className="text-emerald-600">◉ Test</span><span className="text-orange-500">✦ Ship</span></div></div></section><section className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><div className="text-center"><p className="font-bold uppercase tracking-[.16em] text-violet-700">One connected workspace</p><h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Built for the entire software lifecycle</h2><p className="mt-4 text-lg text-slate-600">Everything your team needs from planning to production.</p></div><div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{features.map(([Icon, title, description, tags]) => <article key={title} className="group rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_-42px_rgba(30,41,59,.45)] transition hover:-translate-y-1 hover:border-violet-200 hover:shadow-xl"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 text-violet-700"><Icon className="h-6 w-6"/></span><h3 className="mt-5 text-xl font-bold">{title}</h3><p className="mt-3 min-h-14 leading-6 text-slate-600">{description}</p><div className="mt-5 flex flex-wrap gap-2">{tags.map(tag => <span key={tag} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{tag}</span>)}</div></article>)}</div></section><section className="mx-auto max-w-6xl space-y-20 px-5 py-10 sm:px-8">{showcases.map(([title, copy, screenshot, alt], index) => <div key={title} className="grid items-center gap-10 md:grid-cols-2"><div className={index % 2 ? "md:order-2" : ""}><img src={screenshot} alt={alt} loading="lazy" className="block h-auto w-full rounded-3xl border border-slate-200 bg-white shadow-xl shadow-indigo-100/60" /></div><div className={index % 2 ? "md:order-1" : ""}><p className="font-bold uppercase tracking-[.16em] text-violet-700">CureCode workflow</p><h2 className="mt-3 text-4xl font-black tracking-tight">{title}</h2><p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">{copy}</p></div></div>)}</section><section className="mx-auto my-20 max-w-6xl rounded-[2rem] bg-gradient-to-r from-violet-700 to-blue-600 px-6 py-16 text-center text-white shadow-2xl shadow-indigo-200 sm:px-10"><Sparkles className="mx-auto h-8 w-8"/><h2 className="mt-5 text-4xl font-black">Ready to bring your team together?</h2><p className="mt-4 text-lg text-white/85">Plan, build, test and ship with CureCode.</p><div className="mt-8 flex justify-center gap-3"><Link to="/signup" className="rounded-full bg-white px-6 py-3 font-bold text-violet-700">Get Started</Link><Link to="/" className="rounded-full border border-white/50 px-6 py-3 font-bold">Explore CureCode</Link></div></section></main></>;
}
