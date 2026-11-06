import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { api } from './api';

export function useProjects() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['crm', session?.user.id, 'projects'],
    queryFn: ({ signal }) => api.projects(signal),
    enabled: !!session,
  });
}
export function useProject(id: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['crm', session?.user.id, 'project', id],
    queryFn: ({ signal }) => api.project(id, signal),
    enabled: !!session && !!id,
  });
}
export function useTasks() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['crm', session?.user.id, 'tasks'],
    queryFn: ({ signal }) => api.tasks(signal),
    enabled: !!session,
  });
}
export function useTask(id: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['crm', session?.user.id, 'task', id],
    queryFn: ({ signal }) => api.task(id, signal),
    enabled: !!session && !!id,
  });
}
export function useProfiles() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['crm', session?.user.id, 'profiles'],
    queryFn: ({ signal }) => api.profiles(signal),
    enabled: !!session,
  });
}
export function useHistory(id: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['crm', session?.user.id, 'history', id],
    queryFn: ({ signal }) => api.history(id, signal),
    enabled: !!session && !!id,
  });
}
export function useCrmMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => cache.invalidateQueries({ queryKey: ['crm'] }),
  });
}
