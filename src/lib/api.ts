import { client } from './supabase';
import { collectPages } from './pagination';
import type {
  HistoryEntry,
  Profile,
  Project,
  ProjectInput,
  Task,
  TaskInput,
  TaskStatus,
} from './types';

function unwrap<T>(result: { data: unknown; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}
export const api = {
  async profiles(signal?: AbortSignal) {
    return collectPages(async (from, to) => {
      let query = client()
        .from('profiles')
        .select('id, full_name, role')
        .order('full_name')
        .order('id')
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      return unwrap<Profile[]>(await query);
    }, signal);
  },
  async profile(id: string, signal?: AbortSignal) {
    let query = client().from('profiles').select('id, full_name, role').eq('id', id);
    if (signal) query = query.abortSignal(signal);
    return unwrap<Profile | null>(await query.maybeSingle());
  },
  async projects(signal?: AbortSignal) {
    return collectPages(async (from, to) => {
      let query = client()
        .from('projects')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      return unwrap<Project[]>(await query);
    }, signal);
  },
  async project(id: string, signal?: AbortSignal) {
    let query = client().from('projects').select('*').eq('id', id).is('deleted_at', null);
    if (signal) query = query.abortSignal(signal);
    return unwrap<Project | null>(await query.maybeSingle());
  },
  async tasks(signal?: AbortSignal) {
    return collectPages(async (from, to) => {
      let query = client()
        .from('tasks')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      return unwrap<Task[]>(await query);
    }, signal);
  },
  async task(id: string, signal?: AbortSignal) {
    let query = client().from('tasks').select('*').eq('id', id).is('deleted_at', null);
    if (signal) query = query.abortSignal(signal);
    return unwrap<Task | null>(await query.maybeSingle());
  },
  async history(id: string, signal?: AbortSignal) {
    return collectPages(async (from, to) => {
      let query = client()
        .from('task_history')
        .select('*')
        .eq('task_id', id)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      return unwrap<HistoryEntry[]>(await query);
    }, signal);
  },
  async saveProject(input: ProjectInput, project?: Project) {
    const args = { p_name: input.name.trim(), p_address: input.address.trim() };
    return unwrap<Project>(
      await client().rpc(
        project ? 'update_project' : 'create_project',
        project ? { ...args, p_id: project.id, p_expected_version: project.version } : args,
      ),
    );
  },
  async deleteProject(project: Project) {
    unwrap(
      await client().rpc('delete_project', {
        p_id: project.id,
        p_expected_version: project.version,
      }),
    );
  },
  async saveTask(input: TaskInput, task?: Task) {
    const args = {
      p_project_id: input.project_id,
      p_title: input.title.trim(),
      p_description: input.description.trim(),
      p_assignee_id: input.assignee_id,
    };
    return unwrap<Task>(
      await client().rpc(
        task ? 'update_task' : 'create_task',
        task ? { ...args, p_id: task.id, p_expected_version: task.version } : args,
      ),
    );
  },
  async deleteTask(task: Task) {
    unwrap(await client().rpc('delete_task', { p_id: task.id, p_expected_version: task.version }));
  },
  async transition(task: Task, status: TaskStatus, comment: string) {
    return unwrap<Task>(
      await client().rpc('transition_task', {
        p_id: task.id,
        p_to_status: status,
        p_comment: comment.trim() || undefined,
        p_expected_version: task.version,
      }),
    );
  },
};
