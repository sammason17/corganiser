import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories'

const PRESET_COLORS = ['#f59e0b','#ef4444','#6366f1','#10b981','#3b82f6','#8b5cf6','#ec4899','#14b8a6']

function CategoryForm({ initial, onSave, onCancel, loading }) {
  const [form, setForm] = useState(initial || { name: '', color: '#f59e0b', isShared: false })

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="space-y-3">
      <div>
        <label className="label">Name *</label>
        <input
          className="input"
          placeholder="e.g. Urgent, Blocked, Review"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          required
          autoFocus
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
          id="cat-shared"
          checked={form.isShared}
          onChange={e => setForm(f => ({ ...f, isShared: e.target.checked }))}
          className="rounded border-gray-300 text-primary-600"
        />
        <label htmlFor="cat-shared" className="text-sm text-gray-700">Share with all users</label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary text-sm" disabled={loading}>
          {loading ? 'Saving…' : initial ? 'Save changes' : 'Create category'}
        </button>
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export default function CategoriesPage() {
  const { user } = useAuth()
  const { data: categories = [], isLoading } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()

  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState(null)

  async function handleCreate(data) {
    await createCategory.mutateAsync(data)
    setShowCreate(false)
  }

  async function handleUpdate(id, data) {
    await updateCategory.mutateAsync({ id, ...data })
    setEditingId(null)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this category? Tasks will not be deleted but will be unlinked.')) return
    await deleteCategory.mutateAsync(id)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Categories</h1>
          <p className="text-sm text-gray-500 mt-0.5">Use categories like "Urgent", "Blocked", or "Review" across tasks</p>
        </div>
        {!showCreate && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New category</button>
        )}
      </div>

      {showCreate && (
        <div className="card p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">New category</h2>
          <CategoryForm
            onSave={handleCreate}
            onCancel={() => setShowCreate(false)}
            loading={createCategory.isPending}
          />
        </div>
      )}

      {isLoading && <div className="text-center py-16 text-gray-400">Loading…</div>}

      {!isLoading && categories.length === 0 && !showCreate && (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">No categories yet.</p>
          <button className="btn-primary mt-3" onClick={() => setShowCreate(true)}>Create your first category</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {categories.map(cat => {
          const isOwner = cat.ownerId === user?.id
          return (
            <div key={cat.id} className="card p-4">
              {editingId === cat.id ? (
                <>
                  <h3 className="font-semibold text-gray-900 mb-3">Edit category</h3>
                  <CategoryForm
                    initial={cat}
                    onSave={(data) => handleUpdate(cat.id, data)}
                    onCancel={() => setEditingId(null)}
                    loading={updateCategory.isPending}
                  />
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: cat.color }}
                    >
                      {cat.name}
                    </span>
                    {cat.isShared && <span className="badge bg-primary-100 text-primary-700">Shared</span>}
                    <span className="text-xs text-gray-400">{cat._count?.tasks || 0} task{cat._count?.tasks !== 1 ? 's' : ''}</span>
                  </div>
                  {isOwner && (
                    <div className="flex gap-1.5">
                      <button className="btn-secondary text-xs py-1 px-2" onClick={() => setEditingId(cat.id)}>Edit</button>
                      <button className="btn-danger text-xs py-1 px-2" onClick={() => handleDelete(cat.id)}>Delete</button>
                    </div>
                  )}
                </div>
              )}
              {!editingId || editingId !== cat.id ? (
                <p className="text-xs text-gray-400 mt-1.5 ml-0">Created by {cat.owner?.name}</p>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
