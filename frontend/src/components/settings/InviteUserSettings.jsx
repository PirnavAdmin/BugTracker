import { MailPlus } from "lucide-react";
import { Link } from "react-router-dom";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WORKSPACE_ROLE_OPTIONS } from "@/lib/roles";

const InviteDeliveryPreview = ({ entries = [], helperText, title }) => {
  if (!entries.length) {
    return null;
  }

  const hasDeliveryIssue = entries.some((entry) => entry.emailSent === false);
  const panelClassName = hasDeliveryIssue
    ? "rounded-[16px] border border-amber-200 bg-amber-50/80 p-4"
    : "rounded-[16px] border border-emerald-200 bg-emerald-50/80 p-4";
  const titleClassName = hasDeliveryIssue
    ? "text-sm font-semibold text-amber-900"
    : "text-sm font-semibold text-emerald-900";
  const helperClassName = hasDeliveryIssue
    ? "mt-1 text-xs leading-5 text-amber-700"
    : "mt-1 text-xs leading-5 text-emerald-700";

  return (
    <div className={panelClassName}>
      <p className={titleClassName}>{title}</p>
      {helperText ? (
        <p className={helperClassName}>{helperText}</p>
      ) : null}
      <div className="mt-4 space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.email}
            className="rounded-[14px] border border-emerald-200 bg-white/80 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-950">{entry.email}</p>
                <p className="mt-1 text-xs text-slate-500">{entry.role}</p>
              </div>
              <span
                className={
                  entry.emailSent === false
                    ? "rounded-[10px] bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-700"
                    : "rounded-[10px] bg-emerald-100 px-2.5 py-1.5 text-xs font-semibold text-emerald-700"
                }
              >
                {entry.emailSent === false ? "Email not sent" : "Email sent"}
              </span>
            </div>
            {entry.temporaryPassword ? (
              <div className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Temporary password
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-950">
                  {entry.temporaryPassword}
                </p>
              </div>
            ) : null}
            {entry.warning ? (
              <p className="mt-2 text-xs leading-5 text-amber-700">{entry.warning}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

const InviteUserSettings = ({
  feedback,
  inviteEmail,
  inviteMutation,
  inviteRole,
  onEmailChange,
  onRoleChange,
  onSubmit,
  recentInvite,
}) => (
  <SettingsPanel
    title="Invite User"
    description="Create a workspace account for one teammate and assign their role upfront."
  >
    <div className="max-w-2xl space-y-5">
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Email
          </span>
          <Input
            type="email"
            placeholder="name@company.com"
            value={inviteEmail}
            onChange={(event) => onEmailChange(event.target.value)}
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Role
          </span>
          <select
            className="field-select"
            value={inviteRole}
            onChange={(event) => onRoleChange(event.target.value)}
          >
            {WORKSPACE_ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <Button type="submit" disabled={inviteMutation.isPending}>
          <MailPlus className="h-4 w-4" />
          {inviteMutation.isPending ? "Inviting..." : "Invite User"}
        </Button>
      </form>

      {inviteMutation.isError ? (
        <div className="rounded-[16px] border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
          {inviteMutation.error?.response?.data?.message ||
            "Unable to invite this user right now."}
          {inviteMutation.error?.response?.data?.code === "PLAN_LIMIT_REACHED" ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-violet-800">
              <span>
                {inviteMutation.error.response.data.current} / {inviteMutation.error.response.data.limit} users used.
              </span>
              <Link className="font-bold underline" to="/pricing">View Plans</Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {feedback ? (
        <div className="rounded-[16px] border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-800">
          {feedback}
        </div>
      ) : null}

      <InviteDeliveryPreview
        title={recentInvite?.emailSent === false ? "User created" : "Invitation sent"}
        entries={recentInvite ? [recentInvite] : []}
        helperText={
          recentInvite?.emailSent === false
            ? "The email was not delivered. Share the temporary password with the user manually."
            : "A temporary password was created and sent to the invited user's email address."
        }
      />
    </div>
  </SettingsPanel>
);

export default InviteUserSettings;
