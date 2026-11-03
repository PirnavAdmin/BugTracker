import {
  FileUp,
  KeyRound,
  MailCheck,
  MailPlus,
  MonitorCog,
  ServerCog,
  ShieldCheck,
  Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap = {
  users: Users2,
  invite: MailPlus,
  roles: ShieldCheck,
  screens: MonitorCog,
  sender: MailCheck,
  smtp: ServerCog,
  password: KeyRound,
  import: FileUp,
};

const SettingsSidebar = ({ activeItem, items = [], onItemChange }) => (
  <aside className="min-w-0 lg:sticky lg:top-5 lg:self-start">
    <nav
      className="settings-sidebar-scrollbar flex w-full gap-2 overflow-x-auto rounded-[20px] border border-slate-200/80 bg-white/95 p-2.5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.32)] backdrop-blur lg:min-h-[calc(var(--app-viewport-height)-var(--app-navbar-height)-4.25rem)] lg:max-h-[calc(var(--app-viewport-height)-var(--app-navbar-height)-2.5rem)] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-contain"
      aria-label="Admin settings"
    >
      {items.map((item) => {
        const Icon = item.icon || iconMap[item.id] || Users2;
        const isActive = activeItem === item.id;

        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "group flex min-w-max items-center gap-3 rounded-[14px] border px-3 py-3.5 text-left text-sm font-semibold transition duration-200 lg:min-w-0",
              isActive
                ? "border-indigo-100 bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 shadow-[0_10px_24px_-20px_rgba(79,70,229,0.7)]"
                : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
            )}
            onClick={() => onItemChange(item.id)}
            aria-current={isActive ? "page" : undefined}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition",
                isActive
                  ? "bg-white text-indigo-700 shadow-[0_8px_18px_-14px_rgba(79,70,229,0.8)]"
                  : "bg-slate-50 text-slate-500 group-hover:bg-white group-hover:text-slate-700"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  </aside>
);

export default SettingsSidebar;
