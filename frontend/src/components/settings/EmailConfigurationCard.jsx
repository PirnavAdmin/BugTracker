import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  PencilLine,
  Save,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkspaceSenderSelectionState } from "@/lib/workspaceSender";
import { cn } from "@/lib/utils";

const initialFormState = {
  host: "",
  port: "465",
  secure: true,
  username: "",
  password: "",
  fromName: "",
  fromEmail: "",
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ipv4Regex =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const hostnameRegex =
  /^(?=.{1,253}$)(?:localhost|(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59}))$/i;

const normalizeSmtpHost = (value = "") =>
  String(value || "").replace(/\r?\n/g, "").trim().toLowerCase();

const isValidSmtpHost = (value = "") => {
  const normalizedHost = normalizeSmtpHost(value);

  return Boolean(
    normalizedHost &&
      !/[,\s]/.test(normalizedHost) &&
      (hostnameRegex.test(normalizedHost) || ipv4Regex.test(normalizedHost))
  );
};

const buildFormState = (config, selectedSender) => ({
  host: config?.host || "",
  port: config?.port ? String(config.port) : "465",
  secure: typeof config?.secure === "boolean" ? config.secure : true,
  username: config?.username || selectedSender?.email || "",
  password: "",
  fromName: config?.fromName || selectedSender?.name || "",
  fromEmail: config?.fromEmail || selectedSender?.email || "",
});

const buildValidationErrors = (formData, hasStoredPassword) => {
  const errors = {};

  if (!formData.host.trim()) {
    errors.host = "SMTP host is required";
  } else if (!isValidSmtpHost(formData.host)) {
    errors.host = "Enter a valid SMTP hostname or IPv4 address";
  }

  const parsedPort = Number.parseInt(formData.port, 10);

  if (!formData.port.trim()) {
    errors.port = "SMTP port is required";
  } else if (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    errors.port = "Enter a valid port between 1 and 65535";
  }

  if (!formData.username.trim()) {
    errors.username = "Email username is required";
  } else if (!emailRegex.test(formData.username.trim().toLowerCase())) {
    errors.username = "Enter a valid SMTP login email address";
  }

  if (!formData.password && !hasStoredPassword) {
    errors.password = "Email password is required";
  }

  if (!formData.fromName.trim()) {
    errors.fromName = "From name is required";
  }

  if (!formData.fromEmail.trim()) {
    errors.fromEmail = "From email is required";
  } else if (!emailRegex.test(formData.fromEmail.trim().toLowerCase())) {
    errors.fromEmail = "Enter a valid from email address";
  }

  return errors;
};

const hasSavedConfiguration = (config) =>
  Boolean(
    config?.host &&
      config?.port &&
      config?.username &&
      config?.fromName &&
      config?.fromEmail &&
      config?.hasPassword
  );

const getSummaryValue = (value) => {
  if (typeof value === "number") {
    return String(value);
  }

  return String(value || "").trim() || "Not configured";
};

const FieldHint = ({ error, message }) => {
  if (!error && !message) {
    return null;
  }

  return (
    <p className={cn("text-xs leading-5", error ? "text-rose-600" : "text-slate-500")}>
      {error || message}
    </p>
  );
};

const FormField = ({ children, error, helper, label }) => (
  <label className="space-y-2">
    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
      {label}
    </span>
    {children}
    <FieldHint error={error} message={helper} />
  </label>
);

const SummaryRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
      {label}
    </span>
    <span className="text-right text-sm font-medium text-slate-900">{value}</span>
  </div>
);

