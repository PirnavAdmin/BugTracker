import { useState } from "react";
import Select from "react-select";
import {
  LoaderCircle,
  Mail,
  MailCheck,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import {
  formatMemberOptionLabel,
  memberSelectStyles,
} from "@/components/projects/memberSelectTheme";
import { getWorkspaceSenderSelectionState } from "@/lib/workspaceSender";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const senderSelectStyles = {
  ...memberSelectStyles,
  control: (base, state) => ({
    ...memberSelectStyles.control(base, state),
    minHeight: 44,
    borderRadius: 14,
  }),
};

const formatSenderOptionLabel = (option, meta) => {
  if (meta.context === "menu") {
    return formatMemberOptionLabel(option, meta);
  }

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-slate-900">{option.label}</p>
      <p className="truncate text-xs text-slate-500">
        {[option.role, option.email].filter(Boolean).join(" | ")}
      </p>
    </div>
  );
};

const SummaryRow = ({ label, value }) => (
  <div className="flex min-w-0 items-center justify-between gap-3 rounded-[12px] border border-slate-100 bg-slate-50 px-3 py-2">
    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      {label}
    </span>
    <span className="truncate text-right text-sm font-medium text-slate-900">
      {value}
    </span>
  </div>
);

const getSourceStatusLabel = (source) => {
  if (source === "personal-account") {
    return "Personal account active";
  }

  if (source === "manual") {
    return "Manual sender saved";
  }

  if (source === "workspace-default") {
    return "Using workspace default";
  }

  return "Using global fallback";
};

const getSourceBadgeLabel = (source) => {
  if (source === "personal-account") {
    return "Personal account";
  }

  if (source === "manual") {
    return "Manual sender";
  }

  if (source === "workspace-default") {
    return "Workspace default";
  }

  return "Global fallback";
};

const getSourceBadgeVariant = (source) => {
  if (source === "personal-account") {
    return "default";
  }

  if (source === "manual") {
    return "default";
  }

  if (source === "workspace-default") {
    return "secondary";
  }

  return "outline";
};

const getFallbackLabel = ({ source, workspaceDefaultSender }) => {
  if (source === "manual" && workspaceDefaultSender) {
    return `${workspaceDefaultSender.name} (${workspaceDefaultSender.role})`;
  }

  return "Global fallback sender";
};

