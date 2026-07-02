import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bug,
  Download,
  FileUp,
  ListTodo,
  MessageSquare,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createComment,
  createIssue,
  deleteIssue,
  downloadAttachment,
  fetchComments,
  fetchIssueAttachments,
  fetchIssueHistory,
  updateIssue,
  uploadIssueAttachment,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  ADMIN_PANEL_ROLES,
  ROLE_DEVELOPER,
  ROLE_TEAM_LEAD,
  ROLE_TESTER,
} from "@/lib/roles";
import {
  getIssueDisplayKey,
  getIssuePriorityVariant,
  getIssueStatusLabel,
} from "@/lib/issues";
import { formatDateTime, getInitials } from "@/lib/utils";
import IssueCreateDialog from "@/components/issues/IssueCreateDialog";
import IssueDetailsDialog from "@/components/issues/IssueDetailsDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const TABS = ["Overview", "Tasks", "Bugs", "Comments", "Attachments", "Activity"];
const taskTypes = new Set(["Task", "Sub-task"]);

const EmptyPanel = ({ children }) => (
  <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
    {children}
  </div>
);

const WorkItemList = ({ items, onSelect }) =>
  items.length ? (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {items.map((item) => (
        <button
          key={item._id}
          type="button"
          onClick={() => onSelect(item)}
          className="grid w-full gap-2 bg-white px-1 py-3 text-left transition hover:bg-slate-50 sm:grid-cols-[110px_minmax(0,1fr)_140px_100px] sm:items-center"
        >
          <span className="text-xs font-semibold text-slate-500">{getIssueDisplayKey(item)}</span>
          <span className="truncate text-sm font-medium text-slate-900">{item.title}</span>
          <span className="text-xs text-slate-600">{getIssueStatusLabel(item.status)}</span>
          <Badge className="w-fit" variant={getIssuePriorityVariant(item.priority)}>
            {item.priority}
          </Badge>
        </button>
      ))}
    </div>
  ) : (
    <EmptyPanel>No linked work items yet.</EmptyPanel>
  );

