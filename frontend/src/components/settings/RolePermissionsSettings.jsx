import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Save } from "lucide-react";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { Button } from "@/components/ui/button";
import { fetchWorkPermissions, saveWorkPermissions } from "@/lib/api";
import {
  DEFAULT_WORK_PERMISSIONS,
  WORK_PERMISSION_ROLES,
  normalizeWorkPermissions,
} from "@/lib/roles";
import { cn } from "@/lib/utils";

const WORK_OPTIONS = [
  { id: "manageTasks", label: "Manage related tasks", description: "View team progress and assign or reassign tasks." },
  { id: "manageBugs", label: "Manage related bugs", description: "View related bugs, assign developers, and move any bug status." },
];

const RolePermissionsSettings = ({ showToast }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(DEFAULT_WORK_PERMISSIONS);
  const { data: saved = DEFAULT_WORK_PERMISSIONS, isLoading } = useQuery({
    queryKey: ["work-permissions"],
    queryFn: fetchWorkPermissions,
  });
  const normalizedSaved = useMemo(() => normalizeWorkPermissions(saved), [saved]);

  useEffect(() => setDraft(normalizedSaved), [normalizedSaved]);

  const saveMutation = useMutation({
    mutationFn: saveWorkPermissions,
    onSuccess: (data) => {
      const permissions = normalizeWorkPermissions(data?.permissions || {});
      queryClient.setQueryData(["work-permissions"], permissions);
      showToast?.("success", data?.message || "Role permissions saved.");
    },
    onError: (error) => showToast?.("error", error.response?.data?.message || "Unable to save role permissions."),
  });

  const toggle = (role, permission) => setDraft((current) => ({
    ...current,
    [role]: { ...current[role], [permission]: !current[role]?.[permission] },
  }));

  return (
    <SettingsPanel
      title="Role Permissions"
      description="Control which delivery roles can manage work in their related projects. Admins and managers always retain full access."
      actions={<Button type="submit" form="role-permissions-form" disabled={isLoading || saveMutation.isPending}><Save className="h-4 w-4" />{saveMutation.isPending ? "Saving..." : "Save"}</Button>}
    >
      <form id="role-permissions-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(draft); }}>
        {WORK_PERMISSION_ROLES.map((role) => (
          <section key={role} className="rounded-[16px] border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-white text-blue-700 shadow-sm"><ShieldCheck className="h-4 w-4" /></span><div><h3 className="text-sm font-semibold text-slate-950">{role}</h3><p className="text-xs text-slate-500">Choose the work-management capabilities for this role.</p></div></div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {WORK_OPTIONS.map((option) => {
                const enabled = Boolean(draft?.[role]?.[option.id]);
                return <label key={`${role}-${option.id}`} className={cn("flex cursor-pointer items-start justify-between gap-3 rounded-[12px] border bg-white px-3 py-3", enabled ? "border-blue-200" : "border-slate-200")}><span><span className="block text-sm font-semibold text-slate-800">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.description}</span></span><input className="mt-1 h-4 w-4" type="checkbox" checked={enabled} onChange={() => toggle(role, option.id)} /></label>;
              })}
            </div>
          </section>
        ))}
      </form>
    </SettingsPanel>
  );
};

export default RolePermissionsSettings;
