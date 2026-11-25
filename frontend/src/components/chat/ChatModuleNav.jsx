import {
  Archive,
  CalendarDays,
  MessageCircle,
  Pin,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODULES = [
  { id: "chats", label: "Chats", icon: MessageCircle },
  { id: "meetings", label: "Meetings", icon: CalendarDays },
  { id: "pinned", label: "Pinned", icon: Pin },
  { id: "starred", label: "Starred", icon: Star },
  { id: "archives", label: "Archived", icon: Archive },
];

const ChatModuleNav = ({ activeModule, onSelect }) => (
  <nav
    aria-label="Chat section navigation"
    className="flex h-full min-h-0 w-[68px] shrink-0 flex-col gap-1 overflow-hidden border-r border-slate-200 bg-slate-50 px-1.5 py-2 sm:w-[72px] lg:w-[76px] dark:border-slate-800 dark:bg-slate-950"
  >
    {MODULES.map((module) => {
      const Icon = module.icon;
      const isActive = activeModule === module.id;

      return (
        <Button
          key={module.id}
          type="button"
          variant="ghost"
          title={module.label}
          aria-label={module.label}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex h-auto min-h-0 max-h-[76px] flex-1 shrink flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-1 text-center text-[9px] font-semibold leading-3 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
            isActive
              ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:text-white dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500"
              : "text-slate-600 hover:bg-white hover:text-blue-700 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-blue-300"
          )}
          onClick={() => onSelect(module.id)}
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
              isActive
                ? "bg-white/15 text-white"
                : "border border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            )}
          >
            <Icon className="h-[18px] w-[18px] stroke-[2]" />
          </span>
          <span className="max-w-full leading-3">{module.label}</span>
        </Button>
      );
    })}
  </nav>
);

export default ChatModuleNav;
