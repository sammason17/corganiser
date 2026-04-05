import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import toast from 'react-hot-toast'

export function useTasks(filters = {}) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      const { data } = await api.get('/tasks', { params: filters })
      return data
    },
  })
}

export function useTask(id) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const { data } = await api.get(`/tasks/${id}`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/tasks', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task created')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create task'),
  })
}

export function useUpdateTask(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.put(`/tasks/${id}`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task updated')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update task'),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task deleted')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete task'),
  })
}

export function useTaskUpdates(taskId) {
  return useQuery({
    queryKey: ['tasks', taskId, 'updates'],
    queryFn: async () => {
      const { data } = await api.get(`/tasks/${taskId}/updates`)
      return data
    },
    enabled: !!taskId,
  })
}

export function useAddTaskUpdate(taskId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content) => api.post(`/tasks/${taskId}/updates`, { content }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', taskId, 'updates'] })
      qc.invalidateQueries({ queryKey: ['tasks', taskId] })
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to add update'),
  })
}

export function useTimeLogs(taskId) {
  return useQuery({
    queryKey: ['tasks', taskId, 'time-logs'],
    queryFn: async () => {
      const { data } = await api.get(`/tasks/${taskId}/time-logs`)
      return data
    },
    enabled: !!taskId,
  })
}

export function useAddTimeLog(taskId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post(`/tasks/${taskId}/time-logs`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', taskId, 'time-logs'] })
      toast.success('Time logged')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to log time'),
  })
}
