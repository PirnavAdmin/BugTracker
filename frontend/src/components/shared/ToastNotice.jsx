import { AlertCircle, CheckCircle2, X } from "lucide-react";

const ToastNotice = ({ toast, icon, onDismiss }) => {
  if (!toast) {
    return null;
  }

  const isSuccess = toast.type === "success";
  const isWarning = toast.type === "warning";
  const isChat = toast.type === "chat";
  const containerClass = isSuccess
    ? "border-emerald-200 bg-emerald-50/95 text-emerald-900"
    : isWarning
      ? "border-amber-200 bg-amber-50/95 text-amber-900"
      : isChat
        ? "border-blue-200 bg-blue-50/95 text-blue-950"
        : "border-rose-200 bg-rose-50/95 text-rose-900";
  const iconClass = isSuccess
    ? "bg-emerald-100 text-emerald-700"
    : isWarning
      ? "bg-amber-100 text-amber-700"
      : isChat
        ? "bg-blue-100 text-blue-700"
        : "bg-rose-100 text-rose-700";
  const title =
    toast.title ||
    (isSuccess
      ? "Success"
      : isWarning
        ? "Heads up"
        : isChat
          ? "New chat message"
          : "Something went wrong");

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 w-auto max-w-sm sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-6 sm:w-[calc(100%-2rem)]">
      <div
        className={`rounded-[26px] border px-4 py-4 shadow-[0_28px_60px_-30px_rgba(15,23,42,0.42)] backdrop-blur-xl ${containerClass}`}
        role={isSuccess ? "status" : "alert"}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>
            {icon ? (
              icon
            ) : isSuccess ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
          </div>
          <div
            className={`min-w-0 flex-1 ${toast.onClick ? "cursor-pointer" : ""}`}
            onClick={() => {
              if (toast.onClick) {
                toast.onClick();
                if (onDismiss) onDismiss();
              }
            }}
          >
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-sm leading-6">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-1.5 text-current/60 transition hover:bg-black/5 hover:text-current"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ToastNotice;