const EmailConfigurationCard = ({
  defaultExpanded = false,
  embedded = false,
  currentWorkspaceSender,
  emailConfigQuery,
  personalAccountMode = false,
  saveEmailConfigMutation,
  selectedSender,
  showToast,
}) => {
  const selectedSenderId = selectedSender?._id || "";
  const { workspaceSender, hasActiveSender } =
    getWorkspaceSenderSelectionState(currentWorkspaceSender);
  const [formData, setFormData] = useState(initialFormState);
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const savedConfig = emailConfigQuery.data?.config || null;
  const smtpConfigured = useMemo(
    () => Boolean(selectedSender?.smtpConfigured || hasSavedConfiguration(savedConfig)),
    [savedConfig, selectedSender?.smtpConfigured]
  );
  const isSelectedSenderActive = Boolean(
    hasActiveSender &&
      String(workspaceSender?.userId || "") === String(selectedSenderId)
  );

  useEffect(() => {
    if (!selectedSenderId) {
      setFormData(initialFormState);
      setHasStoredPassword(false);
      setTouched({});
      setSubmitAttempted(false);
      setIsEditing(false);
      setIsExpanded(defaultExpanded);
      return;
    }

    setFormData(initialFormState);
    setHasStoredPassword(false);
    setTouched({});
    setSubmitAttempted(false);
    setIsEditing(false);
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded, selectedSenderId]);

  useEffect(() => {
    if (!selectedSenderId || emailConfigQuery.isLoading || isEditing) {
      return;
    }

    setFormData(buildFormState(savedConfig, selectedSender));
    setHasStoredPassword(Boolean(savedConfig?.hasPassword));
    setTouched({});
    setSubmitAttempted(false);
  }, [
    emailConfigQuery.isLoading,
    isEditing,
    savedConfig,
    selectedSender,
    selectedSenderId,
  ]);

  const validationErrors = useMemo(
    () => buildValidationErrors(formData, hasStoredPassword),
    [formData, hasStoredPassword]
  );

  const visibleErrors = useMemo(() => {
    if (!submitAttempted) {
      return Object.fromEntries(
        Object.entries(validationErrors).filter(([field]) => touched[field])
      );
    }

    return validationErrors;
  }, [submitAttempted, touched, validationErrors]);

  const buildPayload = () => ({
    userId: selectedSenderId,
    host: normalizeSmtpHost(formData.host),
    port: Number.parseInt(formData.port, 10),
    secure: Boolean(formData.secure),
    username: formData.username.trim().toLowerCase(),
    password: formData.password,
    fromName: formData.fromName.trim(),
    fromEmail: formData.fromEmail.trim().toLowerCase(),
  });

  const isSavePending = saveEmailConfigMutation.isPending;

  const handleChange = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
    setTouched((current) => ({
      ...current,
      [field]: true,
    }));
  };

  const handleOpenEdit = () => {
    if (!selectedSenderId) {
      showToast(
        "error",
        personalAccountMode
          ? "Your mail account is not available right now."
          : "Select a workspace sender before editing email settings."
      );
      return;
    }

    setFormData(buildFormState(savedConfig, selectedSender));
    setHasStoredPassword(Boolean(savedConfig?.hasPassword));
    setTouched({});
    setSubmitAttempted(false);
    setIsExpanded(true);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setFormData(buildFormState(savedConfig, selectedSender));
    setHasStoredPassword(Boolean(savedConfig?.hasPassword));
    setTouched({});
    setSubmitAttempted(false);
    setIsEditing(false);
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);

    if (!selectedSenderId) {
      showToast(
        "error",
        personalAccountMode
          ? "Your mail account is not available right now."
          : "Select a workspace sender before saving email settings."
      );
      return;
    }

    if (Object.keys(validationErrors).length) {
      showToast("error", "Complete the required SMTP fields before saving.");
      return;
    }

    try {
      const response = await saveEmailConfigMutation.mutateAsync(buildPayload());
      const nextConfig = response?.config || savedConfig;

      setHasStoredPassword(true);
      setFormData(buildFormState(nextConfig, selectedSender));
      setTouched({});
      setSubmitAttempted(false);
      setIsEditing(false);
      setIsExpanded(defaultExpanded);
      showToast(
        "success",
        response?.message || "Email configuration saved successfully."
      );
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message ||
          "Unable to save this email configuration right now."
      );
    }
  };

  const summaryRows = [
    { label: "SMTP Host", value: getSummaryValue(savedConfig?.host) },
    { label: "SMTP Port", value: getSummaryValue(savedConfig?.port) },
    { label: "Email Username", value: getSummaryValue(savedConfig?.username) },
    { label: "From Name", value: getSummaryValue(savedConfig?.fromName) },
    { label: "From Email", value: getSummaryValue(savedConfig?.fromEmail) },
    {
      label: "Secure Connection",
      value: savedConfig ? (savedConfig.secure ? "Yes" : "No") : "Not configured",
    },
    {
      label: "SMTP Configured",
      value: smtpConfigured ? "Yes" : "No",
    },
  ];

  const header = (
    <CardHeader className="border-b border-slate-100 p-0">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-slate-50/60"
          onClick={() => selectedSenderId && setIsExpanded((current) => !current)}
          disabled={!selectedSenderId}
        >
          <div>
            <CardTitle className="text-base">SMTP Configuration</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {selectedSender
                ? personalAccountMode
                  ? "Saved settings for your tester mail account"
                  : `Saved settings for ${selectedSender.name}`
                : personalAccountMode
                  ? "Your mail account is not available right now."
                  : "Select a sender to view SMTP settings"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {selectedSender ? (
              <Badge variant={smtpConfigured ? "success" : "warning"}>
                {smtpConfigured ? "SMTP Configured" : "Needs SMTP setup"}
              </Badge>
            ) : null}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </div>
        </button>
    </CardHeader>
  );

  const content = isExpanded ? (
    <div className="space-y-5">
          {!selectedSender ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-600">
              {personalAccountMode
                ? "Your tester mail account is not available right now."
                : "Choose a workspace sender in the Active Sender section to view or save SMTP credentials for that user."}
            </div>
          ) : emailConfigQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-[76px] w-full rounded-[20px]" />
              <Skeleton className="h-[76px] w-full rounded-[20px]" />
              <Skeleton className="h-[76px] w-full rounded-[20px]" />
              <Skeleton className="h-[76px] w-full rounded-[20px]" />
              <Skeleton className="h-[76px] w-full rounded-[20px]" />
              <Skeleton className="h-[76px] w-full rounded-[20px]" />
            </div>
          ) : (
            <>
              {emailConfigQuery.error ? (
                <div className="rounded-[22px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
                  {emailConfigQuery.error.response?.data?.message ||
                    "Unable to load the saved SMTP configuration for this user."}
                </div>
              ) : null}

              {!isEditing ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={smtpConfigured ? "success" : "warning"}>
                        {smtpConfigured ? "SMTP Configured" : "Needs SMTP setup"}
                      </Badge>
                      {personalAccountMode ? (
                        <Badge variant="secondary">Personal account</Badge>
                      ) : null}
                      {isSelectedSenderActive ? (
                        <Badge variant="default">Active sender</Badge>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleOpenEdit}
                      aria-label="Edit SMTP settings"
                      title="Edit SMTP settings"
                    >
                      <PencilLine className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {summaryRows.map((row) => (
                      <SummaryRow key={row.label} label={row.label} value={row.value} />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Edit mode</Badge>
                    {personalAccountMode ? (
                      <Badge variant="secondary">Personal account</Badge>
                    ) : null}
                    {isSelectedSenderActive ? (
                      <Badge variant="default">Active sender</Badge>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      label="SMTP Host"
                      error={visibleErrors.host}
                      helper="Use the exact SMTP server hostname, for example smtp.hostinger.com."
                    >
                      <Input
                        value={formData.host}
                        disabled={isSavePending}
                        onChange={(event) => handleChange("host", event.target.value)}
                        placeholder="smtp.example.com"
                      />
                    </FormField>

                    <FormField label="SMTP Port" error={visibleErrors.port}>
                      <Input
                        value={formData.port}
                        disabled={isSavePending}
                        onChange={(event) => handleChange("port", event.target.value)}
                        placeholder="465"
                        inputMode="numeric"
                      />
                    </FormField>

                    <FormField
                      label="Email Username"
                      error={visibleErrors.username}
                      helper="Use the mailbox login email address, not the sender's display name."
                    >
                      <Input
                        type="email"
                        value={formData.username}
                        disabled={isSavePending}
                        onChange={(event) => handleChange("username", event.target.value)}
                        placeholder="sender@company.com"
                      />
                    </FormField>

                    <FormField
                      label="Email Password"
                      error={visibleErrors.password}
                      helper={
                        hasStoredPassword
                          ? "A password is already saved. Leave this blank to keep the existing password."
                          : ""
                      }
                    >
                      <Input
                        type="password"
                        value={formData.password}
                        disabled={isSavePending}
                        onChange={(event) => handleChange("password", event.target.value)}
                        placeholder={hasStoredPassword ? "********" : "Enter SMTP password"}
                      />
                    </FormField>

                    <FormField label="From Name" error={visibleErrors.fromName}>
                      <Input
                        value={formData.fromName}
                        disabled={isSavePending}
                        onChange={(event) => handleChange("fromName", event.target.value)}
                        placeholder="Pirnav Support"
                      />
                    </FormField>

                    <FormField label="From Email" error={visibleErrors.fromEmail}>
                      <Input
                        type="email"
                        value={formData.fromEmail}
                        disabled={isSavePending}
                        onChange={(event) => handleChange("fromEmail", event.target.value)}
                        placeholder="support@company.com"
                      />
                    </FormField>
                  </div>

                  <label className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                      checked={Boolean(formData.secure)}
                      disabled={isSavePending}
                      onChange={(event) => handleChange("secure", event.target.checked)}
                    />
                    <span>
                      Secure Connection
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        Enable SSL/TLS when your SMTP provider requires a secure connection.
                      </span>
                    </span>
                  </label>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="button"
                      className="sm:min-w-[190px]"
                      onClick={handleSubmit}
                      disabled={isSavePending || emailConfigQuery.isLoading}
                    >
                      {isSavePending ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Save Configuration
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="sm:min-w-[150px]"
                      onClick={handleCancelEdit}
                      disabled={isSavePending}
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
    </div>
  ) : null;

  if (embedded) {
    return content;
  }

  return (
    <Card className="shadow-[0_24px_64px_-42px_rgba(15,23,42,0.32)]">
      {header}

      {content ? <CardContent className="p-6">{content}</CardContent> : null}
    </Card>
  );
};

export default EmailConfigurationCard;
