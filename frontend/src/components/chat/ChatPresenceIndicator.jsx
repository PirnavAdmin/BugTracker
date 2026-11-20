import { MonitorUp } from "lucide-react";
import { useCall } from "@/components/chat/CallProvider";
import { usePresence } from "@/context/PresenceContext";
import StatusIndicator from "@/components/presence/StatusIndicator";
import { resolveChatPresenceStatus } from "@/lib/chat-presence";

const ChatPresenceIndicator = ({ userId, isOnline, ...props }) => {
  const { callPresence } = useCall();
  const { presenceByUserId } = usePresence();
  const status = resolveChatPresenceStatus({
    callStatus: callPresence[userId],
    presenceStatus: presenceByUserId[userId]?.status,
    isOnline,
  });

  return <StatusIndicator {...props} userId={userId} status={status} />;
};

export const PresentationIndicator = ({ userId }) => {
  const { callPresence, presentingUsers } = useCall();
  const isInCall = ["in-call", "in-group-call"].includes(callPresence[userId]);
  if (!isInCall || !presentingUsers[userId]) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold" role="status" aria-label="Presenting" title="Presenting">
      <MonitorUp className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Presenting</span>
    </span>
  );
};

export default ChatPresenceIndicator;
