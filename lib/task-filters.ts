import type { Task } from "./assessment";

export type TaskStatus =
  | "todo"
  | "doing"
  | "closed"
  | "done"
  | "late"
  | "unfinished"
  | "overdue"
  | "stale"
  | "missing";

export function statusGroup(task: Task): TaskStatus | "other" {
  const status = task.status.replace(/^[\s*]+/, "").trim().toLowerCase();
  if (/^to[\s_-]*do$/.test(status)) return "todo";
  if (/^doing\b/.test(status)) return "doing";
  if (status === "done") return "done";
  if (/^closed?$/.test(status)) return "closed";
  return "other";
}

export function filterTasksByStatus(tasks: Task[], status: TaskStatus | null, end = ""): Task[] {
  return tasks.filter(task => {
    if (status === "late") return !!task.due && (task.done ? !!task.completed && task.completed > task.due : task.due < end);
    if (status === "unfinished") return !task.done;
    if (status === "overdue") return !task.done && !!task.due && task.due < end;
    if (status === "stale") return !task.done && (Date.parse(end) - Date.parse(task.updated)) / 86400000 > 7;
    if (status === "missing") return task.done && !task.completed;
    return status === null || statusGroup(task) === status;
  })
    .sort((a, b) => b.created.localeCompare(a.created) || b.id - a.id);
}
