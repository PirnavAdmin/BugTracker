import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/50 dark:text-blue-300",
        secondary: "border-gray-200 bg-gray-100 text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
        success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300",
        warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300",
        danger: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-300",
        outline: "border-gray-300 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Badge = ({ className, variant, ...props }) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);

export { Badge, badgeVariants };
