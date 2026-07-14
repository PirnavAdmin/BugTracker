import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/api";
import { ROLE_DEVELOPER, ROLE_TEAM_LEAD } from "@/lib/roles";
import { readStoredSession } from "@/lib/session";
import { getChatSocket } from "@/lib/socket";
import { cn, formatDateTime } from "@/lib/utils";

const normalizeNotification = (notification = {}) => ({
  ...notification,
  id: notification.id || notification._id?.toString?.() || notification._id || "",
  timestamp: notification.timestamp || notification.createdAt || new Date().toISOString(),
});

const BUG_KEY_PATTERN = /\b(?:BTT|BUG)[A-Z0-9-]*\b/i;

const resolveNotificationTarget = (notification, user) => {
  const rawLink = String(notification?.link || "").trim();

  if (!rawLink) {
    return "";
  }

  const isDeveloperBugRouteRole =
    user?.role === ROLE_DEVELOPER || user?.role === ROLE_TEAM_LEAD;

  if (!isDeveloperBugRouteRole || !rawLink.startsWith("/issues")) {
    return rawLink;
  }

  const text = `${notification?.text || ""} ${notification?.title || ""}`.toLowerCase();
  const queryString = rawLink.includes("?") ? rawLink.slice(rawLink.indexOf("?") + 1) : "";
  const params = new URLSearchParams(queryString);
  const searchValue = params.get("search") || "";
  const bugId = params.get("bug") || "";
  const looksLikeBugKey = BUG_KEY_PATTERN.test(searchValue) || BUG_KEY_PATTERN.test(text);
  const looksLikeBugText =
    /\bbug\b/.test(text) ||
    /\bdefect\b/.test(text) ||
    /\bready for qa\b/.test(text) ||
    /\breopen(?:ed)?\b/.test(text) ||
    /\bwork queue\b/.test(text) ||
    /\bdeveloper\b/.test(text);

  if (!looksLikeBugKey && !looksLikeBugText && !bugId) {
    return rawLink;
  }

  const nextParams = new URLSearchParams();

  if (searchValue) {
    nextParams.set("search", searchValue);
  }

  if (bugId) {
    nextParams.set("bug", bugId);
  }

  if (/\bwork queue\b/.test(text) || /\bavailable\b/.test(text) || /\bunassigned\b/.test(text)) {
    nextParams.set("status", "available");
  }

  return `/dev/bugs${nextParams.toString() ? `?${nextParams}` : ""}`;
};

const NotificationButton = ({ user }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const notificationsQueryKey = useMemo(
    () => ["issues", "notifications", user?._id],
    [user?._id]
  );
  const unreadQueryKey = useMemo(
    () => ["issues", "notifications", "unread-count", user?._id],
    [user?._id]
  );

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: fetchNotifications,
    enabled: Boolean(user?._id),
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: unreadQueryKey,
    queryFn: fetchUnreadNotificationCount,
    enabled: Boolean(user?._id),
  });

  useEffect(() => {
    if (!user?._id) {
      return;
    }

    const session = readStoredSession();
    const socket = getChatSocket(session?.token);

    if (!socket) {
      return;
    }

    if (!socket.connected) {
      socket.connect();
    }

    const handleNewNotification = (incomingNotification) => {
      const notification = normalizeNotification(incomingNotification);

      queryClient.setQueryData(notificationsQueryKey, (current = []) => {
        const currentNotifications = Array.isArray(current) ? current : [];
        const existingIds = new Set(
          currentNotifications.map((item) => item.id || item._id?.toString?.() || item._id)
        );

        if (notification.id && existingIds.has(notification.id)) {
          return currentNotifications;
        }

        return [notification, ...currentNotifications].slice(0, 20);
      });
      queryClient.invalidateQueries({ queryKey: unreadQueryKey });
    };

    socket.on("notification_received", handleNewNotification);

    return () => {
      socket.off("notification_received", handleNewNotification);
    };
  }, [notificationsQueryKey, queryClient, unreadQueryKey, user?._id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const handleOpenNotification = async (notification) => {
    const normalizedNotification = normalizeNotification(notification);

    if (!normalizedNotification.isRead && normalizedNotification.id) {
      await markNotificationAsRead(normalizedNotification.id);
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      queryClient.invalidateQueries({ queryKey: unreadQueryKey });
    }

    setIsOpen(false);

    const target = resolveNotificationTarget(normalizedNotification, user);

    if (target) {
      navigate(target);
    }
  };

  const handleMarkAllRead = async () => {
    if (!unreadCount || isMarkingAll) {
      return;
    }

    setIsMarkingAll(true);

    try {
      await markAllNotificationsAsRead();
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      queryClient.invalidateQueries({ queryKey: unreadQueryKey });
    } finally {
      setIsMarkingAll(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={cn(
          "relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-white/55 text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white/80 hover:text-blue-700",
          isOpen && "border-blue-200 bg-white text-blue-700"
        )}
        aria-label="Notifications"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="fixed right-3 top-[calc(var(--app-navbar-height)+0.6rem)] z-[120] w-[calc(100vw-1.5rem)] max-w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-32px_rgba(15,23,42,0.5)] sm:right-4 sm:w-[min(360px,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-950">Notifications</p>
              <p className="text-xs text-slate-500">
                {unreadCount ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={!unreadCount || isMarkingAll}
              onClick={handleMarkAllRead}
            >
              {isMarkingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Read
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto py-1">
            {isLoading ? (
              <div className="flex items-center gap-2 px-4 py-5 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notifications
              </div>
            ) : notifications.length ? (
              notifications.map((notification) => {
                const normalizedNotification = normalizeNotification(notification);

                return (
                  <button
                    key={normalizedNotification.id || normalizedNotification.timestamp}
                    type="button"
                    className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                    onClick={() => handleOpenNotification(normalizedNotification)}
                  >
                    <span
                      className={cn(
                        "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                        normalizedNotification.isRead ? "bg-slate-200" : "bg-blue-500"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-5 text-slate-900">
                        {normalizedNotification.text}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {formatDateTime(normalizedNotification.timestamp)}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-semibold text-slate-700">No notifications yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Assigned tasks and bugs will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NotificationButton;
