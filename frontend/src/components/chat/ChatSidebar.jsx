import { memo, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Hash, MessageCircle, Pin, Plus, Search, Star, Trash2, UsersRound, X } from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusIndicator from "@/components/presence/StatusIndicator";
import { useChatStore } from "@/lib/chatStore";
import { cn, formatTime } from "@/lib/utils";

const getId = (value) => String(value?._id || value?.id || value || "");

const getConversationName = (conversation, currentUserId) => {
  if (conversation.type === "direct") {
    const user = (conversation.participants || []).find(
      (participant) => getId(participant) !== String(currentUserId)
    );
    return user?.name || "Direct message";
  }

  return conversation.name || conversation.projectId?.name || conversation.teamId?.name || "Group chat";
};

const getConversationSubtitle = (conversation, currentUserId) => {
  if (conversation.type === "direct") {
    const user = (conversation.participants || []).find(
      (participant) => getId(participant) !== String(currentUserId)
    );
    return user?.role || user?.email || "Teammate";
  }

  if (conversation.channelType === "project") {
    return "Project channel";
  }

  if (conversation.channelType === "team") {
    return "Team channel";
  }

  return `${conversation.participants?.length || 0} participants`;
};

const ConversationButton = memo(
  ({ conversation, currentUserId, isActive, onlineUsers, onDelete, onSelect }) => {
    const toggleConversationPreference = useChatStore(
      (state) => state.toggleConversationPreference
    );
    const title = getConversationName(conversation, currentUserId);
    const subtitle = getConversationSubtitle(conversation, currentUserId);
    const directUser = (conversation.participants || []).find(
      (participant) => getId(participant) !== String(currentUserId)
    );
    const isOnline =
      conversation.type === "direct" && onlineUsers.includes(getId(directUser));
    const canDelete = !["project", "team"].includes(conversation.channelType);

    const handleDelete = async (event) => {
      event.stopPropagation();
      const actionLabel = conversation.type === "direct" ? "delete this chat" : "remove this group chat";

      if (!window.confirm(`Are you sure you want to ${actionLabel}?`)) {
        return;
      }

      await onDelete(getId(conversation));
    };

    return (
      <div
        className={cn(
          "group flex w-full items-center gap-3 rounded-[22px] border px-3 py-3 text-left transition-all duration-200",
          isActive
            ? "border-slate-900 bg-slate-950 text-white shadow-[0_16px_36px_-24px_rgba(15,23,42,0.42)]"
            : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(getId(conversation))}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="relative shrink-0">
            {conversation.type === "direct" ? (
              <UserAvatar
                user={directUser}
                name={directUser?.name || title}
                className="h-11 w-11 rounded-2xl"
                fallbackClassName="text-xs"
              />
            ) : (
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-2xl border",
                  isActive
                    ? "border-white/30 bg-white/10"
                    : "border-slate-200 bg-slate-100 text-slate-700"
                )}
              >
                {conversation.channelType === "project" ? (
                  <Hash className="h-4 w-4" />
                ) : (
                  <UsersRound className="h-4 w-4" />
                )}
              </span>
            )}
            {conversation.type === "direct" ? (
              <StatusIndicator
                userId={getId(directUser)}
                status={isOnline ? "active" : "offline"}
                className="absolute -bottom-0.5 -right-0.5"
              />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-sm font-extrabold">{title}</p>
                {conversation.isPinned ? (
                  <Pin className="h-3 w-3 shrink-0 text-blue-500" />
                ) : null}
                {conversation.isStarred ? (
                  <Star className="h-3 w-3 shrink-0 text-amber-500 fill-amber-500" />
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {conversation.lastMessageAt ? (
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      isActive ? "text-white/75" : "text-slate-400"
                    )}
                  >
                    {formatTime(conversation.lastMessageAt)}
                  </span>
                ) : null}
                {conversation.unreadCount ? (
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold",
                      isActive
                        ? "bg-white text-slate-950"
                        : "bg-slate-950 text-white"
                    )}
                  >
                    {conversation.unreadCount}
                  </span>
                ) : null}
              </div>
            </div>
            <p
              className={cn(
                "mt-0.5 truncate text-xs font-medium",
                isActive ? "text-white/82" : "text-slate-500"
              )}
            >
              {conversation.lastMessage || subtitle}
            </p>
          </div>
        </button>

        {/* Hover Quick Actions */}
        <div className="flex items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <button
            type="button"
            title={conversation.isPinned ? "Unpin chat" : "Pin chat"}
            aria-label={conversation.isPinned ? "Unpin chat" : "Pin chat"}
            onClick={(e) => {
              e.stopPropagation();
              toggleConversationPreference(getId(conversation), "isPinned");
            }}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-blue-500/10 hover:text-blue-600",
              conversation.isPinned
                ? "text-blue-500"
                : isActive
                ? "text-white/80 hover:text-white"
                : "text-slate-400"
            )}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={conversation.isStarred ? "Remove star" : "Star chat"}
            aria-label={conversation.isStarred ? "Remove star" : "Star chat"}
            onClick={(e) => {
              e.stopPropagation();
              toggleConversationPreference(getId(conversation), "isStarred");
            }}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-amber-500/10 hover:text-amber-500",
              conversation.isStarred
                ? "text-amber-500 fill-amber-500"
                : isActive
                ? "text-white/80 hover:text-white"
                : "text-slate-400"
            )}
          >
            <Star className={cn("h-3.5 w-3.5", conversation.isStarred && "fill-amber-500")} />
          </button>
          {canDelete ? (
            <button
              type="button"
              title={conversation.type === "direct" ? "Delete chat" : "Remove group chat"}
              aria-label={conversation.type === "direct" ? "Delete chat" : "Remove group chat"}
              onClick={handleDelete}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-rose-500/10 hover:text-rose-600",
                isActive ? "text-white/80 hover:text-white" : "text-slate-400"
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    );
  }
);