const StoryDetails = ({ story, projects, stories, onBack, onChanged }) => {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState("Overview");
  const [createType, setCreateType] = useState("");
  const [selectedChild, setSelectedChild] = useState(null);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState(null);
  const children = Array.isArray(story.children) ? story.children : [];
  const tasks = useMemo(() => children.filter((item) => taskTypes.has(item.type)), [children]);
  const bugs = useMemo(() => children.filter((item) => item.type === "Bug"), [children]);
  const progress = story.storyProgress || {};
  const canCreateTask =
    ADMIN_PANEL_ROLES.includes(role) || [ROLE_DEVELOPER, ROLE_TEAM_LEAD].includes(role);
  const canCreateBug = ADMIN_PANEL_ROLES.includes(role) || role === ROLE_TESTER;
  const canDeleteStory = ADMIN_PANEL_ROLES.includes(role);

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ["comments", story._id, "story"],
    queryFn: () => fetchComments(story._id),
    enabled: activeTab === "Comments",
  });
  const { data: attachments = [], isLoading: attachmentsLoading } = useQuery({
    queryKey: ["issue", story._id, "attachments"],
    queryFn: () => fetchIssueAttachments(story._id),
    enabled: activeTab === "Attachments",
  });
  const { data: activity = [], isLoading: activityLoading } = useQuery({
    queryKey: ["issue", story._id, "history"],
    queryFn: () => fetchIssueHistory(story._id),
    enabled: activeTab === "Activity",
  });

  const createMutation = useMutation({
    mutationFn: createIssue,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stories"] });
      await queryClient.invalidateQueries({ queryKey: ["issues"] });
      setCreateType("");
      onChanged();
    },
  });
  const updateMutation = useMutation({
    mutationFn: updateIssue,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stories"] });
      await queryClient.invalidateQueries({ queryKey: ["issues"] });
      onChanged();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteIssue,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stories"] });
      await queryClient.invalidateQueries({ queryKey: ["issues"] });
      await queryClient.invalidateQueries({ queryKey: ["backlog"] });
      onChanged();
      onBack();
    },
  });
  const commentMutation = useMutation({
    mutationFn: createComment,
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["comments", story._id, "story"] });
    },
  });
  const attachmentMutation = useMutation({
    mutationFn: uploadIssueAttachment,
    onSuccess: () => {
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["issue", story._id, "attachments"] });
    },
  });

  const createActions = (
    <div className="flex flex-wrap gap-2">
      {canCreateTask ? (
        <Button type="button" size="sm" onClick={() => setCreateType("Task")}>
          <Plus className="h-4 w-4" />
          Task
        </Button>
      ) : null}
      {canCreateBug ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setCreateType("Bug")}>
          <Bug className="h-4 w-4" />
          Bug
        </Button>
      ) : null}
      {canDeleteStory ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
          disabled={deleteMutation.isPending}
          onClick={() => {
            if (window.confirm("Delete this Story? This will remove it from active Story lists.")) {
              deleteMutation.mutate(story._id);
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
          {deleteMutation.isPending ? "Deleting..." : "Delete Story"}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex min-w-0 items-start gap-3">
          <Button type="button" variant="outline" size="icon" onClick={onBack} aria-label="Back to Stories">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-700">{getIssueDisplayKey(story)}</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-950 sm:text-2xl">{story.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {story.projectId?.name || "Unknown project"} / {story.epicId?.name || "No epic"}
            </p>
          </div>
        </div>
        {createActions}
      </div>

      <div className="overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {tab}
              {tab === "Tasks" ? ` (${tasks.length})` : ""}
              {tab === "Bugs" ? ` (${bugs.length})` : ""}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Overview" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Description</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {story.description || "No description has been added."}
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Acceptance Criteria</h2>
              <div className="mt-3 space-y-2">
                {story.acceptanceCriteria?.length ? story.acceptanceCriteria.map((criterion, index) => (
                  <div key={criterion._id || index} className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={Boolean(criterion.completed)} readOnly className="mt-0.5 h-4 w-4" />
                    <span>{criterion.text}</span>
                  </div>
                )) : <p className="text-sm text-slate-500">No acceptance criteria yet.</p>}
              </div>
            </div>
          </section>
          <aside className="space-y-4 border-l border-slate-200 pl-0 xl:pl-5">
            {[
              ["Status", getIssueStatusLabel(story.status)],
              ["Priority", story.priority || "Medium"],
              ["Sprint", story.sprintId?.name || "Backlog"],
              ["Story Points", story.storyPoints ?? 0],
              ["Assignee", story.assignee?.name || "Unassigned"],
              ["Progress", `${progress.percent || 0}%`],
              ["Tasks", progress.taskCount || 0],
              ["Open Bugs", story.openBugCount || 0],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="text-right font-medium text-slate-900">{value}</span>
              </div>
            ))}
          </aside>
        </div>
      ) : null}

      {activeTab === "Tasks" ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950"><ListTodo className="h-4 w-4" />Tasks</h2>
            {canCreateTask ? <Button size="sm" onClick={() => setCreateType("Task")}><Plus className="h-4 w-4" />Task</Button> : null}
          </div>
          <WorkItemList items={tasks} onSelect={setSelectedChild} />
        </section>
      ) : null}

      {activeTab === "Bugs" ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Bug className="h-4 w-4" />Bugs</h2>
            {canCreateBug ? <Button size="sm" onClick={() => setCreateType("Bug")}><Plus className="h-4 w-4" />Bug</Button> : null}
          </div>
          <WorkItemList items={bugs} onSelect={setSelectedChild} />
        </section>
      ) : null}

      {activeTab === "Comments" ? (
        <section className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (comment.trim()) commentMutation.mutate({ issueId: story._id, text: comment.trim() });
            }}
          >
            <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" className="min-h-20" />
            <Button type="submit" size="icon" disabled={!comment.trim() || commentMutation.isPending} aria-label="Add comment"><MessageSquare className="h-4 w-4" /></Button>
          </form>
          {commentsLoading ? <p className="text-sm text-slate-500">Loading comments...</p> : comments.length ? comments.map((item) => (
            <div key={item._id} className="flex gap-3 border-b border-slate-200 pb-4">
              <Avatar className="h-8 w-8"><AvatarFallback>{getInitials(item.userId?.name)}</AvatarFallback></Avatar>
              <div className="min-w-0"><p className="text-sm font-medium text-slate-900">{item.userId?.name || "Unknown user"}</p><p className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.comment || item.text}</p></div>
            </div>
          )) : <EmptyPanel>No comments yet.</EmptyPanel>}
        </section>
      ) : null}

      {activeTab === "Attachments" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="file" className="max-w-sm" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <Button disabled={!file || attachmentMutation.isPending} onClick={() => attachmentMutation.mutate({ issueId: story._id, file })}><FileUp className="h-4 w-4" />Upload</Button>
          </div>
          {attachmentsLoading ? <p className="text-sm text-slate-500">Loading attachments...</p> : attachments.length ? attachments.map((item) => (
            <div key={item._id} className="flex items-center justify-between gap-3 border-b border-slate-200 py-3">
              <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700"><Paperclip className="h-4 w-4 shrink-0" /><span className="truncate">{item.fileName}</span></span>
              <Button variant="ghost" size="icon" onClick={() => downloadAttachment(item, story._id)} aria-label={`Download ${item.fileName}`}><Download className="h-4 w-4" /></Button>
            </div>
          )) : <EmptyPanel>No attachments yet.</EmptyPanel>}
        </section>
      ) : null}

      {activeTab === "Activity" ? (
        <section className="space-y-3">
          {activityLoading ? <p className="text-sm text-slate-500">Loading activity...</p> : activity.length ? activity.map((item) => (
            <div key={item._id} className="border-b border-slate-200 pb-3 text-sm"><p className="font-medium text-slate-900">{item.actorId?.name || "Unknown user"} <span className="font-normal text-slate-600">{String(item.eventType || "updated").replace(/_/g, " ").toLowerCase()}</span></p><p className="mt-1 text-xs text-slate-500">{formatDateTime(item.createdAt)}</p></div>
          )) : <EmptyPanel>No activity yet.</EmptyPanel>}
        </section>
      ) : null}

      <IssueCreateDialog
        open={Boolean(createType)}
        onOpenChange={(open) => !open && setCreateType("")}
        projects={projects}
        availableIssues={stories}
        defaultProjectId={story.projectId?._id || story.projectId}
        defaultTeamId={story.teamId?._id || story.teamId}
        defaultParentStoryId={story._id}
        defaultType={createType || "Task"}
        allowedTypes={[createType || "Task"]}
        lockType
        isPending={createMutation.isPending}
        onSubmit={(payload) => createMutation.mutateAsync({ ...payload, parentStoryId: story._id })}
        onUploadAttachment={uploadIssueAttachment}
      />

      <IssueDetailsDialog
        issue={selectedChild}
        open={Boolean(selectedChild)}
        onOpenChange={(open) => !open && setSelectedChild(null)}
        projects={projects}
        availableIssues={children}
        onUpdateIssue={(id, payload) => updateMutation.mutateAsync({ id, payload })}
        onDeleteIssue={async () => {}}
        updatingId={updateMutation.isPending ? updateMutation.variables?.id : ""}
        deletingId=""
        canEditPriority={ADMIN_PANEL_ROLES.includes(role)}
        canEditAssignee={ADMIN_PANEL_ROLES.includes(role)}
        canDeleteIssue={false}
      />
    </div>
  );
};

export default StoryDetails;
