import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Bug,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Copy,
  CornerDownRight,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Forward,
  ImageIcon,
  Languages,
  Link2,
  MoreHorizontal,
  Pencil,
  Pin,
  Reply,
  Smile,
  SmilePlus,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { fetchChatAttachmentBlob } from "@/lib/api";
import { cn, formatDateTime, formatTime } from "@/lib/utils";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮"];
const MORE_REACTIONS = ["🚀", "🎉", "👏", "🔥", "👀", "💯", "🎯", "💡", "🐛", "✅"];

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

const TRANSLATE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "te", label: "Telugu" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
];

const MessageBubble = memo(
  ({
    currentUserId,
    message,
    participants = [],
    onCreateIssue,
    onDelete,
    onEdit,
    onForward,
    onJumpToMessage,
    onMarkUnread,
    onPin,
    onReact,
    onReply,
    searchQuery = "",
  }) => {
    const [previewImage, setPreviewImage] = useState(null);
    const [copied, setCopied] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [showEmojiStrip, setShowEmojiStrip] = useState(false);
    const [showMoreReactions, setShowMoreReactions] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [showTranslateSubmenu, setShowTranslateSubmenu] = useState(false);
    const [showReadBySubmenu, setShowReadBySubmenu] = useState(false);
    const [translatedInfo, setTranslatedInfo] = useState(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [aiInsight, setAiInsight] = useState(null);
    const [isReported, setIsReported] = useState(false);
    const actionBarRef = useRef(null);

    const messageId = getId(message);
    const sender = message?.senderId || {};
    const isOwn = getId(sender) === String(currentUserId);
    const seenCount = Array.isArray(message?.seenBy) ? message.seenBy.length : 0;
    const isDeleted = Boolean(message?.deleted);
    const isEdited = Boolean(message?.edited);
    const isPinned = Boolean(message?.metadata?.isPinned);
    const isImportant = message?.metadata?.priority === "important";
    const forwardedFrom = message?.metadata?.forwardedFrom;
    const replyTo = message?.metadata?.replyTo;

    const readReceipts = useMemo(() => {
      const otherParticipants = (participants || []).filter(
        (p) => getId(p) && getId(p) !== String(currentUserId)
      );
      const seenEntries = (Array.isArray(message?.seenBy) ? message.seenBy : []).filter(
        (entry) => getId(entry?.userId) && getId(entry?.userId) !== String(currentUserId)
      );
      const participantMap = new Map(
        otherParticipants.map((p) => [getId(p), p])
      );
      const readers = seenEntries.map((entry) => {
        const uid = getId(entry.userId);
        const userObj = participantMap.get(uid) || {};
        return {
          id: uid,
          name: userObj.name || entry.userId?.name || "Teammate",
          seenAt: entry.seenAt,
        };
      });
      return {
        readByCount: readers.length,
        totalRecipients: Math.max(otherParticipants.length, readers.length),
        readers,
      };
    }, [currentUserId, message?.seenBy, participants]);

    useEffect(() => {
      if (!showActionsMenu && !showMoreReactions) return undefined;
      const handleOutside = (event) => {
        if (actionBarRef.current && !actionBarRef.current.contains(event.target)) {
          setShowActionsMenu(false);
          setShowMoreReactions(false);
          setShowTranslateSubmenu(false);
          setShowReadBySubmenu(false);
        }
      };
      document.addEventListener("pointerdown", handleOutside);
      return () => document.removeEventListener("pointerdown", handleOutside);
    }, [showActionsMenu, showMoreReactions]);

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

    const handleTranslate = async (langCode, langLabel) => {
      if (!message?.message) return;
      setIsTranslating(true);
      setShowTranslateSubmenu(false);
      setShowActionsMenu(false);
      try {
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
            message.message
          )}&langpair=autodetect|${langCode}`
        );
        const data = await res.json();
        const translatedText = data?.responseData?.translatedText;
        if (translatedText && typeof translatedText === "string") {
          setTranslatedInfo({ langLabel, text: translatedText });
        } else {
          setTranslatedInfo({
            langLabel,
            text: `[${langLabel}] ${message.message}`,
          });
        }
      } catch {
        setTranslatedInfo({
          langLabel,
          text: `Translation unavailable offline — original: "${message.message}"`,
        });
      } finally {
        setIsTranslating(false);
      }
    };

    const handleAskCureCodeAI = () => {
      setShowActionsMenu(false);
      if (aiInsight) {
        setAiInsight(null);
        return;
      }
      const rawText = (message?.message || "").trim();
      const issueMatches = rawText.match(/\b[A-Z]{2,10}-\d+\b|\B#\d+\b/g) || [];
      const hasActionVerb = /\b(fix|deploy|push|check|update|bug|error|test|review|urgent|block|issue|report|task)\b/i.test(rawText);
      const summary =
        rawText.length > 140 ? `${rawText.slice(0, 140)}...` : rawText || "Attachment shared";
      setAiInsight({
        summary,
        intent: hasActionVerb ? "Actionable engineering update" : "Team discussion",
        issues: [...new Set(issueMatches)],
        suggestion: hasActionVerb
          ? "Consider converting this message into a tracked Bug or Task so it appears on the sprint board."
          : "No blockers detected. You can pin this message if teammates need quick reference.",
      });
    };

    const handleReportConcern = () => {
      setShowActionsMenu(false);
      setIsReported(true);
    };

    const handleCopyLink = async () => {
      try {
        const url = `${window.location.origin}${window.location.pathname}?conversation=${encodeURIComponent(
          getId(message?.conversationId)
        )}#msg-${messageId}`;
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy link:", err);
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
            setShowMoreReactions(false);
            setShowActionsMenu(false);
            setShowTranslateSubmenu(false);
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
                {isEdited && !isDeleted ? (
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    Edited
                  </span>
                ) : null}
                {isPinned && !isDeleted ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                    <Pin className="h-2.5 w-2.5" />
                    Pinned
                  </span>
                ) : null}
              </div>
            ) : isPinned && !isDeleted ? (
              <div className="flex items-center gap-1 px-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                <Pin className="h-2.5 w-2.5" />
                <span>Pinned</span>
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

              {/* Forwarded From Banner */}
              {forwardedFrom && !isDeleted ? (
                <div
                  className={cn(
                    "mb-2 flex items-center gap-1.5 text-[11px] font-semibold italic",
                    isOwn ? "text-white/80" : "text-slate-500 dark:text-slate-400"
                  )}
                >
                  <Forward className="h-3 w-3 shrink-0" />
                  <span>Forwarded from {forwardedFrom.senderName || "Teammate"}</span>
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
                    <div className="flex items-center gap-2">
                      <p className="truncate font-extrabold">{replyTo.senderName || "Teammate"}</p>
                      {replyTo.createdAt ? (
                        <span className="shrink-0 text-[10px] font-medium opacity-75">
                          {formatDateTime(replyTo.createdAt)}
                        </span>
                      ) : null}
                    </div>
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

                  {/* Inline Translation Card */}
                  {isTranslating ? (
                    <div className="mt-2 text-xs italic opacity-75">Translating...</div>
                  ) : translatedInfo ? (
                    <div
                      className={cn(
                        "mt-2.5 rounded-xl border px-3 py-2 text-xs text-left",
                        isOwn
                          ? "border-white/25 bg-white/12 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider opacity-80">
                        <span className="flex items-center gap-1">
                          <Languages className="h-3 w-3" />
                          Translated to {translatedInfo.langLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => setTranslatedInfo(null)}
                          className="underline hover:opacity-100"
                        >
                          Hide
                        </button>
                      </div>
                      <p className="leading-relaxed">{translatedInfo.text}</p>
                    </div>
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

            {/* Inline CureCode AI Insight Card */}
            {aiInsight && !isDeleted ? (
              <div className="w-full rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 to-blue-50/90 p-3 text-left text-xs text-slate-700 shadow-sm dark:border-indigo-900/60 dark:from-indigo-950/50 dark:to-slate-900 dark:text-slate-200">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-extrabold text-indigo-700 dark:text-indigo-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    CureCode AI Summary
                  </span>
                  <button
                    type="button"
                    onClick={() => setAiInsight(null)}
                    className="rounded-full p-0.5 text-slate-400 hover:bg-white/60 hover:text-slate-700 dark:hover:bg-slate-800"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{aiInsight.intent}</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">{aiInsight.suggestion}</p>
                {aiInsight.issues.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {aiInsight.issues.map((issue) => (
                      <span
                        key={issue}
                        className="rounded bg-indigo-100 px-1.5 py-0.5 font-bold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300"
                      >
                        {issue}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Reported Flag Notice */}
            {isReported && !isDeleted ? (
              <div className="flex items-center gap-1 px-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                <span>Flagged for workspace admin review</span>
              </div>
            ) : null}

            {/* Teams Floating Action Card (on hover, top-right) */}
            {!isDeleted && (isHovered || showEmojiStrip || showMoreReactions || showActionsMenu) ? (
              <motion.div
                ref={actionBarRef}
                initial={{ opacity: 0, y: 2, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 2, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                className="absolute -top-4 right-2 z-20 flex items-center gap-0.5 rounded-xl border border-slate-200/90 bg-white/98 px-1.5 py-0.5 shadow-lg backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/98"
              >
                {/* Quick Reaction Emojis */}
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact?.(messageId, emoji)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-sm transition hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}

                {/* More Reactions Palette */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreReactions((cur) => !cur);
                      setShowActionsMenu(false);
                      setShowTranslateSubmenu(false);
                    }}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400",
                      showMoreReactions && "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300"
                    )}
                    title="More reactions"
                    aria-label="More reactions"
                  >
                    <SmilePlus className="h-4 w-4" />
                  </button>
                  {showMoreReactions ? (
                    <div className="absolute bottom-full right-0 mb-1.5 z-30 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/98 p-1.5 shadow-xl backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/98">
                      {MORE_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            onReact?.(messageId, emoji);
                            setShowMoreReactions(false);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm transition hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title={`React with ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-700" />

                {/* Quick Action: Edit for own message, Reply for received message */}
                {isOwn && message?.message ? (
                  <button
                    type="button"
                    onClick={() => onEdit?.(message)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                    title="Edit"
                    aria-label="Edit message"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                ) : !isOwn ? (
                  <button
                    type="button"
                    onClick={() =>
                      onReply?.({
                        _id: messageId,
                        senderName: sender?.name || "Teammate",
                        text: message?.message || "Attachment",
                        createdAt: message?.createdAt,
                      })
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                    title="Reply"
                    aria-label="Reply to message"
                  >
                    <Reply className="h-4 w-4" />
                  </button>
                ) : null}

                {/* More Actions (...) Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionsMenu((cur) => !cur);
                      setShowMoreReactions(false);
                      setShowTranslateSubmenu(false);
                      setShowReadBySubmenu(false);
                    }}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                      showActionsMenu && "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    )}
                    title="More actions"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>

                  {showActionsMenu ? (
                    <div className="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      {/* Reply (inside menu for own messages) */}
                      {isOwn ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShowActionsMenu(false);
                            onReply?.({
                              _id: messageId,
                              senderName: sender?.name || "You",
                              text: message?.message || "Attachment",
                              createdAt: message?.createdAt,
                            });
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <span className="flex items-center gap-2.5">
                            <Reply className="h-3.5 w-3.5" />
                            <span>Reply</span>
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">Q</span>
                        </button>
                      ) : null}

                      {/* Forward */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowActionsMenu(false);
                          onForward?.(message);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="flex items-center gap-2.5">
                          <Forward className="h-3.5 w-3.5" />
                          <span>Forward</span>
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">F</span>
                      </button>

                      {/* Copy link */}
                      <button
                        type="button"
                        onClick={() => {
                          handleCopyLink();
                          setShowActionsMenu(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {linkCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Link2 className="h-3.5 w-3.5" />}
                        <span>{linkCopied ? "Link copied!" : "Copy link"}</span>
                      </button>

                      {/* Copy text */}
                      {message?.message ? (
                        <button
                          type="button"
                          onClick={() => {
                            handleCopy();
                            setShowActionsMenu(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{copied ? "Copied!" : "Copy text"}</span>
                        </button>
                      ) : null}

                      {/* Delete (positioned in menu for own messages like Teams) */}
                      {isOwn ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShowActionsMenu(false);
                            if (window.confirm("Are you sure you want to delete this message?")) {
                              onDelete?.(messageId);
                            }
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                        >
                          <span className="flex items-center gap-2.5">
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </span>
                          <span className="text-[10px] font-medium opacity-70">Del</span>
                        </button>
                      ) : null}

                      {/* Pin for everyone */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowActionsMenu(false);
                          onPin?.(messageId);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="flex items-center gap-2.5">
                          <Pin className={cn("h-3.5 w-3.5", isPinned && "text-blue-600")} />
                          <span>{isPinned ? "Unpin" : "Pin for everyone"}</span>
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">P</span>
                      </button>

                      {/* Mark as unread */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowActionsMenu(false);
                          onMarkUnread?.(messageId);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="flex items-center gap-2.5">
                          <EyeOff className="h-3.5 w-3.5" />
                          <span>Mark as unread</span>
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">U</span>
                      </button>

                      <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />

                      {/* CureCode Unique: Ask CureCode AI */}
                      <button
                        type="button"
                        onClick={handleAskCureCodeAI}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{aiInsight ? "Hide AI summary" : "Ask CureCode AI"}</span>
                      </button>

                      {/* CureCode Unique: Create Bug / Issue */}
                      {message?.message ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShowActionsMenu(false);
                            onCreateIssue?.(message);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/50"
                        >
                          <Bug className="h-3.5 w-3.5" />
                          <span>Create Bug / Task</span>
                        </button>
                      ) : null}

                      <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />

                      {/* Read by X of Y > (for own messages) */}
                      {isOwn ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setShowReadBySubmenu((cur) => !cur);
                              setShowTranslateSubmenu(false);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <span className="flex items-center gap-2.5">
                              <Eye className="h-3.5 w-3.5" />
                              <span>
                                Read by {readReceipts.readByCount} of {readReceipts.totalRecipients}
                              </span>
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                          </button>

                          {showReadBySubmenu ? (
                            <div className="absolute right-full top-0 mr-1.5 z-40 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                              <p className="mb-1.5 px-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                Read receipts
                              </p>
                              {readReceipts.readers.length ? (
                                <div className="max-h-40 space-y-1 overflow-y-auto">
                                  {readReceipts.readers.map((reader) => (
                                    <div
                                      key={reader.id}
                                      className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-xs"
                                    >
                                      <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
                                        {reader.name}
                                      </span>
                                      {reader.seenAt ? (
                                        <span className="shrink-0 text-[10px] text-slate-400">
                                          {formatTime(reader.seenAt)}
                                        </span>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="px-1 py-1 text-xs text-slate-500">
                                  No one has read this yet.
                                </p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        /* Report a concern (for messages from others) */
                        <button
                          type="button"
                          onClick={handleReportConcern}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          <span>Report a concern</span>
                        </button>
                      )}

                      {/* Translation > submenu */}
                      {message?.message ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setShowTranslateSubmenu((cur) => !cur);
                              setShowReadBySubmenu(false);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <span className="flex items-center gap-2.5">
                              <Languages className="h-3.5 w-3.5" />
                              <span>Translation</span>
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                          </button>

                          {showTranslateSubmenu ? (
                            <div className="absolute right-full top-0 mr-1.5 z-40 w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                              {TRANSLATE_LANGUAGES.map((lang) => (
                                <button
                                  key={lang.code}
                                  type="button"
                                  onClick={() => handleTranslate(lang.code, lang.label)}
                                  className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  {lang.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
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
              title={formatDateTime(message?.createdAt)}
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
