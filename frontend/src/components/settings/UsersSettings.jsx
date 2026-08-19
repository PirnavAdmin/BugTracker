import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Edit2,
  MailPlus,
  Search,
  ShieldCheck,
  Trash2,
  UserCircle2,
  UserRoundCheck,
  Users2,
  X,
} from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import SettingsPanel from "@/components/settings/SettingsPanel";
import UserAvatar from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WORKSPACE_ROLE_OPTIONS } from "@/lib/roles";
import { cn, formatDate } from "@/lib/utils";

const USER_FILTER_KEY_ALL = "all";

const getRoleBadgeVariant = (role) => {
  if (role === "Admin") {
    return "default";
  }

  if (role === "Manager") {
    return "secondary";
  }

  return "outline";
};

const summaryIconMap = {
  [USER_FILTER_KEY_ALL]: Users2,
  Admin: ShieldCheck,
  Manager: UserCircle2,
  "Team Lead": UserRoundCheck,
  "Q/A Lead": CheckCircle2,
  Developer: MailPlus,
  Tester: CheckCircle2,
};

const UsersSettings = ({
  activeFilter,
  currentUserId = "",
  deleteMutation,
  isLoading,
  onActiveFilterChange,
  updateMutation,
  usage,
  users = [],
}) => {
  const [searchDraft, setSearchDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    employeeId: "",
    designation: "",
    role: "Developer",
  });

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => (left.name || "").localeCompare(right.name || "")),
    [users]
  );

  const stats = useMemo(() => {
    const countByRole = (role) => users.filter((user) => user.role === role).length;

    return {
      total: users.length,
      adminCount: countByRole("Admin"),
      managerCount: countByRole("Manager"),
      teamLeadCount: countByRole("Team Lead"),
      qaLeadCount: countByRole("Q/A Lead"),
      developerCount: countByRole("Developer"),
      testerCount: countByRole("Tester"),
    };
  }, [users]);

  const summaryCards = useMemo(
    () => [
      {
        key: USER_FILTER_KEY_ALL,
        label: "Total Users",
        count: stats.total,
        description: "All workspace members",
      },
      {
        key: "Admin",
        label: "Admins",
        count: stats.adminCount,
        description: "Workspace administrators",
      },
      {
        key: "Manager",
        label: "Managers",
        count: stats.managerCount,
        description: "Delivery managers",
      },
      {
        key: "Team Lead",
        label: "Team Leads",
        count: stats.teamLeadCount,
        description: "Leads managing team execution",
      },
      {
        key: "Q/A Lead",
        label: "Q/A Leads",
        count: stats.qaLeadCount,
        description: "QA owners with assignment access",
      },
      {
        key: "Developer",
        label: "Developers",
        count: stats.developerCount,
        description: "Implementation teammates",
      },
      {
        key: "Tester",
        label: "Testers",
        count: stats.testerCount,
        description: "QA and validation users",
      },
    ],
    [stats]
  );

  const visibleUsers = useMemo(() => {
    const roleFilteredUsers =
      !activeFilter || activeFilter === USER_FILTER_KEY_ALL
        ? sortedUsers
        : sortedUsers.filter((user) => user.role === activeFilter);

    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    if (!normalizedSearchTerm) {
      return roleFilteredUsers;
    }

    return roleFilteredUsers.filter((user) =>
      [
        user.name,
        user.email,
        user.role,
        user.employeeId,
        user.designation,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearchTerm))
    );
  }, [activeFilter, searchTerm, sortedUsers]);

  const activeCard =
    summaryCards.find((card) => card.key === activeFilter) || summaryCards[0];
  const activeLabel =
    !activeFilter || activeFilter === USER_FILTER_KEY_ALL
      ? "Workspace Users"
      : activeCard.label;

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setSearchTerm(searchDraft.trim());
  };

  const clearSearch = () => {
    setSearchDraft("");
    setSearchTerm("");
  };

  const openEditDialog = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      employeeId: user.employeeId || "",
      designation: user.designation || "",
      role: user.role || "Developer",
    });
  };

  const handleEditFieldChange = (field, value) => {
    setEditForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();

    if (!editingUser?._id || !updateMutation) {
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: editingUser._id,
        payload: {
          ...editForm,
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          employeeId: editForm.employeeId.trim(),
          designation: editForm.designation.trim(),
        },
      });
      setEditingUser(null);
    } catch (error) {
      return error;
    }

    return undefined;
  };

  const handleDeleteConfirm = async () => {
    if (!deletingUser?._id || !deleteMutation) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(deletingUser._id);
      setDeletingUser(null);
    } catch (error) {
      return error;
    }

    return undefined;
  };

  return (
    <SettingsPanel
      title="Users"
      description="Review workspace membership, role distribution, and account creation dates."
      actions={
        activeFilter && activeFilter !== USER_FILTER_KEY_ALL ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onActiveFilterChange(USER_FILTER_KEY_ALL)}
          >
            <X className="h-4 w-4" />
            Clear Filter
          </Button>
        ) : null
      }
    >
      {usage ? (
        <div className="mb-5 rounded-[16px] border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <span className="font-semibold">User seats:</span>{" "}
          {usage.current} / {usage.unlimited ? "Unlimited" : usage.limit}
        </div>
      ) : null}
      {isLoading ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-28 rounded-[16px]" />
            ))}
          </div>
          <Skeleton className="h-[360px] rounded-[16px]" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {summaryCards.map((card) => {
              const Icon = summaryIconMap[card.key] || Users2;
              const isActive =
                (!activeFilter && card.key === USER_FILTER_KEY_ALL) ||
                activeFilter === card.key;

              return (
                <button
                  key={card.key}
                  type="button"
                  className={cn(
                    "rounded-[16px] border p-4 text-left transition duration-200",
                    isActive
                      ? "border-blue-200 bg-blue-50 text-blue-900 shadow-sm"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                  )}
                  onClick={() => onActiveFilterChange(card.key)}
                  aria-pressed={isActive}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-[12px]",
                        isActive ? "bg-white text-blue-700" : "bg-slate-100 text-slate-600"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-2xl font-semibold tracking-tight">
                      {card.count}
                    </span>
                  </div>
                  <p className="mt-4 text-sm font-semibold">{card.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {card.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="rounded-[16px] border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-950">
                  {activeLabel}
                </h3>
                <p className="text-sm text-slate-500">
                  {visibleUsers.length} user{visibleUsers.length === 1 ? "" : "s"} found
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:items-end">
                <Badge variant="outline">
                  {activeFilter && activeFilter !== USER_FILTER_KEY_ALL
                    ? `${activeCard.label} only`
                    : "All roles"}
                </Badge>
                <form
                  className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
                  onSubmit={handleSearchSubmit}
                >
                  <Input
                    className="h-10 rounded-xl sm:w-72"
                    placeholder="Search users"
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                  />
                  <Button type="submit" size="sm">
                    <Search className="h-4 w-4" />
                    Search
                  </Button>
                  {searchTerm ? (
                    <Button type="button" size="sm" variant="outline" onClick={clearSearch}>
                      <X className="h-4 w-4" />
                      Clear
                    </Button>
                  ) : null}
                </form>
              </div>
            </div>

            {visibleUsers.length ? (
              <div className="divide-y divide-slate-100">
                {visibleUsers.map((user) => (
                  <div
                    key={user._id}
                    className="flex flex-col gap-4 px-4 py-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar user={user} className="h-11 w-11 rounded-[14px]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {user.name}
                        </p>
                        <p className="truncate text-sm text-slate-600">{user.email}</p>
                        {user.employeeId || user.designation ? (
                          <p className="truncate text-xs text-slate-500">
                            {[user.employeeId, user.designation].filter(Boolean).join(" | ")}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      <Badge variant={getRoleBadgeVariant(user.role)}>{user.role}</Badge>
                      <span className="text-xs text-slate-500">
                        Added {formatDate(user.createdAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-xl"
                          aria-label={`Edit ${user.name}`}
                          onClick={() => openEditDialog(user)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-xl text-rose-600 hover:text-rose-700"
                          aria-label={`Delete ${user.name}`}
                          disabled={String(user._id) === String(currentUserId)}
                          onClick={() => setDeletingUser(user)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8">
                <EmptyState
                  title={`No ${activeCard?.label?.toLowerCase() || "users"} found`}
                  description={
                    searchTerm
                      ? "Try another search term or clear the current search."
                      : "Invite or import teammates to populate this category."
                  }
                  icon={<Users2 className="h-5 w-5" />}
                />
              </div>
            )}
          </div>

          <Dialog open={Boolean(editingUser)} onOpenChange={(open) => !open && setEditingUser(null)}>
            <DialogContent className="max-w-xl rounded-[24px]">
              <DialogHeader>
                <DialogTitle>Edit user</DialogTitle>
                <DialogDescription>
                  Update this workspace member's profile and role.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleEditSubmit}>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Name
                  </span>
                  <Input
                    value={editForm.name}
                    onChange={(event) => handleEditFieldChange("name", event.target.value)}
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Email
                  </span>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(event) => handleEditFieldChange("email", event.target.value)}
                    required
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Employee ID
                    </span>
                    <Input
                      value={editForm.employeeId}
                      onChange={(event) =>
                        handleEditFieldChange("employeeId", event.target.value)
                      }
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Designation
                    </span>
                    <Input
                      value={editForm.designation}
                      onChange={(event) =>
                        handleEditFieldChange("designation", event.target.value)
                      }
                    />
                  </label>
                </div>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Role
                  </span>
                  <select
                    className="field-select"
                    value={editForm.role}
                    onChange={(event) => handleEditFieldChange("role", event.target.value)}
                  >
                    {WORKSPACE_ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingUser(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateMutation?.isPending}>
                    {updateMutation?.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(deletingUser)}
            onOpenChange={(open) => !open && setDeletingUser(null)}
          >
            <DialogContent className="max-w-md rounded-[24px]">
              <DialogHeader>
                <DialogTitle>Delete user</DialogTitle>
                <DialogDescription>
                  This removes {deletingUser?.name || "this user"} from the workspace.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeletingUser(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteMutation?.isPending}
                  onClick={handleDeleteConfirm}
                >
                  {deleteMutation?.isPending ? "Deleting..." : "Delete User"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </SettingsPanel>
  );
};

export default UsersSettings;
