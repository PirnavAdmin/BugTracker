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

export default ChatPresenceIndicator;