ConversationButton.displayName = "ConversationButton";

const Section = ({ title, items, children }) => (
  <section className="space-y-2">
    <div className="flex items-center justify-between px-1">
      <h2 className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </h2>
      <span className="text-xs font-bold text-slate-400">{items.length}</span>
    </div>
    <div className="space-y-2">{children}</div>
  </section>
);

const ChatSidebar = memo(
  ({
    activeConversationId,
    conversations,
    currentUserId,
    isOpen,
    onlineUsers,
    onClose,
    onCreateDirect,
    onCreateGroup,
    onDelete,
    onSearch,
    onSelect,
    searchResults,
  }) => {
    const [query, setQuery] = useState("");
    const [sidebarFilter, setSidebarFilter] = useState("all");
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);
    const selectedMemberIds = useMemo(
      () => new Set(selectedMembers.map((member) => getId(member))),
      [selectedMembers]
    );

    useEffect(() => {
      const timer = setTimeout(() => onSearch(query), 260);
      return () => clearTimeout(timer);
    }, [onSearch, query]);

    const resetGroupComposer = () => {
      setIsCreatingGroup(false);
      setGroupName("");
      setSelectedMembers([]);
      setQuery("");
    };

    const handleCreateGroup = async (event) => {
      event.preventDefault();

      if (!groupName.trim() || selectedMembers.length < 1) {
        return;
      }

      setIsSubmittingGroup(true);

      try {
        await onCreateGroup({
          name: groupName.trim(),
          participants: selectedMembers.map((member) => getId(member)),
        });
        resetGroupComposer();
      } finally {
        setIsSubmittingGroup(false);
      }
    };

    const visibleConversations = useMemo(() => {
      if (sidebarFilter === "unread") {
        return conversations.filter((conversation) => Number(conversation.unreadCount || 0) > 0);
      }
      if (sidebarFilter === "direct") {
        return conversations.filter((conversation) => conversation.type === "direct");
      }
      if (sidebarFilter === "channels") {
        return conversations.filter((conversation) => conversation.type !== "direct");
      }
      return conversations;
    }, [conversations, sidebarFilter]);

    const pinnedConversations = useMemo(
      () =>
        visibleConversations.filter(
          (conversation) => conversation.isPinned && !conversation.isArchived
        ),
      [visibleConversations]
    );

    const unpinnedConversations = useMemo(
      () =>
        visibleConversations.filter(
          (conversation) => !conversation.isPinned || conversation.isArchived
        ),
      [visibleConversations]
    );

    const groupedConversations = useMemo(
      () => ({
        pinned: pinnedConversations,
        direct: unpinnedConversations.filter(
          (conversation) => conversation.type === "direct"
        ),
        projects: unpinnedConversations.filter(
          (conversation) => conversation.channelType === "project"
        ),
        groups: unpinnedConversations.filter(
          (conversation) =>
            conversation.type !== "direct" && conversation.channelType !== "project"
        ),
      }),
      [pinnedConversations, unpinnedConversations]
    );

    const sidebarContent = (
      <aside className="flex h-full w-full flex-col overflow-hidden border-r border-slate-200 bg-white shadow-none">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-500">
              Realtime
            </p>
            <h1 className="mt-1 text-xl font-extrabold text-slate-950">Chat</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="New group"
              aria-label="New group"
              onClick={() => setIsCreatingGroup((current) => !current)}
            >
              {isCreatingGroup ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="shrink-0 border-b border-white/60 p-4">
          {isCreatingGroup ? (
            <form className="mb-4 space-y-3" onSubmit={handleCreateGroup}>
              <Input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className="bg-white/78"
                maxLength={120}
                placeholder="Group name"
              />
              {selectedMembers.length ? (
                <div className="flex flex-wrap gap-2">
                  {selectedMembers.map((member) => (
                    <button
                      key={getId(member)}
                      type="button"
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800"
                      onClick={() =>
                        setSelectedMembers((current) =>
                          current.filter((item) => getId(item) !== getId(member))
                        )
                      }
                    >
                      <span className="truncate">{member.name}</span>
                      <X className="h-3 w-3 shrink-0" />
                    </button>
                  ))}
                </div>
              ) : null}
              <Button
                type="submit"
                className="h-10 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                disabled={!groupName.trim() || selectedMembers.length < 1 || isSubmittingGroup}
              >
                <UsersRound className="h-4 w-4" />
                Create group
              </Button>
            </form>
          ) : null}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="bg-white/78 pl-10"
              placeholder={isCreatingGroup ? "Add teammates" : "Search teammates"}
            />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All" },
              { id: "unread", label: "Unread" },
              { id: "direct", label: "Direct" },
              { id: "channels", label: "Channels" },
            ].map((filterItem) => (
              <button
                key={filterItem.id}
                type="button"
                onClick={() => setSidebarFilter(filterItem.id)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-semibold transition",
                  sidebarFilter === filterItem.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                {filterItem.label}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {query.trim().length >= 2 && searchResults.length ? (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="dashboard-scrollbar mt-3 max-h-60 space-y-1 overflow-y-auto rounded-[22px] border border-white/70 bg-white/85 p-2 shadow-lg"
              >
                {searchResults.map((user) => (
                  <button
                    key={getId(user)}
                    type="button"
                    onClick={() => {
                      if (isCreatingGroup) {
                        setSelectedMembers((current) =>
                          selectedMemberIds.has(getId(user))
                            ? current.filter((member) => getId(member) !== getId(user))
                            : [...current, user]
                        );
                        return;
                      }

                      onCreateDirect(getId(user));
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-slate-100"
                  >
                    <span className="relative">
                      <UserAvatar
                        user={user}
                        className="h-9 w-9 rounded-2xl"
                        fallbackClassName="text-xs"
                      />
                      <StatusIndicator userId={getId(user)} className="absolute -bottom-0.5 -right-0.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-slate-800">
                        {user.name}
                      </span>
                      <span className="block truncate text-xs font-medium text-slate-500">
                        {user.role}
                      </span>
                    </span>
                    {isCreatingGroup && selectedMemberIds.has(getId(user)) ? (
                      <Check className="ml-auto h-4 w-4 text-slate-950" />
                    ) : null}
                  </button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="dashboard-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {groupedConversations.pinned.length ? (
            <Section title="Pinned" items={groupedConversations.pinned}>
              {groupedConversations.pinned.map((conversation) => (
                <ConversationButton
                  key={getId(conversation)}
                  conversation={conversation}
                  currentUserId={currentUserId}
                  isActive={activeConversationId === getId(conversation)}
                  onlineUsers={onlineUsers}
                  onDelete={onDelete}
                  onSelect={onSelect}
                />
              ))}
            </Section>
          ) : null}

          <Section title="Direct Messages" items={groupedConversations.direct}>
            {groupedConversations.direct.map((conversation) => (
              <ConversationButton
                key={getId(conversation)}
                conversation={conversation}
                currentUserId={currentUserId}
                isActive={activeConversationId === getId(conversation)}
                onlineUsers={onlineUsers}
                onDelete={onDelete}
                onSelect={onSelect}
              />
            ))}
          </Section>

          <Section title="Project Teams" items={groupedConversations.projects}>
            {groupedConversations.projects.map((conversation) => (
              <ConversationButton
                key={getId(conversation)}
                conversation={conversation}
                currentUserId={currentUserId}
                isActive={activeConversationId === getId(conversation)}
                onlineUsers={onlineUsers}
                onDelete={onDelete}
                onSelect={onSelect}
              />
            ))}
          </Section>

          <Section title="Group Channels" items={groupedConversations.groups}>
            {groupedConversations.groups.map((conversation) => (
              <ConversationButton
                key={getId(conversation)}
                conversation={conversation}
                currentUserId={currentUserId}
                isActive={activeConversationId === getId(conversation)}
                onlineUsers={onlineUsers}
                onDelete={onDelete}
                onSelect={onSelect}
              />
            ))}
          </Section>

          {!conversations.length ? (
            <div className="rounded-[24px] border border-white/70 bg-white/58 px-4 py-8 text-center">
              <MessageCircle className="mx-auto h-8 w-8 text-slate-700" />
              <p className="mt-3 text-sm font-bold text-slate-800">
                No conversations yet
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Search for a teammate to start a direct chat.
              </p>
            </div>
          ) : null}
        </div>
      </aside>
    );

    return (
      <>
        <div className="hidden h-full w-[380px] shrink-0 lg:block">{sidebarContent}</div>
        <AnimatePresence>
          {isOpen ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-950/30 p-3 backdrop-blur-sm lg:hidden"
              onClick={onClose}
            >
              <motion.div
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                className="h-full max-w-[360px]"
                onClick={(event) => event.stopPropagation()}
              >
                {sidebarContent}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </>
    );
  }
);

ChatSidebar.displayName = "ChatSidebar";

export default ChatSidebar;
