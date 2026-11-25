import { Suspense, lazy, memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Bold,
  Code,
  CornerDownRight,
  FileCode,
  FileText,
  Italic,
  List,
  LoaderCircle,
  Paperclip,
  Pencil,
  Quote,
  Send,
  SmilePlus,
  Strikethrough,
  X,
} from "lucide-react";
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
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const isAllowedFile = (file) => {
  const extension = `.${String(file?.name || "").split(".").pop()}`.toLowerCase();
  return allowedMimeTypes.has(file?.type) && allowedExtensions.includes(extension);
};

const getFileValidationError = (file) => {
  if (file?.size > maxFileSize) return maxFileSizeMessage;
  if (!isAllowedFile(file)) return allowedFileTypeMessage;
  return "";
};

const MessageInput = memo(
  ({
    conversationId,
    currentUser,
    editingMessage,
    onCancelEdit,
    onCancelReply,
    onEditMessage,
    onSend,
    replyingTo,
  }) => {
    const [value, setValue] = useState("");
    const [attachments, setAttachments] = useState([]);
    const [isEmojiOpen, setIsEmojiOpen] = useState(false);
    const [showFormatting, setShowFormatting] = useState(false);
    const [isImportant, setIsImportant] = useState(false);
    const [uploadError, setUploadError] = useState("");
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);
    const emojiPanelRef = useRef(null);
    const attachmentsRef = useRef([]);
    const typingTimeoutRef = useRef(null);

    const isEditing = Boolean(editingMessage);
    const canSend =
      Boolean(value.trim()) ||
      attachments.some((attachment) => attachment.status === "uploaded");
    const isUploading = attachments.some((attachment) => attachment.status === "uploading");

    // Populate textarea if editing
    useEffect(() => {
      if (editingMessage?.message) {
        setValue(editingMessage.message);
        textareaRef.current?.focus();
      } else {
        setValue("");
      }
    }, [editingMessage]);

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
      if (!isEmojiOpen) return undefined;

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
      textareaRef.current?.focus();
    };

    // Formatting insertion helper (Markdown syntax)
    const applyFormatting = (prefix, suffix = prefix) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const selectedText = value.substring(start, end);

      const before = value.substring(0, start);
      const after = value.substring(end);

      const newText = `${before}${prefix}${selectedText || "text"}${suffix}${after}`;
      setValue(newText);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + (selectedText.length || 4)
        );
      }, 10);
    };

    const handleAttachmentSelect = async (event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";

      if (!files.length) return;

      const invalidFile = files.find(getFileValidationError);
      if (invalidFile) {
        setUploadError(getFileValidationError(invalidFile));
        return;
      }

      setUploadError("");

      const pendingUploads = files.map((file) => {
        const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const isImage = file.type.startsWith("image/");
        return {
          id: localId,
          file,
          fileName: file.name,
          fileType: file.type,
          size: file.size,
          progress: 0,
          previewUrl: isImage ? URL.createObjectURL(file) : "",
          status: "uploading",
        };
      });

      setAttachments((current) => [...current, ...pendingUploads]);

      pendingUploads.forEach(async ({ file, id: localId, previewUrl }) => {
        try {
          const uploadedAttachment = await uploadChatAttachment(file, (progress) => {
            setAttachments((currentAttachments) =>
              currentAttachments.map((attachment) =>
                attachment.id === localId
                  ? { ...attachment, progress: Math.min(progress, 99) }
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
      event?.preventDefault?.();
      const message = value.trim();

      if (isEditing) {
        if (!message) return;
        onEditMessage?.(editingMessage._id, message);
        setValue("");
        onCancelEdit?.();
        return;
      }

      const uploadedAttachments = attachments
        .filter((attachment) => attachment.status === "uploaded")
        .map(({ id, previewUrl, progress, status, ...attachment }) => attachment);

      if (isUploading || (!message && !uploadedAttachments.length)) {
        return;
      }

      const metadata = {
        ...(replyingTo
          ? {
              replyTo: {
                id: replyingTo._id,
                senderName: replyingTo.senderName,
                text: replyingTo.text,
              },
            }
          : {}),
        ...(isImportant ? { priority: "important" } : {}),
      };

      onSend({
        conversationId,
        message,
        attachments: uploadedAttachments,
        currentUser,
        metadata: Object.keys(metadata).length ? metadata : null,
      });

      setIsImportant(false);

      attachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      setAttachments([]);
      setValue("");
      setUploadError("");
      onCancelReply?.();
      getChatSocket()?.emit("stop_typing", { conversationId });
    };

    return (
      <div className="relative shrink-0 border-t border-slate-200/90 bg-[#f8fafc] px-2 py-2 dark:border-slate-800 dark:bg-slate-900/95 sm:px-4 sm:py-3">
        {/* Teams Replying To Banner */}
        {replyingTo && !isEditing ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-2 flex items-center justify-between gap-3 rounded-2xl border-l-[3.5px] border-blue-600 bg-blue-50/90 px-3 py-2 text-xs text-slate-800 shadow-xs dark:border-blue-500 dark:bg-blue-950/40 dark:text-slate-200"
          >
            <div className="flex min-w-0 items-center gap-2">
              <CornerDownRight className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="min-w-0">
                <span className="font-extrabold text-blue-700 dark:text-blue-300">
                  Replying to {replyingTo.senderName || "Teammate"}:
                </span>{" "}
                <span className="truncate opacity-85">{replyingTo.text}</span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded-full hover:bg-blue-200/50 dark:hover:bg-blue-900/50"
              onClick={onCancelReply}
              title="Cancel reply"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        ) : null}

        {/* Teams Editing Message Banner */}
        {isEditing ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-2 flex items-center justify-between gap-3 rounded-2xl border-l-[3.5px] border-amber-500 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 shadow-xs dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Pencil className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="font-extrabold">Editing message (Press Enter to save, Esc to cancel)</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded-full hover:bg-amber-200/50 dark:hover:bg-amber-900/50"
              onClick={onCancelEdit}
              title="Cancel editing"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        ) : null}

        {/* Attachment Upload Previews */}
        {attachments.length || uploadError ? (
          <div className="dashboard-scrollbar mb-2 flex max-h-[30dvh] flex-wrap gap-2 overflow-y-auto px-1">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-800/90"
              >
                {attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                    <FileText className="h-4 w-4" />
                  </span>
                )}
                <div className="max-w-[140px] min-w-0">
                  <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                    {attachment.fileName || attachment.name}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {attachment.status === "uploading" ? `${attachment.progress}%` : formatFileSize(attachment.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => removeAttachment(attachment.id)}
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {uploadError ? (
              <p className="w-full px-1 text-xs font-semibold text-rose-500">{uploadError}</p>
            ) : null}
          </div>
        ) : null}

        {/* Teams Formatting Bar (optional expansion) */}
        {showFormatting ? (
          <div className="mb-2 flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/90 px-2 py-1 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={() => applyFormatting("**")}
              title="Bold (**text**)"
            >
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={() => applyFormatting("*")}
              title="Italic (*text*)"
            >
              <Italic className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={() => applyFormatting("~~")}
              title="Strikethrough (~~text~~)"
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={() => applyFormatting("`")}
              title="Inline Code (`code`)"
            >
              <Code className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={() => applyFormatting("```\n", "\n```")}
              title="Code Block (```)"
            >
              <FileCode className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={() => applyFormatting("- ")}
              title="Bullet List (- item)"
            >
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              onClick={() => applyFormatting("> ")}
              title="Quote (> quote)"
            >
              <Quote className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-0.5 h-3.5 w-px bg-slate-200 dark:bg-slate-700" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 transition-colors",
                isImportant
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              )}
              onClick={() => setIsImportant((current) => !current)}
              title={isImportant ? "Important message (active)" : "Mark as Important (!)"}
            >
              <AlertCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}

        {/* Teams Important Banner */}
        {isImportant && !isEditing ? (
          <div className="mb-2 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/90 px-3 py-1.5 text-xs font-bold text-rose-700 shadow-xs dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              <span>Marked as Important message</span>
            </div>
            <button
              type="button"
              onClick={() => setIsImportant(false)}
              className="rounded-full p-0.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900"
              title="Cancel important"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {/* Main Composer Box */}
        <div className="relative flex min-h-[52px] items-center gap-1.5 rounded-[22px] border border-slate-200/90 bg-white p-1.5 shadow-xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950 sm:gap-2 sm:p-2">
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xlsx,.zip,.txt"
            onChange={handleAttachmentSelect}
          />

          {/* Attach Button */}
          {!isEditing ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:h-9 sm:w-9"
              aria-label="Attach files"
              title="Attach files (images, docs, pdfs up to 25MB)"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          ) : null}

          {/* Formatting Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 shrink-0 transition-colors sm:h-9 sm:w-9",
              showFormatting
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            )}
            aria-label="Format text"
            title="Text formatting tools"
            onClick={() => setShowFormatting((current) => !current)}
          >
            <Bold className="h-4 w-4" />
          </Button>

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              } else if (event.key === "Escape") {
                if (isEditing) onCancelEdit?.();
                if (replyingTo) onCancelReply?.();
              }
            }}
            className="max-h-32 min-h-[40px] resize-none border-0 bg-transparent px-1.5 py-2 text-sm text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500 sm:max-h-36 sm:min-h-[44px] sm:px-2 sm:py-2.5"
            placeholder={
              isEditing
                ? "Edit your message... (Enter to save, Esc to cancel)"
                : replyingTo
                ? `Reply to ${replyingTo.senderName}...`
                : "Type a message... (Shift + Enter for new line)"
            }
            rows={1}
          />

          {/* Emoji Picker Popover */}
          <div ref={emojiPanelRef} className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:h-9 sm:w-9"
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

          {/* Send / Save Button */}
          <motion.div whileTap={{ scale: canSend && !isUploading ? 0.92 : 1 }}>
            <Button
              type="button"
              size="icon"
              aria-label={isEditing ? "Save edit" : "Send message"}
              title={isEditing ? "Save edit (Enter)" : "Send (Enter)"}
              disabled={!canSend || isUploading}
              onClick={handleSubmit}
              className={cn(
                "h-9 w-9 shrink-0 rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 sm:h-10 sm:w-10",
                (!canSend || isUploading) && "bg-slate-200 text-slate-400 shadow-none dark:bg-slate-800 dark:text-slate-600"
              )}
            >
              {isUploading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : isEditing ? (
                <Pencil className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }
);

MessageInput.displayName = "MessageInput";

export default MessageInput;
