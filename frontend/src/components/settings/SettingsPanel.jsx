import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SettingsPanel = ({
  actions = null,
  children,
  className,
  contentClassName,
  description,
  footerActions = null,
  headerClassName,
  title,
}) => (
  <Card
    className={cn(
      "rounded-[18px] border-slate-200/90 bg-white shadow-none",
      footerActions ? "overflow-visible" : "overflow-hidden",
      className
    )}
  >
    <CardHeader
      className={cn("border-b border-slate-100 px-6 py-6 sm:px-7", headerClassName)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-[26px] font-bold tracking-tight text-slate-950">
            {title}
          </CardTitle>
          {description ? (
            <CardDescription className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {description}
            </CardDescription>
          ) : null}
        </div>

        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </CardHeader>

    <CardContent className={cn("p-5 sm:p-7", contentClassName)}>
      {children}
    </CardContent>
    {footerActions ? (
      <div className="sticky bottom-0 z-10 flex justify-end border-t border-slate-100 bg-white/95 px-5 py-3 backdrop-blur sm:px-7">
        {footerActions}
      </div>
    ) : null}
  </Card>
);

export default SettingsPanel;
