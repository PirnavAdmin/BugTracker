import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/hooks/use-auth";
import { getChatSocket } from "@/lib/socket";

const PresenceContext = createContext(null);
const ACTIVE_THROTTLE_MS = 60 * 1000;

const getId = (value) => String(value?._id || value?.id || value || "");

export const PresenceProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const currentStatusRef = useRef("offline");
  const lastEmitRef = useRef(0);

  const upsertPresence = useCallback((presence) => {
    const userId = getId(presence?.userId);

    if (!userId) {
      return;
    }

    setPresenceByUserId((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...presence,
        userId,
      },
    }));
  }, []);

  const emitStatus = useCallback(
    (status, options = {}) => {
      if (!token) return;
      const socket = getChatSocket(token);

      if (!socket) return;

      const now = Date.now();
      const shouldThrottle =
        status === "active" &&
        !options.force &&
        currentStatusRef.current === "active" &&
        now - lastEmitRef.current < ACTIVE_THROTTLE_MS;

      if (shouldThrottle) {
        return;
      }

      currentStatusRef.current = status;
      lastEmitRef.current = now;

      if (!socket.connected) {
        socket.connect();
      }

      socket.emit(`user:${status}`, {
        at: new Date(now).toISOString(),
      });
    },
    [token]
  );

  const markActive = useCallback(
    (options = {}) => emitStatus("active", options),
    [emitStatus]
  );
  const markIdle = useCallback(
    (options = {}) => emitStatus("idle", { ...options, force: true }),
    [emitStatus]
  );
  const markOffline = useCallback(
    (options = {}) => emitStatus("offline", { ...options, force: true }),
    [emitStatus]
  );

  useEffect(() => {
    if (!token) {
      setPresenceByUserId({});
      return undefined;
    }

    const socket = getChatSocket(token);
    if (!socket) return undefined;

    const handlePresenceUpdate = (presence) => upsertPresence(presence);
    const handleConnect = () => markActive({ force: true });

    socket.on("presence:update", handlePresenceUpdate);
    socket.on("connect", handleConnect);
    socket.connect();
    markActive({ force: true });

    return () => {
      socket.off("presence:update", handlePresenceUpdate);
      socket.off("connect", handleConnect);
    };
  }, [markActive, token, upsertPresence]);

  useEffect(() => {
    const userId = getId(user);

    if (!userId) return;

    upsertPresence({
      userId,
      status: currentStatusRef.current === "offline" ? "active" : currentStatusRef.current,
      lastSeen: new Date().toISOString(),
    });
  }, [upsertPresence, user]);

  const value = useMemo(
    () => ({
      markActive,
      markIdle,
      markOffline,
      presenceByUserId,
      getPresence: (userId) =>
        presenceByUserId[getId(userId)] || {
          userId: getId(userId),
          status: "offline",
          lastSeen: null,
        },
    }),
    [markActive, markIdle, markOffline, presenceByUserId]
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
};

export const usePresence = () =>
  useContext(PresenceContext) || {
    markActive: () => {},
    markIdle: () => {},
    markOffline: () => {},
    presenceByUserId: {},
    getPresence: () => ({ status: "offline", lastSeen: null }),
  };
