import {
  formatDate,
  formatRelativeDateLabel,
  formatTime,
  toDateTimeInputValue,
} from "@/lib/utils";

export const TEAMS_MEETING_URL_PREFIX = "https://teams.microsoft.com/l/meetup-join/";

const toDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isValidTeamsMeetingUrl = (value = "") =>
  String(value || "").trim().startsWith(TEAMS_MEETING_URL_PREFIX);

export const getMeetingEndTime = (meeting) => {
  const start = toDate(meeting?.startTime);
  const duration = Number(meeting?.durationMinutes || 0);

  if (!start || !duration) {
    return start;
  }

  return new Date(start.getTime() + duration * 60 * 1000);
};

export const getMeetingStatus = (meeting, now = new Date()) => {
  const start = toDate(meeting?.startTime);
  const end = getMeetingEndTime(meeting);

  if (!start) {
    return "upcoming";
  }

  if (end && now >= start && now <= end) {
    return "live";
  }

  if (now > (end || start)) {
    return "completed";
  }

  return "upcoming";
};

export const getMeetingStatusLabel = (meeting, now = new Date()) => {
  const status = getMeetingStatus(meeting, now);

  if (status === "live") {
    return "Live";
  }

  if (status === "completed") {
    return "Completed";
  }

  return "Upcoming";
};

export const getMeetingDayTimeLabel = (meeting) => {
  const start = toDate(meeting?.startTime);

  if (!start) {
    return "No time selected";
  }

  return `${formatRelativeDateLabel(start)} • ${formatTime(start)}`;
};

export const getMeetingDateLine = (meeting) => {
  const start = toDate(meeting?.startTime);

  if (!start) {
    return "Schedule pending";
  }

  return `${formatDate(start)} • ${formatTime(start)}`;
};

export const buildMeetingDraft = (conversation) => ({
  title:
    conversation?.type === "direct"
      ? `Meeting with ${
          (conversation?.participants || []).find(
            (participant) => String(participant?._id || participant?.id || participant || "") !== ""
          )?.name || "teammate"
        }`
      : `${conversation?.name || conversation?.projectId?.name || conversation?.teamId?.name || "Team"} sync`,
  meetingUrl: "",
  description: "",
  startDateTime: "",
  durationMinutes: "",
});

export const toMeetingPayload = (draft) => ({
  title: String(draft?.title || "").trim(),
  meetingUrl: String(draft?.meetingUrl || "").trim(),
  description: String(draft?.description || "").trim(),
  startDateTime: draft?.startDateTime || "",
  durationMinutes: draft?.durationMinutes === "" ? "" : Number(draft?.durationMinutes || 0),
});

export const meetingToDraft = (meeting) => ({
  title: meeting?.title || "",
  meetingUrl: meeting?.meetingUrl || "",
  description: meeting?.description || "",
  startDateTime: meeting?.startTime ? toDateTimeInputValue(meeting.startTime) : "",
  durationMinutes:
    meeting?.durationMinutes || meeting?.durationMinutes === 0
      ? String(meeting.durationMinutes)
      : "",
});

export const canCreateMeeting = (role = "") => ["Admin", "Manager"].includes(role);

export const canManageMeeting = (meeting, user) =>
  user?.role === "Admin" ||
  (user?.role === "Manager" &&
    String(meeting?.scheduledBy?._id || meeting?.scheduledBy || "") ===
      String(user?._id || user?.id || ""));

export const filterMeetingsByPreset = (meetings = [], preset = "upcoming", now = new Date()) => {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return meetings.filter((meeting) => {
    const start = toDate(meeting?.startTime);
    const status = getMeetingStatus(meeting, now);

    if (preset === "completed") {
      return status === "completed";
    }

    if (preset === "today") {
      return start && start >= startOfToday && start < endOfToday;
    }

    if (preset === "week") {
      return start && start >= startOfToday && start < endOfWeek;
    }

    return status !== "completed";
  });
};
