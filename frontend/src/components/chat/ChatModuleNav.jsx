import {
  Archive,
  CalendarDays,
  FolderKanban,
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
  { id: "files", label: "Shared Files", icon: FolderKanban },
  { id: "starred", label: "Starred", icon: Star },
  { id: "archives", label: "Archived", icon: Archive },
];

const ChatModuleNav = ({ activeModule, onSelect }) => (
  <aside className="hidden h-full min-h-0 max-h-full w-[92px] shrink-0 flex-col gap-1 overflow-hidden border-r border-slate-200 bg-slate-50 px-2 py-3 lg:flex dark:border-slate-800 dark:bg-slate-950">
    {MODULES.map((module) => {
      const Icon = module.icon;
      const isActive = activeModule === module.id;

      return (
        <Button
          key={module.id}
          type="button"
          variant="ghost"
          className={cn(
            "flex h-auto min-h-0 max-h-[72px] flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-[22px] px-1.5 py-1 text-center text-[10px] font-bold transition-all",
            isActive
              ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-[0_14px_30px_-14px_rgba(37,99,235,0.55)] hover:from-blue-600 hover:to-blue-700 hover:text-white dark:from-blue-600 dark:to-blue-700 dark:text-white dark:hover:from-blue-500 dark:hover:to-blue-600"
              : "text-slate-500 hover:bg-white/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
          )}
          onClick={() => onSelect(module.id)}
        >
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-2xl transition-colors",
              isActive
                ? "text-white shadow-xs"
                : "border border-slate-200/70 bg-white text-slate-600 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            )}
            style={isActive ? { backgroundColor: "rgba(255, 255, 255, 0.22)" } : undefined}
          >
            <Icon className="h-4 w-4 stroke-[2.2]" />
          </span>
          <span className="leading-3">{module.label}</span>
        </Button>
      );
    })}
  </aside>
);

export default ChatModuleNav;
