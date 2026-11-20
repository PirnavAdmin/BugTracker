import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bug,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  FolderKanban,
  Layers,
  ListTodo,
  UserCheck,
  UserRound,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getIssuePriorityVariant,
  getIssueStatusLabel,
  getIssueStatusVariant,
  resolveIssueAssignee,
} from "@/lib/issues";
import { cn, formatDate, getInitials } from "@/lib/utils";

const MyWorkScreen = ({
  user,
  project,
  boardState = { backlogIssues: [], sprintSections: [] },
  activeSprintSection,
  onSelectIssue,
  onSwitchToPlanning,
}) => {
  const [activeTab, setActiveTab] = useState("active");

  const userIdStr = String(user?._id || "");

  // Collect all issues across backlog and all sprint sections
  const {
    activeSprintIssues,
    upcomingSprintIssues,
    backlogIssues,
    completedIssues,
    myTotalPoints,
    myTotalStories,
    myCompletedStories,
  } = useMemo(() => {
    const isAssignedToMe = (story) => {
      const assignee = resolveIssueAssignee(story);
      return assignee?._id && String(assignee._id) === userIdStr;
    };

    const isDone = (story) =>
      ["DONE", "CLOSED", "RESOLVED"].includes(String(story?.status || "").toUpperCase());

    // 1. Active Sprint issues assigned to me
    const activeSectionIssues = activeSprintSection?.issues || [];
    const activeMine = activeSectionIssues.filter(isAssignedToMe);

    // 2. Upcoming Sprints issues assigned to me
    const upcomingMine = [];
    (boardState.sprintSections || []).forEach((sec) => {
      const sprintState = sec.sprint?.state;
      if (sprintState === "PLANNED") {
        (sec.issues || []).forEach((iss) => {
          if (isAssignedToMe(iss)) {
            upcomingMine.push({ ...iss, sprintName: sec.sprint.name });
          }
        });
      }
    });

    // 3. Backlog issues assigned to me
    const backlogMine = (boardState.backlogIssues || []).filter(isAssignedToMe);

    // 4. All completed stories assigned to me
    const allMine = [
      ...activeMine,
      ...upcomingMine,
      ...backlogMine,
    ];

    const completedMine = allMine.filter(isDone);

    let totPoints = 0;
    allMine.forEach((s) => {
      totPoints += Number(s.storyPoints || 0);
    });

    return {
      activeSprintIssues: activeMine,
      upcomingSprintIssues: upcomingMine,
      backlogIssues: backlogMine,
      completedIssues: completedMine,
      myTotalPoints: totPoints,
      myTotalStories: allMine.length,
      myCompletedStories: completedMine.length,
    };
  }, [boardState, activeSprintSection, userIdStr]);

  // Tab filtering
  const displayStories = useMemo(() => {
    if (activeTab === "active") return activeSprintIssues;
    if (activeTab === "upcoming") return upcomingSprintIssues;
    if (activeTab === "backlog") return backlogIssues;
    if (activeTab === "completed") return completedIssues;
    return [
      ...activeSprintIssues,
      ...upcomingSprintIssues,
      ...backlogIssues,
    ];
  }, [activeTab, activeSprintIssues, upcomingSprintIssues, backlogIssues, completedIssues]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <section className="rounded-[24px] border border-blue-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,246,255,0.85))] p-6 shadow-[0_24px_54px_-30px_rgba(37,99,235,0.3)] backdrop-blur-xl dark:border-blue-900/60 dark:bg-slate-900/90 dark:bg-none dark:shadow-black/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-white shadow-md dark:border-slate-700">
              <AvatarImage src={user?.avatarUrl} alt={user?.name} />
              <AvatarFallback className="text-lg font-bold text-blue-700 dark:bg-slate-800 dark:text-blue-300">
                {getInitials(user?.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <Badge className="h-6 border-blue-300 bg-blue-100/80 px-2.5 text-xs font-semibold text-blue-800 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300">
                  <UserRound className="mr-1.5 h-3.5 w-3.5" />
                  My Personal Workspace
                </Badge>
                {project?.name ? (
                  <Badge className="h-6 border-slate-200 bg-white/80 px-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                    {project.name}
                  </Badge>
                ) : null}
              </div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-100">
                {user?.name || "My Work"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
                {user?.designation || user?.email || "Team Member"} — Track all stories and tasks assigned to you.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-[10px] border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 self-start sm:self-center dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={onSwitchToPlanning}
          >
            Planning Board
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {/* My KPIs */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-blue-100 pt-4 sm:grid-cols-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">In Active Sprint</p>
            <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-400">
              {activeSprintIssues.length}{" "}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Stories</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">In Upcoming Sprints</p>
            <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-100">
              {upcomingSprintIssues.length}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">In Backlog</p>
            <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-100">
              {backlogIssues.length}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">My Total Points</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {myTotalPoints} pts
            </p>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: "active", label: `Active Sprint (${activeSprintIssues.length})` },
          { id: "upcoming", label: `Upcoming Sprints (${upcomingSprintIssues.length})` },
          { id: "backlog", label: `Product Backlog (${backlogIssues.length})` },
          { id: "completed", label: `Completed (${completedIssues.length})` },
          { id: "all", label: `All My Work (${myTotalStories})` },
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition",
              activeTab === id
                ? "bg-blue-600 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            )}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stories List */}
      <Card className="overflow-hidden rounded-[20px] border-white/70 bg-white/90 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.4)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/40">
        <CardContent className="p-0">
          {displayStories.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayStories.map((story) => {
                const priorityVariant = getIssuePriorityVariant(story.priority);
                const statusVariant = getIssueStatusVariant(story.status);
                const progress = story.storyProgress || {};
                const isDone = ["DONE", "CLOSED", "RESOLVED"].includes(
                  String(story.status || "").toUpperCase()
                );

                return (
                  <div
                    key={story._id}
                    onClick={() => onSelectIssue?.(story)}
                    className="group flex cursor-pointer flex-col gap-3 p-4 transition hover:bg-blue-50/50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-slate-800/50"
                  >
                    <div className="flex min-w-0 items-start gap-3 sm:items-center">
                      <span className="rounded-[6px] bg-blue-100/70 px-2 py-1 font-mono text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                        {story.key || "STORY"}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className={cn(
                              "truncate text-sm font-semibold text-slate-900 group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400",
                              isDone && "text-slate-500 line-through dark:text-slate-500"
                            )}
                          >
                            {story.title}
                          </p>
                          {story.epicId?.name ? (
                            <Badge className="h-5 border-violet-200 bg-violet-50 px-2 text-[10px] text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/50 dark:text-violet-300">
                              {story.epicId.name}
                            </Badge>
                          ) : null}
                          {story.sprintName ? (
                            <Badge className="h-5 border-blue-200 bg-blue-50 px-2 text-[10px] text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300">
                              {story.sprintName}
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          {story.storyPoints ? (
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {story.storyPoints} pts
                            </span>
                          ) : null}
                          <span>
                            Tasks: {progress.completedTaskCount || 0}/{progress.taskCount || 0}
                          </span>
                          {progress.bugCount ? (
                            <span
                              className={cn(
                                progress.openBlockingBugCount
                                  ? "font-semibold text-rose-600 dark:text-rose-400"
                                  : "text-slate-600 dark:text-slate-400"
                              )}
                            >
                              Bugs: {progress.resolvedBugCount || 0}/{progress.bugCount || 0}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 self-end sm:self-center">
                      <Badge variant={priorityVariant} className="h-6 px-2 text-[11px] capitalize">
                        {story.priority || "Medium"}
                      </Badge>

                      <Badge variant={statusVariant} className="h-6 px-2 text-[11px] font-semibold">
                        {getIssueStatusLabel(story.status)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No stories found in this section assigned to you.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyWorkScreen;
