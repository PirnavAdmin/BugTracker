import { useMemo, useState } from "react";
import Select from "react-select";
import { Users2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getInitials } from "@/lib/utils";
import {
  buildMemberOption,
  formatMemberOptionLabel,
  memberSelectStyles,
} from "@/components/projects/memberSelectTheme";

const TeamComposer = ({
  users = [],
  workspaceId,
  onSubmit,
  isPending = false,
  variant = "card",
}) => {
  const isModal = variant === "modal";
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    members: [],
  });
  const [error, setError] = useState("");

  const memberOptions = useMemo(
    () =>
      [...users]
        .sort((left, right) => (left.name || "").localeCompare(right.name || ""))
        .map(buildMemberOption),
    [users]
  );

  const selectedMemberOptions = useMemo(
    () => memberOptions.filter((option) => formData.members.includes(option.value)),
    [formData.members, memberOptions]
  );
  const inputClassName =
    "h-11 rounded-xl border-slate-200 bg-white text-sm shadow-sm shadow-slate-950/[0.02] transition hover:border-slate-300 focus-visible:border-emerald-400 focus-visible:ring-4 focus-visible:ring-emerald-500/12";
  const textAreaClassName =
    "min-h-[96px] rounded-xl border-slate-200 bg-white text-sm shadow-sm shadow-slate-950/[0.02] transition hover:border-slate-300 focus-visible:border-emerald-400 focus-visible:ring-4 focus-visible:ring-emerald-500/12";

  const handleFieldChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleMemberSelectionChange = (selectedOptions) => {
    setFormData((current) => ({
      ...current,
      members: Array.from(
        new Set((selectedOptions || []).map((option) => option.value))
      ),
    }));
  };

  const handleRemoveMember = (userId) => {
    setFormData((current) => ({
      ...current,
      members: current.members.filter((memberId) => memberId !== userId),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      setError("A team name is required.");
      return;
    }

    if (!users.length) {
      setError("No workspace users are available to add to a team yet.");
      return;
    }

    try {
      setError("");
      await onSubmit({
        name: formData.name.trim(),
        description: formData.description.trim(),
        members: formData.members,
        workspaceId,
      });
    } catch (submitError) {
      setError(submitError.response?.data?.message || "Unable to create the team.");
    }
  };

  return (
    <Card
      className={
        isModal
          ? "relative overflow-visible border-0 bg-transparent shadow-none"
          : "relative overflow-hidden border-white/60 bg-white/82 shadow-[0_28px_70px_-34px_rgba(15,23,42,0.35)] backdrop-blur-xl"
      }
    >
      {!isModal ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_48%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_42%)]" />
          <CardHeader className="relative border-b border-white/60 pb-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200/80 bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-emerald-700 shadow-sm backdrop-blur-xl">
              <Users2 className="h-3.5 w-3.5" />
              Workspace Teams
            </div>
            <CardTitle className="text-2xl text-slate-950">Create a new team</CardTitle>
            <CardDescription className="max-w-2xl text-slate-600">
              Group workspace users into a shared squad for planning, delivery, and
              ownership. Only users from this workspace can be added.
            </CardDescription>
          </CardHeader>
        </>
      ) : null}
      <CardContent className={isModal ? "relative p-0" : "relative pt-6"}>
        <form className="space-y-5" onSubmit={handleSubmit}>
          {!users.length ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
              No workspace users are available right now. Invite teammates before
              creating a team.
            </div>
          ) : null}

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Team name</span>
            <Input
              id="name"
              name="name"
              className={inputClassName}
              placeholder="Platform Squad"
              value={formData.name}
              onChange={handleFieldChange}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Description</span>
            <Textarea
              id="description"
              name="description"
              className={textAreaClassName}
              placeholder="Short team description"
              value={formData.description}
              onChange={handleFieldChange}
            />
          </label>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white/86 p-4 shadow-sm backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-medium text-gray-700">Members</label>
              <Badge className="border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                {selectedMemberOptions.length} selected
              </Badge>
            </div>

            <Select
              isMulti
              isClearable={selectedMemberOptions.length > 0}
              isDisabled={!memberOptions.length || isPending}
              closeMenuOnSelect={false}
              hideSelectedOptions={false}
              options={memberOptions}
              value={selectedMemberOptions}
              styles={memberSelectStyles}
              formatOptionLabel={formatMemberOptionLabel}
              onChange={handleMemberSelectionChange}
              placeholder={
                memberOptions.length
                  ? "Select workspace users..."
                  : "No workspace users available right now"
              }
              noOptionsMessage={() =>
                memberOptions.length
                  ? "All workspace users are already selected."
                  : "No workspace users are available."
              }
            />

            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/85 p-3">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                Selected members
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedMemberOptions.length ? (
                  selectedMemberOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleRemoveMember(option.value)}
                      className="group inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-cyan-100 text-[11px] font-semibold text-slate-700">
                        {getInitials(option.label)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {option.label}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {option.email}
                        </span>
                      </span>
                      <span className="rounded-full bg-slate-100 p-1 text-slate-500 transition group-hover:bg-slate-200">
                        <X className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No members selected.</p>
                )}
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div
            className={
              isModal
                ? "sticky bottom-0 -mx-4 border-t border-slate-200/80 bg-white/94 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5"
                : "sticky bottom-0 -mx-6 border-t border-slate-200/80 bg-white/94 px-6 py-3 backdrop-blur"
            }
          >
            <Button className="w-full" disabled={isPending || !users.length} type="submit">
            {isPending ? "Creating team..." : "Create Team"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default TeamComposer;
