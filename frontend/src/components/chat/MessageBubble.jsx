import { memo, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Ban,
  Bug,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  Copy,
  CornerDownRight,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Pencil,
  Reply,
  Smile,
  SmilePlus,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { fetchChatAttachmentBlob } from "@/lib/api";
import { cn, formatDateTime, formatTime } from "@/lib/utils";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🚀", "🎉"];
const MORE_REACTIONS = ["👏", "🔥", "👀", "💯", "🎯", "💡", "🐛", "✅"];

const formatFileSize = (size = 0) => {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getId = (value) => String(value?._id || value?.id || value || "");
const getAttachmentName = (attachment = {}) =>
  attachment.fileName || attachment.name || "Attachment";
const getAttachmentUrl = (attachment = {}) =>
  attachment.fileUrl || attachment.url || "";
const getAttachmentType = (attachment = {}) =>
  attachment.fileType || attachment.type || "";
const isImageAttachment = (attachment = {}) =>
  getAttachmentType(attachment).startsWith("image/");

// Code Snippet Card with language header and copy button
const CodeSnippetBlock = ({ language, code, isOwn }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText?.(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-xl border text-xs shadow-xs",
        isOwn
          ? "border-blue-400/40 bg-slate-950/90 text-slate-100"
          : "border-slate-300/80 bg-slate-900 text-slate-100 dark:border-slate-800"
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-400">
        <span className="uppercase tracking-wider font-mono">{language || "Code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 transition hover:text-white"
          title="Copy code"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="dashboard-scrollbar max-h-72 overflow-x-auto p-3 font-mono text-[12px] leading-relaxed selection:bg-blue-500 selection:text-white">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// Render plain text with Agile issue tags (BTS-101, #45) and search highlights
const renderTextWithIssueTagsAndSearch = (textSegment, isOwn, searchQuery) => {
  if (!textSegment) return null;

  const issueRegex = /(\b[A-Z]{2,10}-\d+\b|\B#[0-9]+\b)/g;
  const parts = textSegment.split(issueRegex);

  return parts.map((part, idx) => {
    if (issueRegex.test(part)) {
      const issueKey = part.startsWith("#") ? part.slice(1) : part;
      return (
        <a
          key={`issue-${idx}`}
          href={`/issues/${encodeURIComponent(issueKey)}`}
          className={cn(
            "inline-flex items-center gap-1 mx-0.5 rounded px-1.5 py-0.5 text-xs font-bold transition select-all",
            isOwn
              ? "bg-white/20 text-white hover:bg-white/30"
              : "bg-blue-100/90 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:hover:bg-blue-900"
          )}
          title={`Agile Issue: ${part}`}
        >
          <Bug className="h-3 w-3 shrink-0 inline-block opacity-90" />
          <span>{part}</span>
        </a>
      );
    }

    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim();
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      const subParts = part.split(regex);
      return (
        <span key={`sub-${idx}`}>
          {subParts.map((sub, subIdx) =>
            regex.test(sub) ? (
              <mark
                key={`mark-${subIdx}`}
                className="rounded bg-amber-300 px-0.5 font-semibold text-slate-950 dark:bg-amber-400 dark:text-slate-950"
              >
                {sub}
              </mark>
            ) : (
              sub
            )
          )}
        </span>
      );
    }

    return part;
  });
};

// Formatted text supporting code blocks, inline code, bold, italic, strikethrough, agile issues & search
const FormattedMessageText = ({ text, searchQuery, isOwn }) => {
  if (!text) return null;

  // Split by fenced code blocks (```lang\n...```)
  const blocks = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    blocks.push({
      type: "code",
      language: match[1] || "code",
      code: match[2].trimEnd(),
    });
    lastIndex = codeBlockRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    blocks.push({ type: "text", content: text.slice(lastIndex) });
  }

  const renderFormattedLine = (line, lineIndex) => {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~)/g);

    return (
      <span key={`line-${lineIndex}`} className="block min-h-[1.25rem]">
        {parts.map((part, partIndex) => {
          if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
            return (
              <code
                key={partIndex}
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[12px] font-medium",
                  isOwn
                    ? "bg-white/20 text-white"
                    : "bg-slate-200/70 text-slate-800 dark:bg-slate-800 dark:text-pink-400"
                )}
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return <strong key={partIndex} className="font-extrabold">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            return <em key={partIndex} className="italic">{part.slice(1, -1)}</em>;
          }
          if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
            return <del key={partIndex} className="line-through opacity-70">{part.slice(2, -2)}</del>;
          }

          return (
            <span key={partIndex}>
              {renderTextWithIssueTagsAndSearch(part, isOwn, searchQuery)}
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-6 selection:bg-blue-200 selection:text-slate-950">
      {blocks.map((block, idx) => {
        if (block.type === "code") {
          return (
            <CodeSnippetBlock
              key={`code-${idx}`}
              language={block.language}
              code={block.code}
              isOwn={isOwn}
            />
          );
        }
        const lines = block.content.split("\n");
        return (
          <div key={`txt-${idx}`}>
            {lines.map((line, lineIdx) => renderFormattedLine(line, lineIdx))}
          </div>
        );
      })}
    </div>
  );
};
};

const MeetingCard = ({ metadata = {}, isOwn }) => {
  const subject = metadata.title || "Chat meeting";
  const joinUrl = metadata.meetingUrl || "";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[18px] border shadow-sm",
        isOwn
          ? "border-white/20 bg-white/10 text-white"
          : "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100"
      )}
    >
      <div className={cn("flex items-start gap-3 px-4 py-3", isOwn ? "bg-white/8" : "bg-white dark:bg-slate-900/90")}>
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
            isOwn ? "bg-white/14" : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
          )}
        >
          <CalendarDays className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{subject}</p>
          <p className={cn("mt-1 text-xs font-medium", isOwn ? "text-white/84" : "text-slate-500 dark:text-slate-400")}>
            In-app chat meeting
          </p>
        </div>
      </div>
      <div className="space-y-2 px-4 py-3">
        <div className={cn("text-xs font-semibold", isOwn ? "text-white/84" : "text-slate-600 dark:text-slate-300")}>
          {formatDateTime(metadata.startTime)}
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 text-xs font-semibold",
            isOwn ? "text-white/84" : "text-slate-600 dark:text-slate-300"
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            {metadata.durationMinutes || 0} minutes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersRound className="h-3.5 w-3.5" />
            {metadata.participantCount || 0} participants
          </span>
        </div>
        {joinUrl ? (
          <a
            href={joinUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition",
              isOwn
                ? "bg-white text-slate-950 hover:bg-slate-100"
                : "bg-slate-950 text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            )}
          >
            Join meeting
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
};

const AttachmentCard = ({
  attachment,
  attachmentIndex,
  conversationId,
  isOwn,
  messageId,
  onPreview,
}) => {
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const fileName = getAttachmentName(attachment);
  const fileUrl = getAttachmentUrl(attachment);
  const fileType = getAttachmentType(attachment);
  const canLoadAttachment = Boolean(conversationId && messageId && fileUrl);

  useEffect(() => {
    if (!isImageAttachment(attachment) || !canLoadAttachment) {
      setImageUrl("");
      return undefined;
    }

    let objectUrl = "";
    let isCurrent = true;
    setImageLoadFailed(false);
    fetchChatAttachmentBlob({ conversationId, messageId, attachmentIndex })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (isCurrent) {
          setImageUrl(objectUrl);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setImageLoadFailed(true);
        }
      });

    return () => {
      isCurrent = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [attachment, attachmentIndex, canLoadAttachment, conversationId, messageId]);

  const handleDownload = async () => {
    if (!canLoadAttachment || isDownloading) return;

    setIsDownloading(true);
    try {
      const blob = await fetchChatAttachmentBlob({
        conversationId,
        messageId,
        attachmentIndex,
        download: true,
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isImageAttachment(attachment) && imageUrl && !imageLoadFailed) {
    return (
      <button
        type="button"
        className="group block w-64 max-w-full overflow-hidden rounded-[18px] border border-white/35 bg-white/16 text-left shadow-sm sm:w-80"
        onClick={() => onPreview({ fileName, fileUrl: imageUrl })}
      >
        <img
          src={imageUrl}
          alt={fileName}
          loading="lazy"
          onError={() => setImageLoadFailed(true)}
          className="max-h-72 w-full bg-white/18 object-contain transition duration-200 group-hover:scale-[1.015]"
        />
        <span
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-xs font-semibold",
            isOwn ? "text-white/90" : "text-slate-600 dark:text-slate-300"
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          <span className="truncate">{fileName}</span>
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-[18px] border px-3 py-3 text-left shadow-sm",
        isOwn
          ? "border-white/25 bg-white/14 text-white"
          : "border-emerald-100 bg-[#f1faf2] text-slate-700 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-200"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
          isOwn ? "bg-white/18" : "bg-white text-emerald-700 dark:bg-slate-700 dark:text-emerald-400"
        )}
      >
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{fileName}</p>
        <p className={cn("mt-0.5 truncate text-xs", isOwn ? "text-white/74" : "text-slate-500 dark:text-slate-400")}>
          {imageLoadFailed ? "Preview unavailable" : fileType || "Document"}{" "}
          {formatFileSize(attachment.size)}
        </p>
      </div>
      {canLoadAttachment ? (
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition",
            isOwn
              ? "bg-white/15 text-white hover:bg-white/25"
              : "bg-white text-emerald-700 hover:bg-emerald-50 dark:bg-slate-700 dark:text-emerald-400 dark:hover:bg-slate-600"
          )}
          aria-label={`Download ${fileName}`}
          title={isDownloading ? "Downloading" : "Download"}
        >
          <Download className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
};

const MessageBubble = memo(
  ({
    currentUserId,
    message,
    onDelete,
    onEdit,
    onJumpToMessage,
    onReact,
    onReply,
    searchQuery = "",
  }) => {
    const [previewImage, setPreviewImage] = useState(null);
    const [copied, setCopied] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [showEmojiStrip, setShowEmojiStrip] = useState(false);
    const [showMoreReactions, setShowMoreReactions] = useState(false);

    const messageId = getId(message);
    const sender = message?.senderId || {};
    const isOwn = getId(sender) === String(currentUserId);
    const seenCount = Array.isArray(message?.seenBy) ? message.seenBy.length : 0;
    const isDeleted = Boolean(message?.deleted);
    const isEdited = Boolean(message?.edited);
    const isImportant = message?.metadata?.priority === "important";
    const replyTo = message?.metadata?.replyTo;

    // Group reactions by emoji
    const groupedReactions = useMemo(() => {
      const reactions = Array.isArray(message?.metadata?.reactions)
        ? message.metadata.reactions
        : [];
      if (!reactions.length) return [];

      const map = new Map();
      reactions.forEach((r) => {
        if (!r?.emoji) return;
        const existing = map.get(r.emoji) || {
          emoji: r.emoji,
          count: 0,
          users: [],
          hasReacted: false,
        };
        existing.count += 1;
        existing.users.push(r);
        if (String(r.userId) === String(currentUserId)) {
          existing.hasReacted = true;
        }
        map.set(r.emoji, existing);
      });

      return Array.from(map.values());
    }, [currentUserId, message?.metadata?.reactions]);

    const handleCopy = async () => {
      if (!message?.message) return;
      try {
        await navigator.clipboard.writeText(message.message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };

    return (
      <>
        <motion.div
          id={`msg-${messageId}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => {
            setIsHovered(false);
            setShowEmojiStrip(false);
          }}
          className={cn(
            "group relative flex w-full gap-2.5 transition-colors sm:gap-3",
            isOwn ? "justify-end" : "justify-start"
          )}
        >
          {!isOwn ? (
            <UserAvatar
              user={sender}
              className="mt-1 h-9 w-9 shrink-0 rounded-2xl border border-slate-200/80 dark:border-slate-700"
              fallbackClassName="text-xs"
            />
          ) : null}

          <div
            className={cn(
              "relative flex max-w-[94%] flex-col space-y-1 sm:max-w-[75%] md:max-w-[68%]",
              isOwn ? "items-end text-right" : "items-start text-left"
            )}
          >
            {/* Sender and role header (for messages from others) */}
            {!isOwn ? (
              <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {sender?.name || "Teammate"}
                </span>
                <span className="rounded-full border border-slate-200/80 bg-white/90 px-2 py-0.2 font-semibold text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {sender?.role || "Member"}
                </span>
              </div>
            ) : null}

            {/* Main Message Bubble */}
            <div
              className={cn(
                "relative rounded-[20px] border px-3.5 py-2.5 shadow-sm transition-all sm:rounded-[22px] sm:px-4 sm:py-3",
                isDeleted
                  ? "border-dashed border-slate-300 bg-slate-50/80 text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400"
                  : isOwn
                  ? "border-blue-600 bg-blue-600 text-white shadow-blue-500/10 dark:border-blue-700 dark:bg-blue-600 dark:text-white"
                  : "border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
                isImportant && !isDeleted && (isOwn ? "border-l-[4px] border-l-amber-300 shadow-md" : "border-l-[4px] border-l-rose-500 shadow-md")
              )}
            >
              {/* Teams Important Flag Banner */}
              {isImportant && !isDeleted ? (
                <div
                  className={cn(
                    "mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider",
                    isOwn ? "text-amber-200" : "text-rose-600 dark:text-rose-400"
                  )}
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Important</span>
                </div>
              ) : null}

              {/* Quoted / Replying preview header */}
              {replyTo && !isDeleted ? (
                <div
                  onClick={() => onJumpToMessage?.(replyTo.id)}
                  title="Click to jump to quoted message"
                  className={cn(
                    "mb-2.5 flex cursor-pointer items-start gap-2 rounded-xl border-l-[3.5px] px-2.5 py-1.5 text-xs transition hover:opacity-90",
                    isOwn
                      ? "border-white/90 bg-white/15 text-white"
                      : "border-blue-600 bg-blue-50/80 text-slate-700 dark:border-blue-500 dark:bg-slate-800/80 dark:text-slate-200"
                  )}
                >
                  <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate font-extrabold">{replyTo.senderName || "Teammate"}</p>
                    <p className="truncate opacity-90">{replyTo.text || "Message"}</p>
                  </div>
                </div>
              ) : null}

              {/* Message Content or Deleted Placeholder */}
              {isDeleted ? (
                <div className="flex items-center gap-2 text-xs italic">
                  <Ban className="h-3.5 w-3.5 opacity-70" />
                  <span>This message was deleted</span>
                </div>
              ) : (
                <>
                  {message?.message ? (
                    <FormattedMessageText
                      text={message.message}
                      searchQuery={searchQuery}
                      isOwn={isOwn}
                    />
                  ) : null}

                  {message?.metadata?.type === "meeting" ? (
                    <div className={cn(message?.message && "mt-3")}>
                      <MeetingCard metadata={message.metadata} isOwn={isOwn} />
                    </div>
                  ) : null}

                  {Array.isArray(message?.attachments) && message.attachments.length ? (
                    <div className={cn("space-y-2", message?.message && "mt-3")}>
                      {message.attachments.map((attachment, index) => (
                        <AttachmentCard
                          key={`${getAttachmentName(attachment)}-${index}`}
                          attachment={attachment}
                          attachmentIndex={index}
                          conversationId={getId(message.conversationId)}
                          isOwn={isOwn}
                          messageId={messageId}
                          onPreview={setPreviewImage}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {/* Teams Floating Action Strip (on hover) */}
            {!isDeleted && (isHovered || showEmojiStrip || showMoreReactions) ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                className={cn(
                  "absolute -top-3.5 z-20 flex items-center gap-0.5 rounded-full border border-slate-200/90 bg-white/95 px-1 py-0.5 shadow-md backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95",
                  isOwn ? "right-2" : "left-2"
                )}
              >
                {/* Quick Reaction Emojis */}
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact?.(messageId, emoji)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-sm transition hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}

                {/* More Reactions Palette */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowMoreReactions((cur) => !cur)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400",
                      showMoreReactions && "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300"
                    )}
                    title="More reactions"
                    aria-label="More reactions"
                  >
                    <SmilePlus className="h-3.5 w-3.5" />
                  </button>
                  {showMoreReactions ? (
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-full border border-slate-200 bg-white/98 p-1 shadow-xl backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/98">
                      {MORE_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            onReact?.(messageId, emoji);
                            setShowMoreReactions(false);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-sm transition hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title={`React with ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mx-0.5 h-3.5 w-px bg-slate-200 dark:bg-slate-700" />

                {/* Reply Button */}
                <button
                  type="button"
                  onClick={() =>
                    onReply?.({
                      _id: messageId,
                      senderName: sender?.name || (isOwn ? "You" : "Teammate"),
                      text: message?.message || "Attachment",
                    })
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                  title="Reply"
                  aria-label="Reply to message"
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>

                {/* Copy Text Button */}
                {message?.message ? (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                    title={copied ? "Copied!" : "Copy message text"}
                    aria-label="Copy message text"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                ) : null}

                {/* Edit Button (if own message) */}
                {isOwn && message?.message ? (
                  <button
                    type="button"
                    onClick={() => onEdit?.(message)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-amber-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-amber-400"
                    title="Edit message"
                    aria-label="Edit message"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : null}

                {/* Delete Button (if own message) */}
                {isOwn ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this message?")) {
                        onDelete?.(messageId);
                      }
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-400"
                    title="Delete message"
                    aria-label="Delete message"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </motion.div>
            ) : null}

            {/* Reactions cluster under bubble */}
            {groupedReactions.length > 0 && !isDeleted ? (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-1.5 pt-0.5",
                  isOwn ? "justify-end" : "justify-start"
                )}
              >
                {groupedReactions.map(({ emoji, count, hasReacted, users }) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact?.(messageId, emoji)}
                    title={users.map((u) => u.userName || "Teammate").join(", ")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shadow-xs transition hover:scale-105",
                      hasReacted
                        ? "border border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600/70 dark:bg-blue-950/70 dark:text-blue-300"
                        : "border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    )}
                  >
                    <span>{emoji}</span>
                    <span className="text-[11px] font-bold">{count}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {/* Timestamp & Status footer */}
            <div
              className={cn(
                "flex items-center gap-1.5 px-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400",
                isOwn ? "justify-end" : "justify-start"
              )}
            >
              <span>{formatTime(message?.createdAt)}</span>
              {isEdited && !isDeleted ? (
                <span className="text-[10px] italic text-slate-400 dark:text-slate-500">
                  (edited)
                </span>
              ) : null}
              {isOwn && message?.pending ? <Clock3 className="h-3 w-3" /> : null}
              {isOwn && !message?.pending && !isDeleted ? (
                <CheckCheck
                  className={cn(
                    "h-3.5 w-3.5",
                    seenCount > 1
                      ? "text-blue-500 dark:text-blue-400"
                      : "text-slate-400 dark:text-slate-500"
                  )}
                  title={seenCount > 1 ? "Seen" : "Delivered"}
                />
              ) : null}
              {message?.failed ? (
                <span
                  className="text-rose-500"
                  title={message.errorMessage || "Unable to send message"}
                >
                  Failed: {message.errorMessage || "Unable to send message"}
                </span>
              ) : null}
            </div>
          </div>
        </motion.div>

        {/* Image Preview Modal */}
        {previewImage ? (
          <div
            className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4"
            onClick={() => setPreviewImage(null)}
          >
            <div
              className="relative max-h-[88dvh] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[20px] border border-white/20 bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-5xl sm:rounded-[24px]"
              onClick={(event) => event.stopPropagation()}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 z-10 bg-white/90 hover:bg-white"
                onClick={() => setPreviewImage(null)}
                aria-label="Close preview"
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
              <img
                src={previewImage.fileUrl}
                alt={previewImage.fileName}
                className="max-h-[88dvh] w-full object-contain sm:max-h-[90vh]"
              />
            </div>
          </div>
        ) : null}
      </>
    );
  }
);

MessageBubble.displayName = "MessageBubble";

export default MessageBubble;
