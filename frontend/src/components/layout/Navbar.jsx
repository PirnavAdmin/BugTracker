import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Activity,
  BookOpen,
  Bug,
  FolderKanban,
  KanbanSquare,
  LayoutDashboard,
  Layers3,
  ListTodo,
  LogOut,
  Menu,
  MessageCircle,
  Users2,
  X,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import pirnavLogo from "@/assets/pirnav-logo.png";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useChatStore } from "@/lib/chatStore";
import { getRoleNavigation } from "@/lib/roles";
import { cn, getInitials } from "@/lib/utils";
import NotificationButton from "./NotificationButton";
import UserProfileDropdown from "./UserProfileDropdown";

const iconMap = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  teams: Users2,
  backlog: Layers3,
  stories: BookOpen,
  issues: KanbanSquare,
  bugs: Bug,
  tasks: ListTodo,
  reports: BarChart3,
  chat: MessageCircle,
  activity: Activity,
};

const navItemClassName =
  "group inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition duration-200 ease-out whitespace-nowrap";

const Navbar = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigation = getRoleNavigation(user?.role);
  const chatUnreadCount = useChatStore((state) =>
    state.conversations.reduce(
      (total, conversation) => total + Number(conversation.unreadCount || 0),
      0
    )
  );
  const hasLoadedConversations = useChatStore(
    (state) => state.hasLoadedConversations
  );
  const loadConversations = useChatStore((state) => state.loadConversations);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const closeDesktopMenu = (event) => {
      if (event.matches) {
        setIsMenuOpen(false);
      }
    };

    closeDesktopMenu(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", closeDesktopMenu);
      return () => mediaQuery.removeEventListener("change", closeDesktopMenu);
    }

    mediaQuery.addListener(closeDesktopMenu);
    return () => mediaQuery.removeListener(closeDesktopMenu);
  }, []);

  useEffect(() => {
    if (!user || hasLoadedConversations) {
      return;
    }

    loadConversations();
  }, [hasLoadedConversations, loadConversations, user]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMenuOpen]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-[var(--app-navbar-height)] overflow-visible border-b border-white/40 bg-gradient-to-r from-white/78 via-blue-50/72 to-sky-100/68 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.14),transparent_32%),radial-gradient(circle_at_top_right,_rgba(186,230,253,0.20),transparent_40%)]" />

      <div className="relative z-10 mx-auto h-full w-full max-w-screen-2xl overflow-visible px-4 sm:px-6 lg:px-8">
        <div className="flex h-full items-center gap-2 overflow-visible lg:gap-3">
          <NavLink
            to={navigation[0]?.href || "/"}
            className="flex min-w-0 items-center gap-3"
          >
            <img
              src={pirnavLogo}
              alt="Pirnav Software Solutions Pvt. Ltd."
              className="h-auto max-h-9 w-auto max-w-[132px] object-contain sm:max-h-10 sm:max-w-[190px]"
            />
          </NavLink>

          <nav className="hidden items-center gap-1 lg:flex">
            {navigation.map((item) => {
              const Icon = iconMap[item.icon] || LayoutDashboard;

              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      navItemClassName,
                      isActive
                        ? "border-blue-200/70 bg-gradient-to-r from-blue-500/80 via-sky-400/75 to-cyan-300/70 font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)]"
                        : "border-white/30 bg-white/32 text-slate-700 hover:-translate-y-0.5 hover:border-blue-200/60 hover:bg-white/48 hover:text-slate-900"
                    )
                  }
                >
                  <Icon className="h-4 w-4 transition-transform duration-300 group-hover:scale-105" />
                  <span>{item.label}</span>
                  {item.icon === "chat" && chatUnreadCount ? (
                    <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-extrabold text-blue-600 shadow-sm">
                      {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          <div className="relative z-[100] ml-auto hidden items-center gap-2 overflow-visible lg:flex">
            <NotificationButton user={user} />
            <UserProfileDropdown />
          </div>

          <Button
            className="ml-auto shrink-0 lg:hidden"
            variant="outline"
            size="icon"
            type="button"
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            {isMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile drawer menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop overlay - dark semi-transparent with blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMenuOpen(false)}
            />

            {/* Mobile drawer - slides from RIGHT */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              className="fixed right-0 top-0 z-[9999] flex h-screen w-[80%] max-w-[320px] flex-col border-l border-slate-200 bg-white shadow-2xl lg:hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer header with close button */}
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5 sm:py-5">
                <img
                  src={pirnavLogo}
                  alt="Pirnav Software Solutions Pvt. Ltd."
                  className="h-auto max-h-8 w-auto max-w-[100px] object-contain"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMenuOpen(false)}
                  className="shrink-0 -mr-2 hover:bg-slate-100"
                >
                  <X className="h-5 w-5 text-slate-600" />
                </Button>
              </div>

              {/* Drawer content - scrollable */}
              <div className="flex-1 overflow-y-auto space-y-3 px-3 py-4 sm:space-y-4 sm:px-4 sm:py-5">
                {/* Navigation items */}
                <nav className="space-y-2">
                  {navigation.map((item) => {
                    const Icon = iconMap[item.icon] || LayoutDashboard;

                    return (
                      <NavLink
                        key={item.href}
                        to={item.href}
                        onClick={() => setIsMenuOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "group flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-200",
                            isActive
                              ? "border-blue-200/60 bg-blue-50 text-blue-700 shadow-sm"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200/50 hover:bg-blue-50/70 hover:text-blue-700"
                          )
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.icon === "chat" && chatUnreadCount ? (
                          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-extrabold text-white shadow-sm">
                            {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                          </span>
                        ) : null}
                      </NavLink>
                    );
                  })}
                </nav>

                {/* Divider */}
                <div className="my-3 h-px bg-slate-200" />

                {/* User info with quick actions */}
                <div className="space-y-2.5">
                  <div className="flex justify-end">
                    <NotificationButton user={user} />
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                    <Avatar className="h-10 w-10 shrink-0 ring-2 ring-blue-100">
                      <AvatarFallback className="font-bold bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                        {getInitials(user?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {user?.name}
                      </p>
                      <p className="truncate text-xs text-slate-600">{user?.email}</p>
                    </div>
                  </div>

                  {/* Quick profile actions */}
                  <NavLink
                    to="/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className="block w-full rounded-lg border border-blue-200/60 bg-blue-50 px-4 py-2.5 text-center text-sm font-medium text-blue-700 transition-all duration-200 hover:bg-blue-100 hover:border-blue-300"
                  >
                    View Profile
                  </NavLink>
                </div>
              </div>

              {/* Drawer footer with logout */}
              <div className="border-t border-slate-200 px-3 py-3 sm:px-4 sm:py-3.5">
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-red-600 active:bg-red-700"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Logout</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
