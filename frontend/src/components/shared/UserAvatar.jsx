import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveApiAssetUrl } from "@/lib/api";
import { cn, getInitials } from "@/lib/utils";

const UserAvatar = ({
  user,
  name,
  src,
  className,
  fallbackClassName,
  imageClassName,
}) => {
  const displayName = name || user?.name || "";
  const avatarUrl = src || user?.avatarUrl || user?.profileImageUrl || "";
  const resolvedAvatarUrl = resolveApiAssetUrl(avatarUrl);

  return (
    <Avatar className={className}>
      {resolvedAvatarUrl ? (
        <AvatarImage
          src={resolvedAvatarUrl}
          alt={displayName ? `${displayName} profile picture` : "Profile picture"}
          className={imageClassName}
        />
      ) : null}
      <AvatarFallback
        className={cn(
          "bg-gradient-to-br from-blue-500 to-blue-600 text-white",
          fallbackClassName
        )}
      >
        {getInitials(displayName)}
      </AvatarFallback>
    </Avatar>
  );
};

export default UserAvatar;
