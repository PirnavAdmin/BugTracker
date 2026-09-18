import { cn } from "@/lib/utils";

export const PROJECT_DIALOG_CLOSE_CLASS =
  "[&>button]:right-4 [&>button]:top-4 [&>button]:z-[80] [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-2xl [&>button]:border-slate-200 [&>button]:bg-white [&>button]:p-0 [&>button]:text-slate-400 [&>button]:shadow-[0_10px_26px_-18px_rgba(15,23,42,0.65)] [&>button]:ring-1 [&>button]:ring-slate-900/5 [&>button]:backdrop-blur [&>button]:transition [&>button:hover]:border-slate-300 [&>button:hover]:bg-slate-50 [&>button:hover]:text-slate-800";

export const projectDialogContentClass = (className = "") =>
  cn(
    "!top-[5.25rem] z-[80] !translate-y-0 gap-0 overflow-hidden border-white/80 bg-white/95 p-0 shadow-[0_34px_100px_-52px_rgba(15,23,42,0.58)] backdrop-blur-2xl",
    "duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-3 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:slide-out-to-top-2",
    "max-sm:!top-2 max-sm:w-[calc(100vw-1rem)] max-sm:rounded-[22px]",
    "sm:!top-[5.75rem]",
    PROJECT_DIALOG_CLOSE_CLASS,
    className
  );

export const projectDialogHeaderClass = (className = "") =>
  cn(
    "sticky top-0 z-10 border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-3.5 backdrop-blur-xl sm:px-5 sm:py-4",
    className
  );

export const projectDialogBodyClass = (className = "") =>
  cn(
    "project-modal-scrollbar min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5",
    className
  );

export const projectDialogFooterClass = (className = "") =>
  cn(
    "sticky bottom-0 z-10 border-t border-slate-200/80 bg-white/94 px-4 py-3 backdrop-blur-xl sm:px-5",
    className
  );
