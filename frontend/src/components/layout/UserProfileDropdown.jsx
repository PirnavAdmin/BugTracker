import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  LogOut,
  Lock,
  Settings,
  CreditCard,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import UserAvatar from "@/components/shared/UserAvatar";
import StatusIndicator from "@/components/presence/StatusIndicator";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminPanelAccess, hasWorkspaceMailAccess } from "@/lib/roles";

const UserProfileDropdown = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    // Close on ESC key
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname, location.search]);

  const handleLogout = () => {
    setIsOpen(false);
    logout();
  };

  const handleNavigate = (path) => {
    setIsOpen(false);
    navigate(path);
  };

  const settingsPath = hasAdminPanelAccess(user?.role)
    ? "/settings/users"
    : "/dev/settings";
  const showSettingsLinks = hasAdminPanelAccess(user?.role) || hasWorkspaceMailAccess(user?.role);

  const menuItems = [
    {
      icon: User,
      label: "Profile",
      onClick: () => handleNavigate("/profile"),
    },
    {
      icon: Lock,
      label: "Change Password",
      onClick: () => handleNavigate("/settings?tab=password"),
    },
    ...(showSettingsLinks
      ? [
          {
            icon: Settings,
            label: "Settings",
            onClick: () => handleNavigate(settingsPath),
          },
        ]
      : []),
    ...(hasAdminPanelAccess(user?.role)
      ? [{ icon: CreditCard, label: "Billing & Subscription", onClick: () => handleNavigate("/settings/billing") }]
      : []),
  ];

  return (
    <div className="relative overflow-visible" ref={dropdownRef}>
      {/* Trigger Button - Compact Avatar with Dropdown Indicator */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-1.5 rounded-full border border-white/40 bg-white/35 px-1.5 py-1.5 transition-all duration-200 hover:border-blue-300/60 hover:bg-white/45 focus:outline-none focus:ring-2 focus:ring-blue-400/60 focus:ring-offset-2 focus:ring-offset-transparent"
        aria-label="User profile menu"
        aria-expanded={isOpen}
      >
        <span className="relative">
          <UserAvatar
            user={user}
            className="h-8 w-8 ring-2 ring-white/70 transition-all group-hover:ring-blue-200"
            fallbackClassName="text-xs font-bold"
          />
          <StatusIndicator userId={user?._id || user?.id} className="absolute -bottom-0.5 -right-0.5" />
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-700 shrink-0 transition-all duration-300 ${
            isOpen ? "rotate-180 text-blue-600" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="profile-dropdown-scrollbar absolute right-0 top-[calc(100%+12px)] z-[10000] max-h-[calc(100vh-100px)] w-[min(calc(100vw-2rem),20rem)] min-w-[260px] max-w-[320px] overflow-y-auto overscroll-contain rounded-xl border border-white/70 bg-white/90 py-1 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45),0_8px_24px_-16px_rgba(37,99,235,0.28)] backdrop-blur-xl"
            role="menu"
          >
            {/* User Info Header */}
            <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/95 px-3.5 py-3 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="relative shrink-0">
                  <UserAvatar
                    user={user}
                    className="h-10 w-10 ring-2 ring-blue-100"
                    fallbackClassName="text-sm font-bold"
                  />
                  <StatusIndicator userId={user?._id || user?.id} className="absolute -bottom-0.5 -right-0.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate whitespace-nowrap text-sm font-semibold leading-tight text-slate-900">
                    {user?.name}
                  </p>
                  <p className="mt-0.5 truncate whitespace-nowrap text-xs leading-tight text-slate-500">
                    {user?.email}
                  </p>
                  {user?.role && (
                    <div className="mt-1.5">
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-100/50 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                        <span className="truncate whitespace-nowrap">{user.role}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <nav className="space-y-0.5 px-2 py-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    role="menuitem"
                    className="group/item flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition-all duration-150 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-slate-500 group-hover/item:text-blue-600 transition-colors" />
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Divider */}
            <div className="mx-2 h-px bg-slate-100" />

            {/* Logout Button */}
            <div className="px-2 py-2">
              <button
                onClick={handleLogout}
                role="menuitem"
                className="group/logout flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-red-600 transition-all duration-150 hover:bg-red-50 active:bg-red-100 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-red-400"
              >
                <LogOut className="h-4 w-4 shrink-0 transition-colors" />
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">
                  Logout
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserProfileDropdown;
