import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MonitorCog, Save } from "lucide-react";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchScreenPermissions, saveScreenPermissions } from "@/lib/api";
import {
  DEFAULT_SCREEN_PERMISSIONS,
  SCREEN_PERMISSION_PAGE_OPTIONS,
  SCREEN_PERMISSION_ROLES,
  normalizeScreenPermissions,
} from "@/lib/roles";
import { cn } from "@/lib/utils";

const ScreenPermissionsSettings = ({ showToast }) => {
  const queryClient = useQueryClient();
  const [draftPermissions, setDraftPermissions] = useState(
    DEFAULT_SCREEN_PERMISSIONS
  );
  const { data: savedPermissions = DEFAULT_SCREEN_PERMISSIONS, isLoading } =
    useQuery({
      queryKey: ["screen-permissions"],
      queryFn: fetchScreenPermissions,
    });

  const normalizedSavedPermissions = useMemo(
    () => normalizeScreenPermissions(savedPermissions),
    [savedPermissions]
  );

  useEffect(() => {
    setDraftPermissions(normalizedSavedPermissions);
  }, [normalizedSavedPermissions]);

  const saveMutation = useMutation({
    mutationFn: saveScreenPermissions,
    onSuccess: (data) => {
      const permissions = normalizeScreenPermissions(data?.permissions || {});

      queryClient.setQueryData(["screen-permissions"], permissions);
      showToast?.("success", data?.message || "Screen permissions saved.");
    },
    onError: (error) => {
      showToast?.(
        "error",
        error.response?.data?.message || "Unable to save screen permissions."
      );
    },
  });

  const togglePage = (role, pageId) => {
    setDraftPermissions((currentPermissions) => {
      const currentPages = currentPermissions[role] || [];
      const nextPages = currentPages.includes(pageId)
        ? currentPages.filter((currentPageId) => currentPageId !== pageId)
        : [...currentPages, pageId];

      return {
        ...currentPermissions,
        [role]: nextPages,
      };
    });
  };

  const selectAllForRole = (role) => {
    setDraftPermissions((currentPermissions) => ({
      ...currentPermissions,
      [role]: SCREEN_PERMISSION_PAGE_OPTIONS.map((page) => page.id),
    }));
  };

  const clearRole = (role) => {
    setDraftPermissions((currentPermissions) => ({
      ...currentPermissions,
      [role]: [],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await saveMutation.mutateAsync(normalizeScreenPermissions(draftPermissions));
  };

  return (
    <SettingsPanel
      title="Screen Permissions"
      description="Choose which navigation pages are visible for each delivery role."
      actions={
        <Button
          type="submit"
          form="screen-permissions-form"
          disabled={saveMutation.isPending || isLoading}
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      }
    >
      <form id="screen-permissions-form" className="space-y-4" onSubmit={handleSubmit}>
        {SCREEN_PERMISSION_ROLES.map((role) => {
          const selectedPages = draftPermissions[role] || [];

          return (
            <section
              key={role}
              className="rounded-[16px] border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-white text-blue-700 shadow-sm">
                      <MonitorCog className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">{role}</h3>
                      <p className="text-xs text-slate-500">
                        {selectedPages.length} of {SCREEN_PERMISSION_PAGE_OPTIONS.length} pages visible
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => selectAllForRole(role)}>
                    Select all
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => clearRole(role)}>
                    Clear
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {SCREEN_PERMISSION_PAGE_OPTIONS.map((page) => {
                  const isSelected = selectedPages.includes(page.id);

                  return (
                    <label
                      key={`${role}-${page.id}`}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border bg-white px-3 py-3 text-sm font-semibold transition",
                        isSelected
                          ? "border-blue-200 text-blue-800 shadow-sm"
                          : "border-slate-200 text-slate-700 hover:border-slate-300"
                      )}
                    >
                      <span>{page.label}</span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                        checked={isSelected}
                        onChange={() => togglePage(role, page.id)}
                      />
                    </label>
                  );
                })}
              </div>

              {!selectedPages.length ? (
                <Badge className="mt-3" variant="outline">
                  No pages selected for this role
                </Badge>
              ) : null}
            </section>
          );
        })}
      </form>
    </SettingsPanel>
  );
};

export default ScreenPermissionsSettings;
