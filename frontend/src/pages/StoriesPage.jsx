import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { BookOpen, Plus, Search } from "lucide-react";
import { createIssue, fetchProjects, fetchStories, uploadIssueAttachment } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_PANEL_ROLES } from "@/lib/roles";
import StoryCard from "@/components/stories/StoryCard";
import StoryDetails from "@/components/stories/StoryDetails";
import IssueCreateDialog from "@/components/issues/IssueCreateDialog";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const StoriesPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { storyId = "" } = useParams();
  const { role } = useAuth();
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const canCreateStory = ADMIN_PANEL_ROLES.includes(role);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });
  const {
    data: stories = [],
    isLoading: storiesLoading,
    error,
  } = useQuery({
    queryKey: ["stories", projectId],
    queryFn: () => fetchStories({ projectId }),
  });

  const filteredStories = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return stories;
    return stories.filter((story) =>
      [story.displayBugId, story.issueKey, story.title, story.projectId?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [search, stories]);
  const selectedStory = useMemo(
    () =>
      stories.find(
        (story) =>
          String(story._id) === String(storyId) ||
          String(story.displayBugId || story.issueKey || "").toLowerCase() ===
            String(storyId).toLowerCase()
      ) || null,
    [stories, storyId]
  );

  const createMutation = useMutation({
    mutationFn: createIssue,
    onSuccess: async (story) => {
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["stories"] });
      await queryClient.invalidateQueries({ queryKey: ["backlog"] });
      navigate(`/stories/${story._id}`);
    },
  });

  if (error) {
    return (
      <div className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error.response?.data?.message || "Unable to load Stories."}
      </div>
    );
  }

  if (storyId && !storiesLoading && selectedStory) {
    return (
      <StoryDetails
        story={selectedStory}
        projects={projects}
        stories={stories}
        onBack={() => navigate("/stories")}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ["stories"] })}
      />
    );
  }

  if (storyId && !storiesLoading && !selectedStory) {
    return (
      <EmptyState
        title="Story not found"
        description="This Story may have been removed or is outside your accessible projects."
        action={<Button onClick={() => navigate("/stories")}>Back to Stories</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">Stories</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track delivery outcomes, then open a Story to work with its Tasks and Bugs.
          </p>
        </div>
        {canCreateStory ? (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Story
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Stories"
            className="pl-9"
          />
        </label>
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="field-select"
        >
          <option value="all">All projects</option>
          {projects.map((project) => (
            <option key={project._id} value={project._id}>{project.name}</option>
          ))}
        </select>
      </div>

      {projectsLoading || storiesLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-[290px] rounded-lg" />
          ))}
        </div>
      ) : filteredStories.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredStories.map((story) => (
            <StoryCard
              key={story._id}
              story={story}
              onClick={(item) => navigate(`/stories/${item._id}`)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title={search ? "No Stories match this search" : "No Stories yet"}
          description={
            canCreateStory
              ? "Create a Story here, then plan it into a Sprint from Backlog."
              : "Stories in your accessible projects will appear here."
          }
        />
      )}

      <IssueCreateDialog
        open={canCreateStory && isCreateOpen}
        onOpenChange={setIsCreateOpen}
        projects={projects}
        availableIssues={stories}
        defaultProjectId={projectId === "all" ? "" : projectId}
        defaultType="Story"
        allowedTypes={["Story"]}
        lockType
        isPending={createMutation.isPending}
        onSubmit={(payload) => createMutation.mutateAsync(payload)}
        onUploadAttachment={uploadIssueAttachment}
      />
    </div>
  );
};

export default StoriesPage;
