// Call presence is a workspace-scoped, per-user overlay, never message history.
export const resolveChatPresenceStatus = ({ callStatus, presenceStatus, isOnline }) =>
  callStatus || presenceStatus || (isOnline ? "active" : "offline");
