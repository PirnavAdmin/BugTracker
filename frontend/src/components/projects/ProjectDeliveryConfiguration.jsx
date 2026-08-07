import { GitBranch, Plus, RefreshCcw, Trash2 } from "lucide-react";
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

export const createDeliveryConfiguration = () => ({
  repository: {
    enabled: true,
    provider: "GitHub",
    name: "",
    url: "",
    defaultBranch: "main",
    developmentBranch: "develop",
    qaBranch: "qa",
    releaseBranch: "release",
    webhookEnabled: true,
    webhookEndpoint: "/api/webhooks/github",
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
  const defaults = createDeliveryConfiguration();
  return {
    repository: {
      ...defaults.repository,
      ...(project.repository || {}),
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
  const normalized = String(provider || "GitHub").toLowerCase();
  if (normalized === "gitlab") return "/api/webhooks/gitlab";
  if (normalized === "bitbucket") return "/api/webhooks/bitbucket";
  return "/api/webhooks/github";
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

const ProjectDeliveryConfiguration = ({
  value,
  onChange,
  readOnly = false,
  mode = "settings",
}) => {
  const config = value || createDeliveryConfiguration();

  const update = (patch) => onChange?.({ ...config, ...patch });
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

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <GitBranch className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Git Configuration</h3>
              <p className="text-xs text-slate-500">
                {readOnly ? "Repository settings are read-only for this role." : "Manager-owned repository setup."}
              </p>
            </div>
          </div>
          <span className={chipClassName}>{mode === "create" ? "Required" : "Manager Only"}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Git Provider *</span>
            <select
              className={`${fieldClassName} w-full px-3`}
              value={config.repository.provider}
              disabled={readOnly}
              onChange={(event) => updateRepository("provider", event.target.value)}
            >
              {GIT_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repository Name *</span>
            <Input className={fieldClassName} value={config.repository.name} disabled={readOnly} onChange={(event) => updateRepository("name", event.target.value)} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repository URL *</span>
            <Input className={fieldClassName} value={config.repository.url} disabled={readOnly} placeholder="https://github.com/company/project" onChange={(event) => updateRepository("url", event.target.value)} />
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {[
            ["defaultBranch", "Default Branch *"],
            ["developmentBranch", "Development Branch"],
            ["qaBranch", "QA Branch"],
            ["releaseBranch", "Release Branch"],
          ].map(([field, label]) => (
            <label className="space-y-1.5" key={field}>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              <Input className={fieldClassName} value={config.repository[field] || ""} disabled={readOnly} onChange={(event) => updateRepository(field, event.target.value)} />
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <ToggleField label="Enable Git Integration" checked={config.repository.enabled} disabled={readOnly} onChange={(checked) => updateRepository("enabled", checked)} />
          <ToggleField label="Enable Webhooks" checked={config.repository.webhookEnabled} disabled={readOnly} onChange={(checked) => updateRepository("webhookEnabled", checked)} />
          <ToggleField label="Auto Detect Changed Modules" checked={config.deliveryWorkflow.autoModuleDetection} disabled={readOnly} onChange={(checked) => updateWorkflow("autoModuleDetection", checked)} />
          <ToggleField label="Auto Notify QA" checked={config.deliveryWorkflow.autoQaNotification} disabled={readOnly} onChange={(checked) => updateWorkflow("autoQaNotification", checked)} />
          <ToggleField label="Auto Link Commits to Tasks" checked={config.deliveryWorkflow.autoLinkCommitsToTasks} disabled={readOnly} onChange={(checked) => updateWorkflow("autoLinkCommitsToTasks", checked)} />
          <ToggleField label="Auto Link Commits to Bugs" checked={config.deliveryWorkflow.autoLinkCommitsToBugs} disabled={readOnly} onChange={(checked) => updateWorkflow("autoLinkCommitsToBugs", checked)} />
          <ToggleField label="Release Notes Generation" checked={config.deliveryWorkflow.releaseNotesGeneration} disabled={readOnly} onChange={(checked) => updateWorkflow("releaseNotesGeneration", checked)} />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Webhook Endpoint</span>
            <Input className={`${fieldClassName} bg-slate-50 text-slate-600`} value={config.repository.webhookEndpoint} readOnly />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Webhook Secret</span>
            <div className="flex gap-2">
              <Input className={`${fieldClassName} min-w-0`} value={config.repository.webhookSecret} disabled={readOnly} onChange={(event) => updateRepository("webhookSecret", event.target.value)} />
              <Button type="button" variant="outline" className="h-10 w-10 shrink-0 rounded-xl px-0" disabled={readOnly} title="Regenerate webhook secret" onClick={() => updateRepository("webhookSecret", `cc_${Math.random().toString(36).slice(2, 10)}`)}>
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[
            ["mainBranch", "Main Branch"],
            ["developmentBranch", "Development Branch"],
            ["featurePattern", "Feature Pattern"],
            ["hotfixPattern", "Hotfix Pattern"],
            ["releasePattern", "Release Pattern"],
          ].map(([field, label]) => (
            <label className="space-y-1.5" key={field}>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              <Input className={fieldClassName} value={config.repository.branchStrategy[field] || ""} disabled={readOnly} onChange={(event) => updateBranchStrategy(field, event.target.value)} />
            </label>
          ))}
        </div>
      </section>

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
