import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  deleteManagedUser,
  fetchManagedUsers,
  fetchSubscriptionPlan,
  inviteUser,
  updateManagedUser,
  updateUserRole,
} from "@/lib/api";
import {
  getDashboardPathByRole,
  hasAdminPanelAccess,
  hasTesterPanelAccess,
  hasWorkspaceMailAccess,
  ROLE_TESTER,
} from "@/lib/roles";
import { getWorkspaceSenderResponseState } from "@/lib/workspaceSender";
import { useAuth } from "@/hooks/use-auth";
import { useEmailSettings } from "@/hooks/useEmailSettings";
import { useWorkspaceSender } from "@/hooks/useWorkspaceSender";
import AdminSettingsLayout from "@/components/settings/AdminSettingsLayout";
import AISettings from "@/components/settings/AISettings";
import ChangePasswordSettings from "@/components/settings/ChangePasswordSettings";
import ImportUsersCSVSettings from "@/components/settings/ImportUsersCSVSettings";
import InviteUserSettings from "@/components/settings/InviteUserSettings";
import ModifyRoleSettings from "@/components/settings/ModifyRoleSettings";
import ModuleOwnershipSettings from "@/components/settings/ModuleOwnershipSettings";
import ScreenPermissionsSettings from "@/components/settings/ScreenPermissionsSettings";
import SMTPConfigurationSettings from "@/components/settings/SMTPConfigurationSettings";
import UsersSettings from "@/components/settings/UsersSettings";
import WorkspaceMailSenderSettings from "@/components/settings/WorkspaceMailSenderSettings";
import ToastNotice from "@/components/shared/ToastNotice";
import { Card, CardContent } from "@/components/ui/card";

const ADMIN_SETTINGS_ITEMS = [
  { id: "users", label: "Users" },
  { id: "invite", label: "Invite User" },
  { id: "roles", label: "Modify User Role" },
  { id: "screens", label: "Screen Permissions" },
  { id: "ownership", label: "Module Ownership" },
  { id: "ai", label: "AI Settings" },
  { id: "sender", label: "Workspace Mail Sender" },
  { id: "smtp", label: "SMTP Configuration" },
  { id: "import", label: "Import Users from CSV" },
];

const TESTER_SETTINGS_ITEMS = [
  { id: "sender", label: "Workspace Mail Sender" },
  { id: "smtp", label: "SMTP Configuration" },
  { id: "password", label: "Change Password" },
];

const MAIL_ADMIN_SETTINGS_ITEMS = [
  { id: "sender", label: "Workspace Mail Sender" },
  { id: "smtp", label: "SMTP Configuration" },
  { id: "password", label: "Change Password" },
];

const ADMIN_DEFAULT_SETTINGS_ITEM = "users";
const TESTER_DEFAULT_SETTINGS_ITEM = "sender";
const USER_FILTER_KEY_ALL = "all";

const UserSettingsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const redirectTimeoutRef = useRef(null);
  const workspaceSenderNoteRef = useRef("");
  const { token, user: authUser, setAuthSession } = useAuth();
  const canManageWorkspaceUsers = hasAdminPanelAccess(authUser?.role);
  const canManageWorkspaceMail = hasWorkspaceMailAccess(authUser?.role);
  const isPersonalMailSettingsMode =
    hasTesterPanelAccess(authUser?.role) && !canManageWorkspaceMail;
  const settingsItems = canManageWorkspaceUsers
    ? ADMIN_SETTINGS_ITEMS
    : canManageWorkspaceMail
      ? MAIL_ADMIN_SETTINGS_ITEMS
    : TESTER_SETTINGS_ITEMS;
  const defaultSettingsItem = canManageWorkspaceUsers
    ? ADMIN_DEFAULT_SETTINGS_ITEM
    : TESTER_DEFAULT_SETTINGS_ITEM;

  const [activeSettingsItem, setActiveSettingsItem] = useState(defaultSettingsItem);
  const [activeUserFilter, setActiveUserFilter] = useState(USER_FILTER_KEY_ALL);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Developer");
  const [inviteFeedback, setInviteFeedback] = useState("");
  const [recentInvite, setRecentInvite] = useState(null);
  const [selectedUser, setSelectedUser] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [newRole, setNewRole] = useState("");
  const [toast, setToast] = useState(null);
  const [selectedSenderId, setSelectedSenderId] = useState("");
  const [isSenderDirty, setIsSenderDirty] = useState(false);

  const showToast = (type, message) => {
    setToast({
      id: Date.now(),
      type,
      message,
    });
  };

  useEffect(() => {
    if (!toast?.id) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [toast?.id]);

  useEffect(
    () => () => {
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (settingsItems.some((item) => item.id === activeSettingsItem)) {
      return;
    }

    setActiveSettingsItem(defaultSettingsItem);
  }, [activeSettingsItem, defaultSettingsItem, settingsItems]);

  useEffect(() => {
    if (!canManageWorkspaceUsers) {
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    const requestedPanel = searchParams.get("panel");
    const requestedRole = searchParams.get("role");

    if (requestedPanel && settingsItems.some((item) => item.id === requestedPanel)) {
      setActiveSettingsItem(requestedPanel);
    }

    if (requestedRole) {
      setActiveUserFilter(requestedRole);
      setActiveSettingsItem("users");
    }
  }, [canManageWorkspaceUsers, location.search, settingsItems]);

  const {
    data: users = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["managed-users"],
    queryFn: fetchManagedUsers,
    enabled: canManageWorkspaceUsers,
  });

  const {
    eligibleSendersQuery,
    workspaceSenderQuery,
    saveWorkspaceSenderMutation,
  } = useWorkspaceSender({
    enabled: canManageWorkspaceMail,
  });

  const { data: subscriptionPlan } = useQuery({
    queryKey: ["subscription-plan"],
    queryFn: fetchSubscriptionPlan,
    enabled: canManageWorkspaceUsers,
  });

  const eligibleSenders = canManageWorkspaceMail ? eligibleSendersQuery.data || [] : [];
  const {
    workspaceSender,
    manualSelection,
    workspaceDefaultSelection,
    manualSenderId,
    activeSenderId,
  } = useMemo(
    () => getWorkspaceSenderResponseState(workspaceSenderQuery.data),
    [workspaceSenderQuery.data]
  );
  const currentUserSenderProfile = useMemo(() => {
    const authUserId = String(authUser?._id || "");

    if (!authUserId) {
      return null;
    }

    return (
      eligibleSenders.find((user) => String(user._id) === authUserId) ||
      (workspaceSender?.user &&
      String(workspaceSender.user._id || "") === authUserId
        ? workspaceSender.user
        : null)
    );
  }, [authUser?._id, eligibleSenders, workspaceSender?.user]);
  const preferredSenderId =
    manualSenderId || currentUserSenderProfile?._id || activeSenderId || "";

  const {
    emailConfigQuery,
    saveEmailConfigMutation,
  } = useEmailSettings(selectedSenderId, {
    enabled: canManageWorkspaceMail && Boolean(selectedSenderId),
  });
  const {
    emailConfigQuery: activeSenderEmailConfigQuery,
    testEmailConfigMutation: activeSenderTestEmailMutation,
  } = useEmailSettings(activeSenderId, {
    enabled: canManageWorkspaceMail && Boolean(activeSenderId),
  });
  const {
    emailConfigQuery: testerEmailConfigQuery,
    saveEmailConfigMutation: testerSaveEmailConfigMutation,
    testEmailConfigMutation: testerTestEmailConfigMutation,
  } = useEmailSettings(authUser?._id || "", {
    enabled: isPersonalMailSettingsMode && Boolean(authUser?._id),
  });

  useEffect(() => {
    if (!canManageWorkspaceMail) {
      return;
    }

    if (
      isSenderDirty ||
      workspaceSenderQuery.isLoading ||
      eligibleSendersQuery.isLoading
    ) {
      return;
    }

    setSelectedSenderId(preferredSenderId);
  }, [
    eligibleSendersQuery.isLoading,
    isSenderDirty,
    preferredSenderId,
    workspaceSenderQuery.isLoading,
    canManageWorkspaceMail,
  ]);

  useEffect(() => {
    if (!canManageWorkspaceMail) {
      workspaceSenderNoteRef.current = "";
      return;
    }

    const note = workspaceSender?.note || "";

    if (!note) {
      workspaceSenderNoteRef.current = "";
      return;
    }

    if (workspaceSenderNoteRef.current === note) {
      return;
    }

    workspaceSenderNoteRef.current = note;
    showToast("warning", note);
  }, [canManageWorkspaceMail, workspaceSender?.note]);

  useEffect(() => {
    if (!canManageWorkspaceMail || !selectedSenderId) {
      return;
    }

    const isStillEligible =
      eligibleSenders.some(
        (user) => String(user._id) === String(selectedSenderId)
      ) ||
      String(workspaceSender?.user?._id || "") === String(selectedSenderId);

    if (
      !isStillEligible &&
      !eligibleSendersQuery.isLoading &&
      !workspaceSenderQuery.isLoading
    ) {
      setSelectedSenderId(preferredSenderId);
      setIsSenderDirty(false);
    }
  }, [
    eligibleSenders,
    eligibleSendersQuery.isLoading,
    preferredSenderId,
    selectedSenderId,
    workspaceSender?.user?._id,
    workspaceSenderQuery.isLoading,
    canManageWorkspaceMail,
  ]);

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => (left.name || "").localeCompare(right.name || "")),
    [users]
  );

  const userOptions = useMemo(
    () =>
      sortedUsers.map((user) => ({
        value: user._id,
        label: user.name,
        email: user.email,
        role: user.role,
      })),
    [sortedUsers]
  );

  const selectedUserOption = useMemo(
    () => userOptions.find((option) => option.value === selectedUser) || null,
    [selectedUser, userOptions]
  );

  const selectedSender = useMemo(() => {
    const senderCandidates = [
      ...eligibleSenders,
      workspaceSender?.user,
      manualSelection?.user,
      workspaceDefaultSelection?.user,
    ].filter(Boolean);

    if (!selectedSenderId) {
      return null;
    }

    return (
      senderCandidates.find(
        (user) => String(user._id) === String(selectedSenderId)
      ) || null
    );
  }, [
    eligibleSenders,
    manualSelection?.user,
    selectedSenderId,
    workspaceDefaultSelection?.user,
    workspaceSender?.user,
  ]);
  const activeSenderEmailConfig = activeSenderEmailConfigQuery.data?.config || null;
  const testerEmailConfig = testerEmailConfigQuery.data?.config || null;
  const testerSenderProfile = testerEmailConfigQuery.data?.user || null;
  const testerSelectedSender = useMemo(() => {
    if (!authUser?._id) {
      return null;
    }

    return {
      _id: authUser._id,
      name: authUser.name || "Tester",
      email: authUser.email || "",
      role: authUser.role || ROLE_TESTER,
      smtpConfigured: Boolean(
        testerSenderProfile?.smtpConfigured || testerEmailConfig?.hasPassword
      ),
    };
  }, [
    authUser?._id,
    authUser?.email,
    authUser?.name,
    authUser?.role,
    testerEmailConfig?.hasPassword,
    testerSenderProfile?.smtpConfigured,
  ]);
  const testerWorkspaceSender = useMemo(
    () => ({
      enabled: Boolean(testerSelectedSender?._id),
      userId: testerSelectedSender?._id || "",
      user: testerSelectedSender,
      source: "personal-account",
      manualSelection: {
        enabled: Boolean(testerSelectedSender?._id),
        userId: testerSelectedSender?._id || "",
        user: testerSelectedSender,
      },
      workspaceDefault: {
        enabled: false,
        userId: "",
        user: null,
      },
      note: "",
    }),
    [testerSelectedSender]
  );

  const inviteMutation = useMutation({
    mutationFn: inviteUser,
    onSuccess: (data) => {
      setInviteFeedback(
        [data.message || "User invited successfully", data.warning]
          .filter(Boolean)
          .join(" ")
      );
      setRecentInvite(
        data.invitedUser
          ? {
              ...data.invitedUser,
              emailSent: data.emailSent !== false,
              temporaryPassword: data.temporaryPassword || "",
              warning: data.warning || "",
            }
          : null
      );
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["eligible-senders"] });
    },
  });

  const roleUpdateMutation = useMutation({
    mutationFn: updateUserRole,
    onSuccess: (data) => {
      const updatedUser = data.user;

      setSelectedUser(updatedUser._id);
      setCurrentRole(updatedUser.role);
      setNewRole(updatedUser.role);
      showToast(
        "success",
        [data.message, data.warning].filter(Boolean).join(" ")
      );

      const mergeUpdatedUser = (existingUsers = []) =>
        Array.isArray(existingUsers)
          ? existingUsers.map((user) =>
              user._id === updatedUser._id ? { ...user, ...updatedUser } : user
            )
          : existingUsers;

      queryClient.setQueryData(["managed-users"], mergeUpdatedUser);
      queryClient.setQueryData(["users"], mergeUpdatedUser);

      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["eligible-senders"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-sender"] });
      queryClient.invalidateQueries({ queryKey: ["email-config"] });

      const isCurrentUser = authUser?._id === updatedUser._id;
      const isLosingAdminAccess =
        isCurrentUser &&
        hasAdminPanelAccess(authUser?.role) &&
        !hasAdminPanelAccess(updatedUser.role);

      if (isLosingAdminAccess) {
        redirectTimeoutRef.current = window.setTimeout(() => {
          setAuthSession({
            token,
            user: {
              ...authUser,
              ...updatedUser,
            },
          });
          navigate(getDashboardPathByRole(updatedUser.role), {
            replace: true,
          });
        }, 900);
      }
    },
    onError: (mutationError) => {
      showToast(
        "error",
        mutationError.response?.data?.message ||
          "Unable to update this user's role right now."
      );
    },
  });

  const mergeUpdatedUser = (updatedUser) => (existingUsers = []) =>
    Array.isArray(existingUsers)
      ? existingUsers.map((user) =>
          user._id === updatedUser._id ? { ...user, ...updatedUser } : user
        )
      : existingUsers;

  const removeDeletedUser = (deletedUserId) => (existingUsers = []) =>
    Array.isArray(existingUsers)
      ? existingUsers.filter((user) => user._id !== deletedUserId)
      : existingUsers;

  const invalidateUserCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["managed-users"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
    queryClient.invalidateQueries({ queryKey: ["eligible-senders"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-sender"] });
    queryClient.invalidateQueries({ queryKey: ["email-config"] });
  };

  const userUpdateMutation = useMutation({
    mutationFn: updateManagedUser,
    onSuccess: (data) => {
      const updatedUser = data.user;

      queryClient.setQueryData(["managed-users"], mergeUpdatedUser(updatedUser));
      queryClient.setQueryData(["users"], mergeUpdatedUser(updatedUser));
      invalidateUserCaches();

      if (authUser?._id === updatedUser._id) {
        setAuthSession({
          token,
          user: {
            ...authUser,
            ...updatedUser,
          },
        });
      }

      showToast(
        "success",
        [data.message || "User updated successfully.", data.warning]
          .filter(Boolean)
          .join(" ")
      );
    },
    onError: (mutationError) => {
      showToast(
        "error",
        mutationError.response?.data?.message ||
          "Unable to update this user right now."
      );
    },
  });

  const userDeleteMutation = useMutation({
    mutationFn: deleteManagedUser,
    onSuccess: (data, deletedUserId) => {
      queryClient.setQueryData(["managed-users"], removeDeletedUser(deletedUserId));
      queryClient.setQueryData(["users"], removeDeletedUser(deletedUserId));
      invalidateUserCaches();
      showToast("success", data.message || "User deleted successfully.");
    },
    onError: (mutationError) => {
      showToast(
        "error",
        mutationError.response?.data?.message ||
          "Unable to delete this user right now."
      );
    },
  });

  const isRoleUpdateDisabled =
    roleUpdateMutation.isPending ||
    !selectedUser ||
    !currentRole ||
    !newRole ||
    currentRole === newRole;

  const handleInviteSubmit = async (event) => {
    event.preventDefault();
    setInviteFeedback("");
    setRecentInvite(null);

    try {
      await inviteMutation.mutateAsync({
        email: inviteEmail.trim(),
        role: inviteRole,
      });
    } catch (mutationError) {
      return mutationError;
    }

    return undefined;
  };

  const handleRoleSelectionChange = (option) => {
    setSelectedUser(option?.value || "");
    setCurrentRole(option?.role || "");
    setNewRole(option?.role || "");
  };

  const handleRoleUpdateSubmit = async (event) => {
    event.preventDefault();

    if (!selectedUser) {
      showToast("error", "Select a user before updating a role.");
      return;
    }

    if (!newRole) {
      showToast("error", "Choose a new role to continue.");
      return;
    }

    if (newRole === currentRole) {
      showToast("error", "Choose a different role before updating.");
      return;
    }

    try {
      await roleUpdateMutation.mutateAsync({
        id: selectedUser,
        role: newRole,
      });
    } catch (mutationError) {
      return mutationError;
    }

    return undefined;
  };

  const handleActivateSelectedSender = async () => {
    if (!selectedSenderId) {
      showToast("error", "Select a sender user before saving your active sender.");
      return;
    }

    if (!selectedSender?.smtpConfigured) {
      showToast(
        "error",
        "The selected user does not have SMTP configuration yet. Save it first."
      );
      return;
    }

    try {
      const response = await saveWorkspaceSenderMutation.mutateAsync({
        userId: selectedSenderId,
        enabled: true,
      });
      const responseWorkspaceSender = response?.workspaceSender;

      setSelectedSenderId(
        responseWorkspaceSender?.manualSelection?.userId ||
          responseWorkspaceSender?.userId ||
          selectedSenderId
      );
      setIsSenderDirty(false);

      showToast(
        "success",
        response?.message || "Active sender saved successfully."
      );
    } catch (mutationError) {
      showToast(
        "error",
        mutationError.response?.data?.message ||
          "Unable to save your active sender right now."
      );
    }
  };

  const handleClearWorkspaceSender = async () => {
    try {
      const response = await saveWorkspaceSenderMutation.mutateAsync({
        userId: "",
        enabled: false,
      });
      const responseWorkspaceSender = response?.workspaceSender;

      setSelectedSenderId(
        currentUserSenderProfile?._id ||
          responseWorkspaceSender?.workspaceDefault?.userId ||
          responseWorkspaceSender?.userId ||
          ""
      );
      setIsSenderDirty(false);

      showToast(
        "success",
        response?.message || "Active sender reset successfully."
      );
    } catch (mutationError) {
      showToast(
        "error",
        mutationError.response?.data?.message ||
          "Unable to save your active sender right now."
      );
    }
  };

  const handleTestActiveSender = async () => {
    if (isPersonalMailSettingsMode) {
      if (!authUser?._id || !testerSelectedSender?.smtpConfigured) {
        showToast(
          "error",
          "Finish your SMTP configuration before sending a test email."
        );
        return;
      }

      if (!testerEmailConfig) {
        showToast("error", "Unable to load your SMTP configuration.");
        return;
      }

      try {
        const response = await testerTestEmailConfigMutation.mutateAsync({
          userId: authUser._id,
          host: testerEmailConfig.host,
          port: testerEmailConfig.port,
          secure: testerEmailConfig.secure,
          username: testerEmailConfig.username,
          password: "",
          fromName: testerEmailConfig.fromName,
          fromEmail: testerEmailConfig.fromEmail,
        });

        showToast("success", response?.message || "Test email sent successfully.");
      } catch (mutationError) {
        showToast(
          "error",
          mutationError.response?.data?.message ||
            "Unable to send a test email right now."
        );
      }

      return;
    }

    if (!activeSenderId || !workspaceSender?.user?.smtpConfigured) {
      showToast(
        "error",
        workspaceSender?.source === "global-default"
          ? "The current sender is using the global fallback, so there is no saved user SMTP profile to test."
          : "The active sender needs SMTP setup before sending a test email."
      );
      return;
    }

    if (!activeSenderEmailConfig) {
      showToast("error", "Unable to load the active sender SMTP configuration.");
      return;
    }

    try {
      const response = await activeSenderTestEmailMutation.mutateAsync({
        userId: activeSenderId,
        host: activeSenderEmailConfig.host,
        port: activeSenderEmailConfig.port,
        secure: activeSenderEmailConfig.secure,
        username: activeSenderEmailConfig.username,
        password: "",
        fromName: activeSenderEmailConfig.fromName,
        fromEmail: activeSenderEmailConfig.fromEmail,
      });

      showToast("success", response?.message || "Test email sent successfully.");
    } catch (mutationError) {
      showToast(
        "error",
        mutationError.response?.data?.message ||
          "Unable to send a test email right now."
      );
    }
  };

  const renderActiveSettingsItem = () => {
    if (canManageWorkspaceUsers && activeSettingsItem === "invite") {
      return (
        <InviteUserSettings
          feedback={inviteFeedback}
          inviteEmail={inviteEmail}
          inviteMutation={inviteMutation}
          inviteRole={inviteRole}
          onEmailChange={setInviteEmail}
          onRoleChange={setInviteRole}
          onSubmit={handleInviteSubmit}
          recentInvite={recentInvite}
        />
      );
    }

    if (canManageWorkspaceUsers && activeSettingsItem === "roles") {
      return (
        <ModifyRoleSettings
          currentRole={currentRole}
          isLoading={isLoading}
          isRoleUpdateDisabled={isRoleUpdateDisabled}
          newRole={newRole}
          onNewRoleChange={setNewRole}
          onRoleSelectionChange={handleRoleSelectionChange}
          onSubmit={handleRoleUpdateSubmit}
          roleUpdateMutation={roleUpdateMutation}
          selectedUser={selectedUser}
          selectedUserOption={selectedUserOption}
          userOptions={userOptions}
          users={users}
        />
      );
    }

    if (activeSettingsItem === "sender") {
      if (isPersonalMailSettingsMode) {
        return (
          <WorkspaceMailSenderSettings
            currentUser={authUser}
            currentWorkspaceSender={testerWorkspaceSender}
            eligibleSenders={[]}
            errorMessage=""
            isLoading={!authUser?._id}
            isSaving={false}
            isTesting={testerTestEmailConfigMutation.isPending}
            canSendTestMail={Boolean(
              testerSelectedSender?.smtpConfigured &&
                testerEmailConfig &&
                !testerEmailConfigQuery.isLoading
            )}
            personalAccountMode
            selectedSenderId={authUser?._id || ""}
            onSelectedSenderChange={() => {}}
            onSendTestMail={handleTestActiveSender}
            onActivateSelected={() => {}}
            onClearSender={() => {}}
          />
        );
      }

      return (
        <WorkspaceMailSenderSettings
          currentUser={authUser}
          currentWorkspaceSender={workspaceSender}
          eligibleSenders={eligibleSenders}
          errorMessage={
            eligibleSendersQuery.error?.response?.data?.message ||
            workspaceSenderQuery.error?.response?.data?.message ||
            ""
          }
          isLoading={eligibleSendersQuery.isLoading || workspaceSenderQuery.isLoading}
          isSaving={saveWorkspaceSenderMutation.isPending}
          isTesting={activeSenderTestEmailMutation.isPending}
          canSendTestMail={Boolean(
            activeSenderId &&
              workspaceSender?.user?.smtpConfigured &&
              activeSenderEmailConfig &&
              !activeSenderEmailConfigQuery.isLoading
          )}
          selectedSenderId={selectedSenderId}
          onSelectedSenderChange={(value) => {
            setSelectedSenderId(value);
            setIsSenderDirty(true);
          }}
          onSendTestMail={handleTestActiveSender}
          onActivateSelected={handleActivateSelectedSender}
          onClearSender={handleClearWorkspaceSender}
        />
      );
    }

    if (canManageWorkspaceUsers && activeSettingsItem === "ownership") {
      return <ModuleOwnershipSettings showToast={showToast} />;
    }

    if (canManageWorkspaceUsers && activeSettingsItem === "screens") {
      return <ScreenPermissionsSettings showToast={showToast} />;
    }

    if (canManageWorkspaceUsers && activeSettingsItem === "ai") {
      return <AISettings showToast={showToast} />;
    }

    if (activeSettingsItem === "smtp") {
      if (isPersonalMailSettingsMode) {
        return (
          <SMTPConfigurationSettings
            currentWorkspaceSender={testerWorkspaceSender}
            emailConfigQuery={testerEmailConfigQuery}
            personalAccountMode
            saveEmailConfigMutation={testerSaveEmailConfigMutation}
            selectedSender={testerSelectedSender}
            showToast={showToast}
          />
        );
      }

      return (
        <SMTPConfigurationSettings
          currentWorkspaceSender={workspaceSender}
          emailConfigQuery={emailConfigQuery}
          saveEmailConfigMutation={saveEmailConfigMutation}
          selectedSender={selectedSender}
          showToast={showToast}
        />
      );
    }

    if (activeSettingsItem === "password") {
      return (
        <div className="w-full max-w-[520px]">
          <ChangePasswordSettings />
        </div>
      );
    }

    if (canManageWorkspaceUsers && activeSettingsItem === "import") {
      return (
        <ImportUsersCSVSettings
          onImported={() => {
            queryClient.invalidateQueries({ queryKey: ["managed-users"] });
            queryClient.invalidateQueries({ queryKey: ["users"] });
            queryClient.invalidateQueries({ queryKey: ["eligible-senders"] });
          }}
        />
      );
    }

    if (canManageWorkspaceUsers) {
      return (
        <UsersSettings
          activeFilter={activeUserFilter}
          currentUserId={authUser?._id || ""}
          deleteMutation={userDeleteMutation}
          isLoading={isLoading}
          onActiveFilterChange={setActiveUserFilter}
          updateMutation={userUpdateMutation}
          users={users}
          usage={subscriptionPlan?.usage?.users}
        />
      );
    }

    return (
      <WorkspaceMailSenderSettings
        currentUser={authUser}
        currentWorkspaceSender={testerWorkspaceSender}
        eligibleSenders={[]}
        errorMessage=""
        isLoading={!authUser?._id}
        isSaving={false}
        isTesting={testerTestEmailConfigMutation.isPending}
        canSendTestMail={Boolean(
          testerSelectedSender?.smtpConfigured &&
            testerEmailConfig &&
            !testerEmailConfigQuery.isLoading
        )}
        personalAccountMode
        selectedSenderId={authUser?._id || ""}
        onSelectedSenderChange={() => {}}
        onSendTestMail={handleTestActiveSender}
        onActivateSelected={() => {}}
        onClearSender={() => {}}
      />
    );
  };

  if (canManageWorkspaceUsers && error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {error.response?.data?.message || "Unable to load settings right now."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="-mx-6 space-y-6">
      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />

      <AdminSettingsLayout
        activeItem={activeSettingsItem}
        items={settingsItems}
        onActiveItemChange={setActiveSettingsItem}
      >
        {renderActiveSettingsItem()}
      </AdminSettingsLayout>
    </div>
  );
};

export default UserSettingsPage;
