import { CheckCircle2, Copy, GitBranch, KeyRound, Plus, RefreshCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const GIT_PROVIDERS = ["GitHub", "GitLab", "Bitbucket"];
export const DEFAULT_TEST_SUITES = [
  "Smoke Testing",
  "Regression",
  "API Testing",
  "Integration Testing",
];

export const WEBHOOK_EVENTS = [
  { key: "push", label: "Push" },
  { key: "pull_request", label: "Pull Request" },
  { key: "release", label: "Release" },
  { key: "workflow_run", label: "Workflow Run" },
  { key: "create", label: "Branch Create/Delete" },
  { key: "delete", label: "Branch Delete" },
  { key: "tag", label: "Tag" },
];

export const AUTOMATION_RULES = [
  ["autoNotifyQa", "Auto Notify QA"],
  ["autoDetectChangedModules", "Auto Detect Changed Modules"],
  ["autoLinkCommitsToTasks", "Auto Link Commits to Tasks"],
  ["autoLinkCommitsToBugs", "Auto Link Commits to Bugs"],
  ["autoGenerateReleaseNotes", "Auto Generate Release Notes"],
  ["autoCreateQaSession", "Auto Create QA Session"],
  ["autoUpdateTaskStatus", "Auto Update Task Status"],
  ["notifyAssignedDevelopers", "Notify Assigned Developers"],
];

const getAppOrigin = () => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "";
};

const buildWebhookEndpoint = (provider = "GitHub") => {
  const normalized = String(provider || "GitHub").toLowerCase();
  const path =
    normalized === "gitlab"
      ? "/api/webhooks/gitlab"
      : normalized === "bitbucket"
        ? "/api/webhooks/bitbucket"
        : "/api/webhooks/github";
  const origin = getAppOrigin();

  return origin ? `${origin}${path}` : path;
};

const normalizeWebhookEndpoint = (value = "", provider = "GitHub") => {
  const endpoint = String(value || "").trim();

  if (!endpoint) {
    return buildWebhookEndpoint(provider);
  }

  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  const origin = getAppOrigin();
  return origin ? `${origin}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}` : endpoint;
};

export const createDeliveryConfiguration = ({ gitEnabled = false } = {}) => ({
  git: {
    enabled: gitEnabled,
    provider: "GitHub",
    repositoryOwner: "",
    repositoryName: "",
    repositoryUrl: "",
    defaultBranch: "main",
    token: "",
    tokenConfigured: false,
    tokenAcknowledged: false,
    webhookEndpoint: buildWebhookEndpoint("GitHub"),
    webhookSecret: `cc_${Math.random().toString(36).slice(2, 10)}`,
    webhookEvents: ["push", "pull_request"],
    automationRules: {
      autoNotifyQa: true,
      autoDetectChangedModules: true,
      autoLinkCommitsToTasks: true,
      autoLinkCommitsToBugs: true,
      autoGenerateReleaseNotes: true,
      autoCreateQaSession: false,
      autoUpdateTaskStatus: true,
      notifyAssignedDevelopers: true,
    },
    moduleMappings: [],
    status: {
      connectionStatus: "Not Configured",
      latestCommitHash: "",
      latestCommitMessage: "",
      lastPushTime: null,
      lastSyncTime: null,
      webhookStatus: "Not Configured",
      connectionHealth: "Unknown",
      lastError: "",
    },
  },
  repository: {
    enabled: gitEnabled,
    provider: "GitHub",
    name: "",
    url: "",
    defaultBranch: "main",
    developmentBranch: "develop",
    qaBranch: "qa",
    releaseBranch: "release",
    webhookEnabled: gitEnabled,
    webhookEndpoint: buildWebhookEndpoint("GitHub"),
    webhookSecret: `cc_${Math.random().toString(36).slice(2, 10)}`,
    repositoryIdentifier: "",
    branchStrategy: {
      mainBranch: "main",
      developmentBranch: "develop",
      featurePattern: "feature/*",
      hotfixPattern: "hotfix/*",
      releasePattern: "release/*",
    },
  },
  deliveryWorkflow: {
    autoModuleDetection: true,
    autoQaNotification: true,
    releaseApprovalRequired: true,
    qaRequired: true,
    autoLinkCommitsToTasks: true,
    autoLinkCommitsToBugs: true,
    releaseNotesGeneration: true,
  },
  deliveryModules: [
    {
      name: "Login",
      description: "",
      ownerRole: "Shared",
      order: 0,
      sourcePaths: [],
      defaultTestSuites: ["Smoke Testing"],
    },
  ],
  defaultTestSuites: DEFAULT_TEST_SUITES,
  testCases: [],
});

