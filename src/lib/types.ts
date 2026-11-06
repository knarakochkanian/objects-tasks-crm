export type Role = 'manager' | 'executor';
export type TaskStatus = 'new' | 'in_progress' | 'in_review' | 'accepted' | 'rework';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
}
export interface Project {
  id: string;
  name: string;
  address: string;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}
export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  assignee_id: string;
  status: TaskStatus;
  author_id: string;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}
export interface HistoryEntry {
  id: string;
  task_id: string;
  actor_id: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  comment: string | null;
  created_at: string;
}
export interface ProjectInput {
  name: string;
  address: string;
}
export interface TaskInput {
  project_id: string;
  title: string;
  description: string;
  assignee_id: string;
}
