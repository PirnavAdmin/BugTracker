export const normalizeProjectSearch = (searchTerm) =>
  String(searchTerm || "").trim().toLowerCase();

export const matchesProjectName = (project, normalizedSearch) =>
  !normalizedSearch ||
  String(project?.name || "").toLowerCase().includes(normalizedSearch);
