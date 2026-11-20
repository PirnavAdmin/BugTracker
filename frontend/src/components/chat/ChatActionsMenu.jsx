import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const PADDING = 12;
const GAP = 8;
const WIDTH = 224;

// Follow the existing body-portal action-menu pattern. Layer 45 stays above
// chat content/composer and below dialog backdrops (50) and call overlays (75+).
const ChatActionsMenu = ({ triggerRef, initialFocus = "first", onClose, children }) => {
  const menuRef = useRef(null);
  const closeRef = useRef(onClose);
  const focusedRef = useRef(false);
  const [position, setPosition] = useState(null);
  const [theme, setTheme] = useState("light");

  useLayoutEffect(() => { closeRef.current = onClose; });

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return undefined;
    const themeRoot = trigger.closest(".app-theme-root");
    let frame;
    const update = () => {
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft || 0;
      const y = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      const anchor = trigger.getBoundingClientRect();
      if (anchor.bottom < y || anchor.top > y + height || anchor.right < x || anchor.left > x + width) {
        closeRef.current();
        return;
      }
      const menuWidth = Math.min(WIDTH, Math.max(0, width - PADDING * 2));
      const maxHeight = Math.max(0, height - PADDING * 2);
      const menuHeight = Math.min(menu.getBoundingClientRect().height, maxHeight);
      const below = y + height - anchor.bottom - GAP;
      const above = anchor.top - y - GAP;
      const upward = menuHeight > below && above > below;
      const next = {
        left: Math.max(x + PADDING, Math.min(anchor.right - menuWidth, x + width - PADDING - menuWidth)),
        top: Math.max(y + PADDING, Math.min(upward ? anchor.top - GAP - menuHeight : anchor.bottom + GAP, y + height - PADDING - menuHeight)),
        width: menuWidth,
        maxHeight,
      };
      setPosition((current) => current && Object.keys(next).every((key) => current[key] === next[key]) ? current : next);
      setTheme(themeRoot?.getAttribute("data-theme") || "light");
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };
    const handlePointerDown = (event) => {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) closeRef.current();
    };
    const handleKeyDown = (event) => {
      const inMenu = menu.contains(document.activeElement);
      // Clicking a disabled menu option can leave focus on body. Escape should
      // still dismiss this menu, without consuming Escape from a focused dialog.
      const ownsFocus = inMenu || trigger.contains(document.activeElement) || document.activeElement === document.body;
      if (event.key === "Escape" && ownsFocus) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        trigger.focus({ preventScroll: true });
      } else if (inMenu && event.key === "Tab") {
        closeRef.current();
        // Let native Tab/Shift+Tab continue from the trigger's original place.
        trigger.focus({ preventScroll: true });
      } else if (inMenu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]:not(:disabled)'));
        const index = items.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(trigger);
    observer.observe(menu);
    const themeObserver = new MutationObserver(schedule);
    if (themeRoot) themeObserver.observe(themeRoot, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("scroll", schedule, true);
    document.addEventListener("animationend", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    update();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("scroll", schedule, true);
      document.removeEventListener("animationend", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!position || focusedRef.current) return;
    const items = menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)');
    const item = items?.[initialFocus === "last" ? items.length - 1 : 0];
    if (item) {
      item.focus();
      focusedRef.current = true;
    }
  }, [position, initialFocus]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={cn("app-theme-root", theme === "dark" && "dark")} data-theme={theme}>
      <div
        ref={menuRef}
        id="chat-actions-menu"
        role="menu"
        aria-labelledby="chat-actions-trigger"
        className="fixed z-[45] w-56 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)]"
        style={{ ...position, opacity: position ? 1 : 0 }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export default ChatActionsMenu;
