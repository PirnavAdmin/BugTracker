import { memo, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckCheck,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  UsersRound,
  X,
} from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { fetchChatAttachmentBlob } from "@/lib/api";
import { cn, formatDateTime, formatTime } from "@/lib/utils";

const formatFileSize = (size = 0) => {
  if (!size) {
    return "";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

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

const MeetingCard = ({ metadata = {}, isOwn }) => {
  const subject = metadata.title || "Chat meeting";
  const joinUrl = metadata.meetingUrl || "";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[18px] border shadow-sm",
        isOwn ? "border-white/20 bg-white/10 text-white" : "border-slate-200 bg-slate-50 text-slate-800"
      )}
    >
      <div className={cn("flex items-start gap-3 px-4 py-3", isOwn ? "bg-white/8" : "bg-white")}>
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
            isOwn ? "bg-white/14" : "bg-slate-200 text-slate-800"
          )}
        >
          <CalendarDays className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{subject}</p>
          <p className={cn("mt-1 text-xs font-medium", isOwn ? "text-white/84" : "text-slate-500")}>
            In-app chat meeting
          </p>
        </div>
      </div>
      <div className="space-y-2 px-4 py-3">
        <div className={cn("text-xs font-semibold", isOwn ? "text-white/84" : "text-slate-600")}>
          {formatDateTime(metadata.startTime)}
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 text-xs font-semibold",
            isOwn ? "text-white/84" : "text-slate-600"
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
                : "bg-slate-950 text-white hover:bg-slate-800"
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

const AttachmentCard = ({ attachment, attachmentIndex, conversationId, isOwn, messageId, onPreview }) => {
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
    if (!canLoadAttachment || isDownloading) {
      return;
    }

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
            isOwn ? "text-white/90" : "text-slate-600"
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
          : "border-emerald-100 bg-[#f1faf2] text-slate-700"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
          isOwn ? "bg-white/18" : "bg-white text-emerald-700"
        )}
      >
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{fileName}</p>
        <p className={cn("mt-0.5 truncate text-xs", isOwn ? "text-white/74" : "text-slate-500")}>
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
              : "bg-white text-emerald-700 hover:bg-emerald-50"
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

const MessageBubble = memo(({ message, currentUserId }) => {
  const [previewImage, setPreviewImage] = useState(null);
  const sender = message?.senderId || {};
  const isOwn = getId(sender) === String(currentUserId);
  const seenCount = Array.isArray(message?.seenBy) ? message.seenBy.length : 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={cn("flex w-full gap-3", isOwn ? "justify-end" : "justify-start")}
      >
        {!isOwn ? (
          <UserAvatar
            user={sender}
            className="mt-1 h-9 w-9 rounded-2xl border-emerald-100"
            fallbackClassName="text-xs"
          />
        ) : null}

        <div
          className={cn(
            "flex max-w-[92%] flex-col space-y-1 sm:max-w-[68%]",
            isOwn ? "items-end text-right" : "items-start text-left"
          )}
        >
          {!isOwn ? (
            <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
              <span className="font-semibold text-slate-800">{sender?.name}</span>
              <span className="rounded-full border border-emerald-100 bg-white/82 px-2 py-0.5 font-medium text-slate-500">
                {sender?.role || "Member"}
              </span>
            </div>
          ) : null}

          <div
            className={cn(
              "rounded-[20px] border px-3 py-2.5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.36)] backdrop-blur-sm sm:rounded-[22px] sm:px-4 sm:py-3",
              isOwn
                ? "border-slate-900 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-800"
            )}
          >
            {message?.message ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {message.message}
              </p>
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
                    attachmentIndex={index}
                    key={`${getAttachmentName(attachment)}-${index}`}
                    attachment={attachment}
                    conversationId={getId(message.conversationId)}
                    isOwn={isOwn}
                    messageId={getId(message)}
                    onPreview={setPreviewImage}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "flex items-center gap-1.5 px-1 text-[11px] font-semibold text-slate-500",
              isOwn ? "justify-end" : "justify-start"
            )}
          >
            <span>{formatTime(message?.createdAt)}</span>
            {isOwn && message?.pending ? <Clock3 className="h-3 w-3" /> : null}
            {isOwn && !message?.pending ? (
              <CheckCheck className={cn("h-3.5 w-3.5", seenCount > 1 && "text-slate-900")} />
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
});

MessageBubble.displayName = "MessageBubble";

export default MessageBubble;
