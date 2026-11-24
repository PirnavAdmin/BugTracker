export const PLATFORM_AUTH_STORAGE_KEY = "curecode_platform_session";
export const PLATFORM_AUTH_SESSION_CLEARED_EVENT = "curecode_platform_session_cleared";
const DEFAULT_PLATFORM_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const getStorageTargets = () => {
  if (typeof window === "undefined") {
    return [];
  }

  return [window.localStorage, window.sessionStorage].filter(Boolean);
};

const isSessionExpired = (session) => {
  const expiresAt = session?.expiresAt ? new Date(session.expiresAt).getTime() : 0;

  return Boolean(expiresAt && expiresAt <= Date.now());
};

const normalizePlatformSession = (session) => {
  if (!session?.token || !session?.platformAdmin) {
    return null;
  }

  return {
    ...session,
    expiresAt:
      session.expiresAt ||
      new Date(Date.now() + DEFAULT_PLATFORM_SESSION_MAX_AGE_MS).toISOString(),
  };
};

export const readPlatformSession = () => {
  if (typeof window === "undefined") {
    return null;
  }

  for (const storage of getStorageTargets()) {
    try {
      const raw = storage.getItem(PLATFORM_AUTH_STORAGE_KEY);
      const session = raw ? normalizePlatformSession(JSON.parse(raw)) : null;

      if (!session) {
        continue;
      }

      if (isSessionExpired(session)) {
        storage.removeItem(PLATFORM_AUTH_STORAGE_KEY);
        continue;
      }

      return session;
    } catch (error) {
      storage.removeItem(PLATFORM_AUTH_STORAGE_KEY);
    }
  }

  return null;
};

export const clearPlatformSession = () => {
  if (typeof window === "undefined") {
    return;
  }

  getStorageTargets().forEach((storage) => storage.removeItem(PLATFORM_AUTH_STORAGE_KEY));
};

export const writePlatformSession = (value) => {
  if (typeof window === "undefined") {
    return;
  }

  const session = normalizePlatformSession(value);

  clearPlatformSession();

  if (!session) {
    return;
  }

  window.sessionStorage.setItem(PLATFORM_AUTH_STORAGE_KEY, JSON.stringify(session));
};
