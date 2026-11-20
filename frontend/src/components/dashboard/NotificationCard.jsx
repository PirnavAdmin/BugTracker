import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDateTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const NotificationCard = ({
  notifications = [],
  unreadCount = 0,
  isLoading,
  onOpenNotification,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isLoading || notifications.length <= 1 || isPaused) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % notifications.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [isLoading, notifications.length, isPaused]);

  useEffect(() => {
    if (currentIndex >= notifications.length && notifications.length > 0) {
      setCurrentIndex(0);
    }
  }, [notifications.length, currentIndex]);

  const currentNotification = notifications[currentIndex];

  return (
    <div
      className="group flex h-16 min-w-[280px] flex-1 flex-col justify-center rounded-[22px] border border-blue-100/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(240,249,255,0.78),rgba(239,246,255,0.68))] px-4 py-2 shadow-[0_16px_34px_-26px_rgba(37,99,235,0.5)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_38px_-24px_rgba(37,99,235,0.6)] dark:border-slate-800 dark:bg-slate-900/90 dark:bg-none dark:shadow-black/50"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-3 w-3 text-blue-600 dark:text-blue-400" />
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-600/80 dark:text-blue-400/80">
            Recent Notifications
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </div>

      <div className="relative h-7 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center gap-2">
            <Skeleton className="h-3 w-3/4 rounded-full" />
            <Skeleton className="h-2 w-8 rounded-full" />
          </div>
        ) : notifications.length > 0 && currentNotification ? (
          <div className="relative h-full w-full">
            <AnimatePresence mode="wait">
              <motion.button
                key={currentIndex}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="absolute inset-0 flex items-center justify-between gap-3 text-left"
                onClick={() => onOpenNotification(currentNotification)}
              >
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {currentNotification.text}
                </p>
                <span className="shrink-0 text-[10px] font-medium text-slate-400">
                  {formatDateTime(currentNotification.timestamp).split(",")[1]?.trim() || "Just now"}
                </span>
              </motion.button>
            </AnimatePresence>
          </div>
        ) : (
          <p className="flex h-full items-center text-xs font-medium text-slate-400">
            No new notifications
          </p>
        )}
      </div>
    </div>
  );
};

export default NotificationCard;
