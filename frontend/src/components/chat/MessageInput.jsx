import { Suspense, lazy, memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, LoaderCircle, Paperclip, Send, SmilePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uploadChatAttachment } from "@/lib/api";
import { getChatSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "text/plain",
  "",
]);
const allowedExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".xlsx",
  ".zip",
  ".txt",
];
const maxFileSizeMb = 25;
const maxFileSize = maxFileSizeMb * 1024 * 1024;
const maxFileSizeMessage = "Maximum upload size is 25 MB";
const allowedFileTypeMessage = "Allowed files: images, PDF, DOC/DOCX, XLSX, ZIP, TXT.";

const formatFileSize = (size = 0) => {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const isAllowedFile = (file) => {
  const extension = `.${String(file?.name || "").split(".").pop()}`.toLowerCase();
  return (
    allowedMimeTypes.has(file?.type) &&
    allowedExtensions.includes(extension)
  );
};

const getFileValidationError = (file) => {
  if (file?.size > maxFileSize) {
    return maxFileSizeMessage;
  }

  if (!isAllowedFile(file)) {
    return allowedFileTypeMessage;
  }

  return "";
};

const MessageInput = memo(({ conversationId, currentUser, onSend }) => {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);
  const emojiPanelRef = useRef(null);
  const attachmentsRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const canSend =
    Boolean(value.trim()) ||
    attachments.some((attachment) => attachment.status === "uploaded");
  const isUploading = attachments.some((attachment) => attachment.status === "uploading");

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(
    () => () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      attachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    },
    []
  );

  useEffect(() => {
    if (!isEmojiOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!emojiPanelRef.current?.contains(event.target)) {
        setIsEmojiOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isEmojiOpen]);

  const stopTypingSoon = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      getChatSocket()?.emit("stop_typing", { conversationId });
    }, 850);
  };

  const handleChange = (event) => {
    setValue(event.target.value);
    getChatSocket()?.emit("typing", { conversationId });
    stopTypingSoon();
  };

  const handleEmojiSelect = (emojiData) => {
    setValue((currentValue) => `${currentValue}${emojiData?.emoji || ""}`);
    setIsEmojiOpen(false);
  };

  const handleAttachmentSelect = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    setUploadError("");

    files.slice(0, 4).forEach(async (file) => {
      const validationError = getFileValidationError(file);

      if (validationError) {
        setUploadError(validationError);
        return;
      }

      const localId = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : "";
      const optimisticAttachment = {
        id: localId,
        fileName: file.name,
        fileType: file.type,
        size: file.size,
        previewUrl,
        progress: 1,
        status: "uploading",
      };

      setAttachments((currentAttachments) => [
        ...currentAttachments,
        optimisticAttachment,
      ]);

      try {
        const uploadedAttachment = await uploadChatAttachment(file, (progressEvent) => {
          const progress = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 35;

          setAttachments((currentAttachments) =>
            currentAttachments.map((attachment) =>
              attachment.id === localId
                ? {
                    ...attachment,
                    progress,
                  }
                : attachment
            )
          );
        });

        setAttachments((currentAttachments) =>
          currentAttachments.map((attachment) =>
            attachment.id === localId
              ? {
                  ...attachment,
                  ...uploadedAttachment,
                  id: localId,
                  previewUrl,
                  progress: 100,
                  status: "uploaded",
                }
              : attachment
          )
        );
      } catch (error) {
        const failureReason =
          error?.response?.data?.message ||
          (error?.response?.status === 413 ? maxFileSizeMessage : "") ||
          error?.message ||
          "Upload failed";

        setUploadError(failureReason);
        setAttachments((currentAttachments) =>
          currentAttachments.map((attachment) =>
            attachment.id === localId
              ? {
                  ...attachment,
                  errorMessage: failureReason,
                  progress: 0,
                  status: "error",
                }
              : attachment
          )
        );
      }
    });
  };

  const removeAttachment = (attachmentId) => {
    setAttachments((currentAttachments) => {
      const attachmentToRemove = currentAttachments.find(
        (attachment) => attachment.id === attachmentId
      );

      if (attachmentToRemove?.previewUrl) {
        URL.revokeObjectURL(attachmentToRemove.previewUrl);
      }

      return currentAttachments.filter((attachment) => attachment.id !== attachmentId);
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const message = value.trim();
    const uploadedAttachments = attachments
      .filter((attachment) => attachment.status === "uploaded")
      .map(({ id, previewUrl, progress, status, ...attachment }) => attachment);

    if (isUploading || (!message && !uploadedAttachments.length)) {
      return;
    }

    onSend({
      conversationId,
      message,
      attachments: uploadedAttachments,
      currentUser,
    });
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    setAttachments([]);
    setValue("");
    setUploadError("");
    getChatSocket()?.emit("stop_typing", { conversationId });
  };

  return (
    <form
      className="relative shrink-0 border-t border-slate-200 bg-[#f0f2f5] px-2 py-2 shadow-none dark:border-slate-800 dark:bg-slate-900/90 sm:px-4 sm:py-3"
      style={{ minHeight: "70px" }}
      onSubmit={handleSubmit}
    >
      {attachments.length || uploadError ? (
        <div className="dashboard-scrollbar absolute bottom-full left-0 right-0 mb-2 max-h-[34dvh] space-y-2 overflow-y-auto px-2 sm:px-4">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-white/88 px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-800 sm:items-center"
            >
              {attachment.previewUrl ? (
                <img
                  src={attachment.previewUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-2xl object-cover sm:h-12 sm:w-12"
                />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 sm:h-12 sm:w-12">
                  <FileText className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                  {attachment.fileName || attachment.name}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>{formatFileSize(attachment.size)}</span>
                  {attachment.status === "uploading" ? (
                    <>
                      <span>Uploading...</span>
                      <span>{attachment.progress}%</span>
                    </>
                  ) : null}
                  {attachment.status === "uploaded" ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Complete</span>
                  ) : null}
                  {attachment.status === "error" ? (
                    <span className="text-rose-500">
                      {attachment.errorMessage || "Upload failed"}
                    </span>
                  ) : null}
                </div>
                {attachment.status === "uploading" ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                      style={{ width: `${attachment.progress}%` }}
                    />
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-xl"
                onClick={() => removeAttachment(attachment.id)}
                aria-label="Remove attachment"
                title="Remove"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {uploadError ? (
            <p className="px-1 text-xs font-semibold text-rose-500">{uploadError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="relative flex min-h-[54px] items-center gap-1.5 rounded-[24px] border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:gap-2 sm:p-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xlsx,.zip,.txt"
          onChange={handleAttachmentSelect}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:h-10 sm:w-10"
          aria-label="Attach file"
          title="Attach file"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          value={value}
          onChange={handleChange}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit(event);
            }
          }}
          className="max-h-32 min-h-[40px] resize-none border-0 bg-transparent px-1.5 py-2.5 text-sm text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500 sm:max-h-36 sm:min-h-[44px] sm:px-2 sm:py-3"
          placeholder="Message the team"
          rows={1}
        />
        <div ref={emojiPanelRef} className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:h-10 sm:w-10"
            aria-label="Add emoji"
            title="Add emoji"
            onClick={() => setIsEmojiOpen((current) => !current)}
          >
            <SmilePlus className="h-4 w-4" />
          </Button>
          <AnimatePresence>
            {isEmojiOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className="absolute bottom-12 right-0 z-[45] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_26px_70px_-42px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-900"
              >
                <Suspense
                  fallback={
                    <div className="flex h-[390px] w-[320px] items-center justify-center text-sm font-semibold text-slate-500">
                      Loading emojis
                    </div>
                  }
                >
                  <EmojiPicker
                    onEmojiClick={handleEmojiSelect}
                    height={390}
                    width={320}
                    previewConfig={{ showPreview: false }}
                    searchDisabled={false}
                    skinTonesDisabled
                  />
                </Suspense>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <motion.div whileTap={{ scale: canSend && !isUploading ? 0.92 : 1 }}>
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            title="Send"
            disabled={!canSend || isUploading}
            className={cn(
              "h-9 w-9 shrink-0 bg-gradient-to-r from-blue-600 to-sky-500 shadow-[0_14px_30px_-18px_rgba(37,99,235,0.75)] hover:from-blue-700 hover:to-sky-600 sm:h-10 sm:w-10",
              (!canSend || isUploading) && "from-slate-300 to-slate-300 shadow-none"
            )}
          >
            {isUploading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </motion.div>
      </div>
    </form>
  );
});

MessageInput.displayName = "MessageInput";

export default MessageInput;