export const normalizeProjectDeliveryConfiguration = (project = {}) => {
  const defaults = createDeliveryConfiguration({ gitEnabled: true });
  const legacyRepository = project.repository || {};
  const git = project.git || {};
  return {
    git: {
      ...defaults.git,
      ...git,
      repositoryOwner: git.repositoryOwner || legacyRepository.owner || "",
      repositoryName: git.repositoryName || legacyRepository.name || "",
      repositoryUrl: git.repositoryUrl || legacyRepository.url || "",
      defaultBranch: git.defaultBranch || legacyRepository.defaultBranch || "main",
      token: "",
      tokenConfigured: Boolean(git.tokenConfigured),
      tokenAcknowledged: Boolean(git.tokenConfigured),
      webhookEndpoint: normalizeWebhookEndpoint(
        git.webhookEndpoint || legacyRepository.webhookEndpoint,
        git.provider || legacyRepository.provider || "GitHub"
      ),
      webhookSecret: git.webhookSecret || legacyRepository.webhookSecret || defaults.git.webhookSecret,
      webhookEvents: Array.isArray(git.webhookEvents) && git.webhookEvents.length
        ? git.webhookEvents
        : legacyRepository.webhookEnabled
          ? defaults.git.webhookEvents
          : [],
      automationRules: {
        ...defaults.git.automationRules,
        ...(git.automationRules || {}),
        autoNotifyQa: git.automationRules?.autoNotifyQa ?? project.deliveryWorkflow?.autoQaNotification ?? true,
        autoDetectChangedModules: git.automationRules?.autoDetectChangedModules ?? project.deliveryWorkflow?.autoModuleDetection ?? true,
        autoLinkCommitsToTasks: git.automationRules?.autoLinkCommitsToTasks ?? project.deliveryWorkflow?.autoLinkCommitsToTasks ?? true,
        autoLinkCommitsToBugs: git.automationRules?.autoLinkCommitsToBugs ?? project.deliveryWorkflow?.autoLinkCommitsToBugs ?? true,
        autoGenerateReleaseNotes: git.automationRules?.autoGenerateReleaseNotes ?? project.deliveryWorkflow?.releaseNotesGeneration ?? true,
      },
      moduleMappings: Array.isArray(git.moduleMappings) ? git.moduleMappings : [],
      status: {
        ...defaults.git.status,
        ...(git.status || {}),
      },
    },
    repository: {
      ...defaults.repository,
      ...legacyRepository,
      branchStrategy: {
        ...defaults.repository.branchStrategy,
        ...(project.repository?.branchStrategy || {}),
      },
    },
    deliveryWorkflow: {
      ...defaults.deliveryWorkflow,
      ...(project.deliveryWorkflow || {}),
    },
    deliveryModules: Array.isArray(project.deliveryModules) && project.deliveryModules.length
      ? project.deliveryModules.map((module, index) => ({
          name: module?.name || "",
          description: module?.description || "",
          ownerRole: module?.ownerRole || "Shared",
          order: Number.isFinite(Number(module?.order)) ? Number(module.order) : index,
          sourcePaths: Array.isArray(module?.sourcePaths) ? module.sourcePaths : [],
          defaultTestSuites: Array.isArray(module?.defaultTestSuites)
            ? module.defaultTestSuites
            : [],
        }))
      : defaults.deliveryModules,
    defaultTestSuites: Array.isArray(project.defaultTestSuites) && project.defaultTestSuites.length
      ? project.defaultTestSuites
      : defaults.defaultTestSuites,
    testCases: Array.isArray(project.testCases) ? project.testCases : [],
  };
};

const webhookEndpointForProvider = (provider) => {
  return buildWebhookEndpoint(provider);
};

const chipClassName =
  "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600";
const fieldClassName =
  "h-10 rounded-xl border-slate-200 bg-white text-sm shadow-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/20";
const textareaClassName =
  "min-h-[70px] rounded-xl border-slate-200 bg-white text-sm shadow-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/20";

