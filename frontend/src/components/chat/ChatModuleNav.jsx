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
  <aside className="hidden h-full w-[92px] shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-5 lg:flex lg:flex-col lg:gap-2">
    {MODULES.map((module) => {
      const Icon = module.icon;
      const isActive = activeModule === module.id;

      return (
        <Button
          key={module.id}
          type="button"
          variant="ghost"
          className={cn(
            "flex h-auto flex-col gap-2 rounded-[22px] px-2 py-3 text-center text-[11px] font-bold",
            isActive
              ? "bg-slate-950 text-white shadow-[0_16px_36px_-24px_rgba(15,23,42,0.4)]"
              : "text-slate-500 hover:bg-white/80 hover:text-slate-900"
          )}
          onClick={() => onSelect(module.id)}
        >
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl",
              isActive ? "bg-white/10 text-white" : "bg-white text-slate-500"
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="leading-4">{module.label}</span>
        </Button>
      );
    })}
  </aside>
);

export default ChatModuleNav;