const WorkspaceMailSenderCard = ({
  embedded = false,
  currentWorkspaceSender,
  eligibleSenders = [],
  errorMessage,
  isLoading,
  isSaving,
  isTesting,
  canSendTestMail,
  onSendTestMail,
  onActivateSelected,
  onClearSender,
  onSelectedSenderChange,
  personalAccountMode = false,
  selectedSenderId,
}) => {
  const [showSenderPicker, setShowSenderPicker] = useState(false);
  const {
    workspaceSender,
    hasActiveSender,
    activeSenderUser,
    manualSenderUser,
    workspaceDefaultSender,
  } = getWorkspaceSenderSelectionState(currentWorkspaceSender);

  const senderOptions = eligibleSenders.map((user) => ({
    value: user._id,
    label: user.name,
    email: user.email,
    role: user.role,
    smtpConfigured: Boolean(user.smtpConfigured),
  }));
  const selectedSender =
    senderOptions.find(
      (option) => String(option.value) === String(selectedSenderId)
    ) || null;
  const source = workspaceSender?.source || "global-default";
  const isUsingGlobalFallback = !hasActiveSender && !personalAccountMode;
  const activeSenderTitle = activeSenderUser?.name
    ? `${activeSenderUser.name} (${activeSenderUser.role})`
    : personalAccountMode
      ? "Your mail account"
      : "Using global fallback sender";
  const activeSenderEmail = activeSenderUser?.email || (
    personalAccountMode
      ? "No tester account is loaded right now."
      : "No sender configured for your account."
  );
  const activeSenderStatus = personalAccountMode
    ? activeSenderUser?.smtpConfigured
      ? "Personal account ready"
      : "Personal account needs SMTP setup"
    : hasActiveSender
      ? getSourceStatusLabel(source)
      : "Using global fallback";
  const activeSenderNeedsSmtpSetup = Boolean(
    hasActiveSender && activeSenderUser && !activeSenderUser.smtpConfigured
  );
  const activeSenderBadges = personalAccountMode
    ? [
        {
          label: activeSenderUser?.smtpConfigured
            ? "SMTP Configured"
            : "Needs SMTP setup",
          variant: activeSenderUser?.smtpConfigured ? "success" : "warning",
        },
        {
          label: "Personal account",
          variant: "default",
        },
      ]
    : [
        {
          label: activeSenderUser?.smtpConfigured
            ? "SMTP Configured"
            : "Using global fallback",
          variant: activeSenderUser?.smtpConfigured ? "success" : "secondary",
        },
        {
          label: getSourceBadgeLabel(source),
          variant: getSourceBadgeVariant(source),
        },
      ];

  if (hasActiveSender) {
    activeSenderBadges.push({
      label: "Active sender",
      variant: "default",
    });
  }

  const content = (
    <div className="space-y-4">
        {errorMessage ? (
          <div className="rounded-[14px] border border-rose-200 bg-rose-50/90 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-[132px] w-full rounded-[16px]" />
            <Skeleton className="h-[92px] w-full rounded-[16px]" />
          </div>
        ) : (
          <>
            <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white p-4 shadow-[0_16px_38px_-34px_rgba(15,23,42,0.26)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-500">
                    <MailCheck className="h-4 w-4 text-blue-600" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                      Active sender
                    </span>
                  </div>
                  <div>
                    <p className="truncate text-base font-semibold text-slate-950">
                      {activeSenderTitle}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-slate-600">
                      {activeSenderEmail}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activeSenderBadges.map((badge) => (
                    <Badge key={badge.label} variant={badge.variant}>
                      {badge.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <p className="text-xs text-slate-500">SMTP Configured means settings are saved. Send Test Mail checks SMTP acceptance, not Inbox delivery.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {!isUsingGlobalFallback ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="sm:min-w-[150px]"
                    onClick={onSendTestMail}
                    disabled={!canSendTestMail || isTesting}
                  >
                    {isTesting ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Send Test Mail
                      </>
                    )}
                  </Button>
                ) : null}

                {!personalAccountMode ? (
                  <Button
                    type="button"
                    variant={isUsingGlobalFallback ? "default" : "outline"}
                    size="sm"
                    className="sm:min-w-[145px]"
                    onClick={() => setShowSenderPicker((current) => !current)}
                    disabled={!eligibleSenders.length}
                  >
                    <Settings2 className="h-4 w-4" />
                    {isUsingGlobalFallback ? "Set Active Sender" : "Change Sender"}
                  </Button>
                ) : null}

                {!personalAccountMode && manualSenderUser ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="sm:min-w-[190px]"
                    onClick={onClearSender}
                    disabled={isSaving}
                  >
                    Reset to Workspace Default
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-950">Sender Details</p>

              <div className="grid gap-3 md:grid-cols-3">
                <SummaryRow
                  label="Role"
                  value={activeSenderUser?.role || (personalAccountMode ? "Tester" : "Global fallback")}
                />
                <SummaryRow label="Status" value={activeSenderStatus} />
                {personalAccountMode ? (
                  <SummaryRow
                    label="Account"
                    value={activeSenderUser?.email || "Not available"}
                  />
                ) : (
                  <SummaryRow
                    label="Fallback"
                    value={getFallbackLabel({ source, workspaceDefaultSender })}
                  />
                )}
              </div>

              {!personalAccountMode && workspaceDefaultSender ? (
                <div className="rounded-[12px] border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                  Workspace default sender:{" "}
                  <span className="font-medium text-slate-900">
                    {workspaceDefaultSender.name}
                  </span>{" "}
                  <span className="text-slate-500">({workspaceDefaultSender.email})</span>
                </div>
              ) : null}
            </div>

            {activeSenderNeedsSmtpSetup ? (
              <div className="flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-800">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {personalAccountMode
                    ? "SMTP is not configured for your mail account yet."
                    : "SMTP is not configured for this sender."}
                </span>
              </div>
            ) : null}

            {!personalAccountMode && showSenderPicker ? (
              eligibleSenders.length ? (
                <div className="space-y-3 rounded-[16px] border border-slate-200 bg-slate-50/70 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Change sender</p>
                  </div>

                  <label className="space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Select sender user
                    </span>
                    <Select
                      inputId="workspace-mail-sender"
                      isClearable
                      isDisabled={isSaving}
                      options={senderOptions}
                      value={selectedSender}
                      styles={senderSelectStyles}
                      formatOptionLabel={formatSenderOptionLabel}
                      onChange={(option) => onSelectedSenderChange(option?.value || "")}
                      placeholder="Search Admin, Manager, Team Lead, or Q/A Lead"
                      noOptionsMessage={() => "No eligible sender users found."}
                    />
                  </label>

                  {selectedSender ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <SummaryRow label="Selected sender" value={selectedSender.label} />
                      <SummaryRow label="Email" value={selectedSender.email} />
                      <SummaryRow label="Role" value={selectedSender.role} />
                      <SummaryRow
                        label="SMTP Configured"
                        value={selectedSender.smtpConfigured ? "Yes" : "No"}
                      />
                    </div>
                  ) : null}

                  {selectedSender && !selectedSender.smtpConfigured ? (
                    <div className="flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-800">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        SMTP is not configured for {selectedSender.label}.
                      </span>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      size="sm"
                      className="sm:min-w-[170px]"
                      onClick={onActivateSelected}
                      disabled={
                        isSaving ||
                        !selectedSender ||
                        !selectedSender.smtpConfigured
                      }
                    >
                      {isSaving ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <MailCheck className="h-4 w-4" />
                          Save Active Sender
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="sm:min-w-[100px]"
                      onClick={() => setShowSenderPicker(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[12px] border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-800">
                  Promote a workspace user to Admin, Manager, Team Lead, or Q/A Lead
                  to make them eligible as a sender.
                </div>
              )
            ) : null}
          </>
        )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card className="shadow-[0_24px_64px_-42px_rgba(15,23,42,0.32)]">
      <CardHeader className="space-y-3 border-b border-slate-100">
        <div>
          <CardTitle>Workspace Mail Sender</CardTitle>
          <CardDescription>
            {personalAccountMode
              ? "Your tester account is the active mail sender used for your personal SMTP setup."
              : "Save an active sender for your account. Your manual choice stays in place across logins until you reset it to the workspace default."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="p-6">{content}</CardContent>
    </Card>
  );
};

export default WorkspaceMailSenderCard;