const ToggleField = ({ checked, disabled, label, onChange }) => (
  <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
    <span className="font-medium text-slate-700">{label}</span>
    <input
      type="checkbox"
      checked={Boolean(checked)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);

const formatStatusDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

const ProjectDeliveryConfiguration = ({
  value,
  onChange,
  readOnly = false,
  mode = "settings",
  onTestConnection,
  onSyncNow,
  isTestingConnection = false,
  isSyncing = false,
  testResult = null,
  syncResult = null,
}) => {
  const config = value || createDeliveryConfiguration();

  const update = (patch) => onChange?.({ ...config, ...patch });
  const webhookEndpoint = normalizeWebhookEndpoint(config.git.webhookEndpoint, config.git.provider);
  const tokenReady = Boolean(config.git.tokenConfigured || config.git.token?.trim());
  const patChecklistComplete = Boolean(config.git.tokenAcknowledged && tokenReady);
  const isCreateMode = mode === "create";
  const showGitFields = !isCreateMode || Boolean(config.git.enabled);
  const canTestConnection = typeof onTestConnection === "function";
  const canSyncRepository = typeof onSyncNow === "function";
  const handleToggleGitSetup = (checked) => {
    if (checked) {
      update({
        git: {
          ...config.git,
          enabled: true,
        },
        repository: {
          ...config.repository,
          enabled: true,
          webhookEnabled: (config.git.webhookEvents || []).length > 0,
        },
      });
      return;
    }

    const freshDefaults = createDeliveryConfiguration({ gitEnabled: false });
    update({
      git: freshDefaults.git,
      repository: freshDefaults.repository,
    });
  };
  const updateGit = (field, nextValue) => {
    const nextEnabled = isCreateMode ? Boolean(config.git.enabled) : true;
    const git = {
      ...config.git,
      enabled: nextEnabled,
      [field]: nextValue,
    };

    if (field === "repositoryUrl") {
      try {
        const url = new URL(nextValue);
        const [owner, repo] = url.pathname.replace(/^\/+/, "").replace(/\.git$/i, "").split("/");
        if (owner && !git.repositoryOwner) git.repositoryOwner = owner;
        if (repo && !git.repositoryName) git.repositoryName = repo;
      } catch {
        // Ignore URL parsing while the manager is still typing.
      }
    }

    update({
      git,
      repository: {
        ...config.repository,
        enabled: nextEnabled,
        provider: "GitHub",
        name: git.repositoryName,
        url: git.repositoryUrl,
        defaultBranch: git.defaultBranch,
        webhookEndpoint: normalizeWebhookEndpoint(git.webhookEndpoint, git.provider),
        webhookSecret: git.webhookSecret,
        webhookEnabled: nextEnabled && git.webhookEvents.length > 0,
        repositoryIdentifier: `${git.repositoryOwner}/${git.repositoryName}`,
      },
    });
  };
  const updateGitAutomationRule = (field, nextValue) =>
    updateGit("automationRules", {
      ...config.git.automationRules,
      [field]: nextValue,
    });
  const toggleWebhookEvent = (eventKey, checked) => {
    const currentEvents = Array.isArray(config.git.webhookEvents) ? config.git.webhookEvents : [];
    const nextEvents = checked
      ? Array.from(new Set([...currentEvents, eventKey]))
      : currentEvents.filter((event) => event !== eventKey);

    updateGit("webhookEvents", nextEvents);
  };
  const updateModuleMapping = (index, patch) =>
    updateGit(
      "moduleMappings",
      (config.git.moduleMappings || []).map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, ...patch } : mapping
      )
    );
  const addModuleMapping = () =>
    updateGit("moduleMappings", [
      ...(config.git.moduleMappings || []),
      { module: config.deliveryModules[0]?.name || "", paths: [] },
    ]);
  const removeModuleMapping = (index) =>
    updateGit(
      "moduleMappings",
      (config.git.moduleMappings || []).filter((_, mappingIndex) => mappingIndex !== index)
    );
  const updateRepository = (field, nextValue) => {
    const repository = {
      ...config.repository,
      [field]: nextValue,
    };
    if (field === "provider") {
      repository.webhookEndpoint = webhookEndpointForProvider(nextValue);
    }
    if (field === "defaultBranch") {
      repository.branchStrategy = {
        ...repository.branchStrategy,
        mainBranch: nextValue,
      };
    }
    update({ repository });
  };
  const updateBranchStrategy = (field, nextValue) =>
    update({
      repository: {
        ...config.repository,
        branchStrategy: {
          ...config.repository.branchStrategy,
          [field]: nextValue,
        },
      },
    });
  const updateWorkflow = (field, nextValue) =>
    update({
      deliveryWorkflow: {
        ...config.deliveryWorkflow,
        [field]: nextValue,
      },
    });
  const updateModule = (index, patch) =>
    update({
      deliveryModules: config.deliveryModules.map((module, moduleIndex) =>
        moduleIndex === index ? { ...module, ...patch } : module
      ),
    });
  const addModule = () =>
    update({
      deliveryModules: [
        ...config.deliveryModules,
        {
          name: "",
          description: "",
          ownerRole: "Shared",
          order: config.deliveryModules.length,
          sourcePaths: [],
          defaultTestSuites: [],
        },
      ],
    });
  const removeModule = (index) =>
    update({
      deliveryModules: config.deliveryModules
        .filter((_, moduleIndex) => moduleIndex !== index)
        .map((module, moduleIndex) => ({ ...module, order: moduleIndex })),
    });
  const addTestCase = () =>
    update({
      testCases: [
        ...config.testCases,
        {
          module: config.deliveryModules[0]?.name || "",
          title: "",
          description: "",
          estimatedMinutes: 10,
          active: true,
        },
      ],
    });
  const updateTestCase = (index, patch) =>
    update({
      testCases: config.testCases.map((testCase, testCaseIndex) =>
        testCaseIndex === index ? { ...testCase, ...patch } : testCase
      ),
    });
  const removeTestCase = (index) =>
    update({
      testCases: config.testCases.filter((_, testCaseIndex) => testCaseIndex !== index),
    });
  const updateListFromText = (items) =>
    String(items || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  const copyWebhookEndpoint = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(webhookEndpoint);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <GitBranch className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Git Configuration</h3>
              <p className="text-xs text-slate-500">
                {readOnly
                  ? "Repository settings are read-only for this role."
                  : isCreateMode
                    ? "Optional repository setup. You can configure this later."
                    : "Manager-owned repository setup."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isCreateMode ? (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                  checked={Boolean(config.git.enabled)}
                  disabled={readOnly}
                  onChange={(event) => handleToggleGitSetup(event.target.checked)}
                />
                <span>Configure Git now</span>
              </label>
            ) : null}
            <span className={chipClassName}>{isCreateMode ? "Optional" : "Manager Only"}</span>
          </div>
        </div>

        {showGitFields ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Git Provider{isCreateMode ? "" : " *"}</span>
                <select
                  className={`${fieldClassName} w-full px-3`}
                  value="GitHub"
                  disabled
                >
                  <option value="GitHub">GitHub</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repository Owner{isCreateMode ? "" : " *"}</span>
                <Input className={fieldClassName} value={config.git.repositoryOwner} disabled={readOnly} onChange={(event) => updateGit("repositoryOwner", event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repository Name{isCreateMode ? "" : " *"}</span>
                <Input className={fieldClassName} value={config.git.repositoryName} disabled={readOnly} onChange={(event) => updateGit("repositoryName", event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Default Branch{isCreateMode ? "" : " *"}</span>
                <Input className={fieldClassName} value={config.git.defaultBranch} disabled={readOnly} onChange={(event) => updateGit("defaultBranch", event.target.value)} />
              </label>
              <label className="space-y-1.5 md:col-span-2 xl:col-span-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repository URL{isCreateMode ? "" : " *"}</span>
                <Input className={fieldClassName} value={config.git.repositoryUrl} disabled={readOnly} placeholder="https://github.com/company/project" onChange={(event) => updateGit("repositoryUrl", event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">GitHub PAT{isCreateMode ? "" : " *"}</span>
                <Input
                  className={fieldClassName}
                  name="githubPat"
                  autoComplete="new-password"
                  value={config.git.token || ""}
                  disabled={readOnly}
                  type="password"
                  placeholder={config.git.tokenConfigured ? "Token saved. Enter a new token to replace." : "ghp_..."}
                  onChange={(event) => updateGit("token", event.target.value)}
                />
              </label>
            </div>

            <label className="mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm text-amber-950">
              <input
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-blue-600 focus:ring-blue-500/30"
                type="checkbox"
                checked={Boolean(config.git.tokenAcknowledged)}
                disabled={readOnly}
                onChange={(event) => updateGit("tokenAcknowledged", event.target.checked)}
              />
              <span className="space-y-1">
                <span className="block font-semibold">
                  I have generated a GitHub Personal Access Token and pasted it above.
                </span>
                <span className="block text-xs leading-5 text-amber-800">
                  This is required for new projects before testing, saving, or syncing Git configuration.
                </span>
              </span>
            </label>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Webhook Endpoint</span>
                <div className="flex gap-2">
                  <Input className={`${fieldClassName} min-w-0 bg-slate-50 text-slate-600`} value={webhookEndpoint} readOnly />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-10 shrink-0 rounded-xl px-0"
                    title="Copy webhook endpoint"
                    onClick={copyWebhookEndpoint}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Webhook Secret</span>
                <div className="flex gap-2">
                  <Input className={`${fieldClassName} min-w-0`} value={config.git.webhookSecret} disabled={readOnly} onChange={(event) => updateGit("webhookSecret", event.target.value)} />
                  <Button type="button" variant="outline" className="h-10 w-10 shrink-0 rounded-xl px-0" disabled={readOnly} title="Regenerate webhook secret" onClick={() => updateGit("webhookSecret", `cc_${Math.random().toString(36).slice(2, 10)}`)}>
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
                </div>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {canTestConnection ? (
                <Button type="button" className="h-9 rounded-xl" disabled={readOnly || isTestingConnection || !patChecklistComplete} onClick={() => onTestConnection?.(config)}>
                  <ShieldCheck className="h-4 w-4" />
                  {isTestingConnection ? "Testing..." : "Test Connection"}
                </Button>
              ) : null}
              {canSyncRepository ? (
                <Button type="button" variant="outline" className="h-9 rounded-xl" disabled={readOnly || isSyncing || !config.git.tokenConfigured} onClick={() => onSyncNow?.(config)}>
                  <RefreshCcw className="h-4 w-4" />
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </Button>
              ) : null}
              <span className={chipClassName}>
                <KeyRound className="h-3.5 w-3.5" />
                {config.git.tokenConfigured ? "Token stored securely" : "Token not saved"}
              </span>
            </div>
            {!canTestConnection ? (
              <p className="mt-2 text-xs text-slate-500">
                {isCreateMode
                  ? "GitHub connection and token permissions are verified automatically when you create the project. Test Connection and Sync Now are available in the project's Git Configuration tab after creation."
                  : "Open the project's Git Configuration tab to test the connection or sync commits."}
              </p>
            ) : null}

            {[testResult, syncResult].filter(Boolean).map((result, index) => (
              <div
                className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
                  result.type === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
                key={`${result.type}-${index}`}
              >
                {result.message}
              </div>
            ))}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            Git setup will be skipped during project creation. You can configure your repository, GitHub PAT, and webhooks later from the project&apos;s <span className="font-semibold text-slate-700">Git Configuration</span> tab.
          </div>
        )}
      </section>

      {showGitFields ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-slate-950">Repository Status</h3>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {[
                  ["Connection Status", config.git.status?.connectionStatus],
                  ["Repository Owner", config.git.repositoryOwner],
                  ["Repository Name", config.git.repositoryName],
                  ["Default Branch", config.git.defaultBranch],
                  ["Latest Commit Hash", config.git.status?.latestCommitHash],
                  ["Latest Commit Message", config.git.status?.latestCommitMessage],
                  ["Last Push Time", formatStatusDate(config.git.status?.lastPushTime)],
                  ["Last Sync Time", formatStatusDate(config.git.status?.lastSyncTime)],
                  ["Webhook Status", config.git.status?.webhookStatus],
                  ["Connection Health", config.git.status?.connectionHealth],
                ].map(([label, value]) => (
                  <div className="rounded-xl bg-slate-50 px-3 py-2" key={label}>
                    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
                    <p className="mt-1 truncate font-semibold text-slate-900">{value || "-"}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-950">Webhook Events</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <ToggleField
                    key={event.key}
                    label={event.label}
                    checked={(config.git.webhookEvents || []).includes(event.key)}
                    disabled={readOnly}
                    onChange={(checked) => toggleWebhookEvent(event.key, checked)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-950">Automation Rules</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {AUTOMATION_RULES.map(([field, label]) => (
                <ToggleField
                  key={field}
                  label={label}
                  checked={config.git.automationRules?.[field]}
                  disabled={readOnly}
                  onChange={(checked) => updateGitAutomationRule(field, checked)}
                />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Module Mapping</h3>
                <p className="text-xs text-slate-500">
                  Map project modules to repository folders for changed-module detection and QA recommendations.
                </p>
              </div>
              <Button type="button" className="h-9 rounded-xl" disabled={readOnly} onClick={addModuleMapping}>
                <Plus className="h-4 w-4" />
                Add Mapping
              </Button>
            </div>
            <div className="space-y-3">
              {(config.git.moduleMappings || []).length ? (
                config.git.moduleMappings.map((mapping, index) => (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={`${mapping.module}-${index}`}>
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_44px]">
                      <Input
                        className={fieldClassName}
                        disabled={readOnly}
                        list="git-module-mapping-options"
                        placeholder="Module, e.g. Login"
                        value={mapping.module || ""}
                        onChange={(event) => updateModuleMapping(index, { module: event.target.value })}
                      />
                      <Textarea
                        className={textareaClassName}
                        disabled={readOnly}
                        placeholder="Repository folder paths, one per line"
                        value={(mapping.paths || []).join("\n")}
                        onChange={(event) => updateModuleMapping(index, { paths: updateListFromText(event.target.value) })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-10 rounded-xl px-0 text-rose-600"
                        disabled={readOnly}
                        title="Delete mapping"
                        onClick={() => removeModuleMapping(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No module mappings configured.
                </div>
              )}
            </div>
            <datalist id="git-module-mapping-options">
              {(config.deliveryModules || []).map((module, index) => (
                <option key={`${module.name}-${index}`} value={module.name} />
              ))}
            </datalist>
          </section>
        </>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Modules & QA Configuration</h3>
            <p className="text-xs text-slate-500">Define modules, repository paths, suites, and reusable test cases.</p>
          </div>
          <Button type="button" className="h-9 rounded-xl" disabled={readOnly} onClick={addModule}>
            <Plus className="h-4 w-4" />
            Add Module
          </Button>
        </div>

        <div className="space-y-3">
          {config.deliveryModules.map((module, index) => (
            <div key={`${module.name}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.1fr)_44px]">
                <Input className={fieldClassName} placeholder="Module name" value={module.name} disabled={readOnly} onChange={(event) => updateModule(index, { name: event.target.value })} />
                <Input className={fieldClassName} placeholder="Module description" value={module.description} disabled={readOnly} onChange={(event) => updateModule(index, { description: event.target.value })} />
                <Button type="button" variant="outline" className="h-10 w-10 rounded-xl px-0 text-rose-600" disabled={readOnly || config.deliveryModules.length === 1} title="Delete module" onClick={() => removeModule(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <Textarea className={textareaClassName} placeholder="Repository paths, one per line" value={(module.sourcePaths || []).join("\n")} disabled={readOnly} onChange={(event) => updateModule(index, { sourcePaths: updateListFromText(event.target.value) })} />
                <Textarea className={textareaClassName} placeholder="Default suites, one per line" value={(module.defaultTestSuites || []).join("\n")} disabled={readOnly} onChange={(event) => updateModule(index, { defaultTestSuites: updateListFromText(event.target.value) })} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Default Test Suites</span>
            <Textarea className={textareaClassName} value={(config.defaultTestSuites || []).join("\n")} disabled={readOnly} onChange={(event) => update({ defaultTestSuites: updateListFromText(event.target.value) })} />
          </label>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reusable Test Cases</span>
              <Button type="button" variant="outline" className="h-8 rounded-lg" disabled={readOnly} onClick={addTestCase}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {config.testCases.length ? (
                config.testCases.map((testCase, index) => (
                  <div key={index} className="grid gap-2 md:grid-cols-[150px_minmax(0,1fr)_44px]">
                    <Input className={fieldClassName} placeholder="Module" value={testCase.module || ""} disabled={readOnly} onChange={(event) => updateTestCase(index, { module: event.target.value })} />
                    <Input className={fieldClassName} placeholder="Test case title" value={testCase.title || ""} disabled={readOnly} onChange={(event) => updateTestCase(index, { title: event.target.value })} />
                    <Button type="button" variant="outline" className="h-10 w-10 rounded-xl px-0 text-rose-600" disabled={readOnly} title="Delete test case" onClick={() => removeTestCase(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  No reusable test cases configured.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ProjectDeliveryConfiguration;
