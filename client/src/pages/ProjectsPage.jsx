import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject } from '../hooks/useProjects'

const PRESET_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']

function ProjectForm({ initial, onSave, onCancel, loading }) {
  const [form, setForm] = useState(initial || { name: '', description: '', color: '#6366f1', isShared: false })

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="space-y-3">
      <div>
        <label className="label">Name *</label>
        <input
          className="input"
          placeholder="Project name"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          required
          autoFocus
        />
      </div>
      <div>
        <label className="label">Description</label>
        <input
          className="input"
          placeholder="Optional description"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div>
        <label className="label">Colour</label>
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`w-7 h-7 rounded-full border-2 transition-transform ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              onClick={() => setForm(f => ({ ...f, color: c }))}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="proj-shared"
          checked={form.isShared}
          onChange={e => setForm(f => ({ ...f, isShared: e.target.checked }))}
          className="rounded border-gray-300 text-primary-600"
        />
        <label htmlFor="proj-shared" className="text-sm text-gray-700">Share with all users</label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary text-sm" disabled={loading}>
          {loading ? 'Saving…' : initial ? 'Save changes' : 'Create project'}
        </button>
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export default function ProjectsPage() {
  const { user } = useAuth()
  const { data: projects = [], isLoading } = useProjects()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()

  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState(null)

  async function handleCreate(data) {
    await createProject.mutateAsync(data)
    setShowCreate(false)
  }

  async function handleUpdate(id, data) {
    await updateProject.mutateAsync({ id, ...data })
    setEditingId(null)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this project? Tasks will not be deleted but will be unlinked.')) return
    await deleteProject.mutateAsync(id)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Projects</h1>
        {!showCreate && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New project</button>
        )}
      </div>

      {showCreate && (
        <div className="card p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">New project</h2>
          <ProjectForm
            onSave={handleCreate}
            onCancel={() => setShowCreate(false)}
            loading={createProject.isPending}
          />
        </div>
      )}

      {isLoading && <div className="text-center py-16 text-gray-400">Loading…</div>}

      {!isLoading && projects.length === 0 && !showCreate && (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">No projects yet.</p>
          <button className="btn-primary mt-3" onClick={() => setShowCreate(true)}>Create your first project</button>
        </div>
      )}

      <div className="space-y-3">
        {projects.map(project => {
          const isOwner = project.ownerId === user?.id
          return (
            <div key={project.id} className="card p-5">
              {editingId === project.id ? (
                <>
                  <h2 className="font-semibold text-gray-900 mb-4">Edit project</h2>
                  <ProjectForm
                    initial={project}
                    onSave={(data) => handleUpdate(project.id, data)}
                    onCancel={() => setEditingId(null)}
                    loading={updateProject.isPending}
                  />
                </>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: project.color }} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{project.name}</h3>
                        {project.isShared && <span className="badge bg-primary-100 text-primary-700">Shared</span>}
                        <span className="text-xs text-gray-400">{project._count?.tasks || 0} task{project._count?.tasks !== 1 ? 's' : ''}</span>
                      </div>
                      {project.description && <p className="text-sm text-gray-500 mt-0.5">{project.description}</p>}
                      <p className="text-xs text-gray-400 mt-1">Created by {project.owner?.name}</p>
                    </div>
                  </div>
                  {isOwner && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button className="btn-secondary text-xs" onClick={() => setEditingId(project.id)}>Edit</button>
                      <button className="btn-danger text-xs" onClick={() => handleDelete(project.id)}>Delete</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
