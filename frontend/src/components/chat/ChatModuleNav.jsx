import { CalendarDays, FolderKanban, MessageCircle, Pin, Star, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODULES = [
  { id: "chats", label: "Chats", icon: MessageCircle },
  { id: "meetings", label: "Meetings", icon: CalendarDays },
  { id: "pinned", label: "Pinned", icon: Pin },
  { id: "files", label: "Shared Files", icon: FolderKanban },
  { id: "starred", label: "Starred", icon: Star },
  { id: "archives", label: "Archives", icon: Archive },
];

const ChatModuleNav = ({ activeModule, onSelect }) => (
  <aside className="hidden h-full min-h-0 max-h-full w-[92px] shrink-0 border-r border-slate-200 bg-slate-50 touch-pan-y flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth px-3 py-5 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden lg:flex dark:border-slate-800 dark:bg-slate-950">
    {MODULES.map((module) => {
      const Icon = module.icon;
      const isActive = activeModule === module.id;

      return (
        <Button
          key={module.id}
          type="button"
          variant="ghost"
          className={cn(
            "flex h-auto shrink-0 flex-col items-center gap-2 rounded-[22px] px-2 py-3 text-center text-[11px] font-bold transition-all",
            isActive
              ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-[0_14px_30px_-14px_rgba(37,99,235,0.55)] hover:from-blue-600 hover:to-blue-700 hover:text-white dark:from-blue-600 dark:to-blue-700 dark:text-white dark:hover:from-blue-500 dark:hover:to-blue-600"
              : "text-slate-500 hover:bg-white/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
          )}
          onClick={() => onSelect(module.id)}
        >
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl transition-colors",
              isActive
                ? "text-white shadow-xs"
                : "border border-slate-200/70 bg-white text-slate-600 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            )}
            style={isActive ? { backgroundColor: "rgba(255, 255, 255, 0.22)" } : undefined}
          >
            <Icon className="h-5 w-5 stroke-[2.2]" />
          </span>
          <span className="leading-4">{module.label}</span>
        </Button>
      );
    })}
  </aside>
);

export default ChatModuleNav;
