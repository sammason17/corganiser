import { useState, useEffect } from 'react'
import { useProjects } from '../hooks/useProjects'
import { useCategories } from '../hooks/useCategories'

const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE']
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH']

export default function TaskModal({ task, onClose, onSave, loading }) {
  const { data: projects = [] } = useProjects()
  const { data: categories = [] } = useCategories()

  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate: '',
    isShared: false,
    projectIds: [],
    categoryIds: [],
  })

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'TODO',
        priority: task.priority || 'MEDIUM',
        dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
        isShared: task.isShared || false,
        projectIds: task.projects?.map(p => p.id) || [],
        categoryIds: task.categories?.map(c => c.id) || [],
      })
    }
  }, [task])

  function toggleId(key, id) {
    setForm(f => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter(x => x !== id) : [...f[key], id],
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      dueDate: form.dueDate || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{task ? 'Edit task' : 'New task'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="label">Title *</label>
            <input
              className="input"
              placeholder="Task title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Optional description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select
                className="input"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Due date</label>
            <input
              type="date"
              className="input"
              value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
            />
          </div>

          {/* Projects */}
          {projects.length > 0 && (
            <div>
              <label className="label">Projects</label>
              <div className="flex flex-wrap gap-2">
                {projects.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleId('projectIds', p.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      form.projectIds.includes(p.id)
                        ? 'text-white border-transparent'
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                    style={form.projectIds.includes(p.id) ? { backgroundColor: p.color, borderColor: p.color } : {}}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <label className="label">Categories</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleId('categoryIds', c.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      form.categoryIds.includes(c.id)
                        ? 'text-white border-transparent'
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                    style={form.categoryIds.includes(c.id) ? { backgroundColor: c.color, borderColor: c.color } : {}}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isShared"
              checked={form.isShared}
              onChange={e => setForm(f => ({ ...f, isShared: e.target.checked }))}
              className="rounded border-gray-300 text-primary-600"
            />
            <label htmlFor="isShared" className="text-sm text-gray-700">Share this task with all users</label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : task ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
