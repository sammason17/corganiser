import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories'

const PRESET_COLORS = ['#f59e0b','#ef4444','#6366f1','#10b981','#3b82f6','#8b5cf6','#ec4899','#14b8a6']

function CategoryForm({ initial, parentName, parentId, onSave, onCancel, loading }) {
  const [form, setForm] = useState(initial || { name: '', description: '', color: '#f59e0b', isShared: false })

  function handleSubmit(e) {
    e.preventDefault()
    onSave({ ...form, ...(parentId !== undefined && { parentId }) })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {parentName && (
        <p className="text-xs text-gray-500">
          Subcategory of <span className="font-semibold text-gray-700">{parentName}</span>
        </p>
      )}
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
        <label className="label">Description</label>
        <textarea
          className="input resize-none"
          rows={2}
          placeholder="Optional — what is this category for?"
          value={form.description || ''}
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
          id="cat-shared"
          checked={form.isShared}
          onChange={e => setForm(f => ({ ...f, isShared: e.target.checked }))}
          className="rounded border-gray-300 text-primary-600"
        />
        <label htmlFor="cat-shared" className="text-sm text-gray-700">Share with all users</label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary text-sm" disabled={loading}>
          {loading ? 'Saving…' : initial ? 'Save changes' : 'Create'}
        </button>
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function CategoryRow({ cat, isChild, isOwner, onEdit, onDelete, onAddSub, editingId, showSubCreateFor, onSaveEdit, onSaveSubCreate, onCancelEdit, onCancelSub, updateLoading, createLoading }) {
  const isEditing = editingId === cat.id

  return (
    <div
      className={`card p-4 ${isChild ? 'border-l-4' : ''}`}
      style={isChild ? { borderLeftColor: cat.parent?.color || '#e5e7eb' } : {}}
    >
      {isEditing ? (
        <>
          <p className="text-xs font-medium text-gray-500 mb-3">Edit {isChild ? 'subcategory' : 'category'}</p>
          <CategoryForm
            initial={cat}
            onSave={data => onSaveEdit(cat.id, data)}
            onCancel={onCancelEdit}
            loading={updateLoading}
          />
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: cat.color }}
            >
              {cat.name}
            </span>
            {cat.isShared && <span className="badge bg-primary-100 text-primary-700">Shared</span>}
            <span className="text-xs text-gray-400">{cat._count?.tasks || 0} task{cat._count?.tasks !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {!isChild && isOwner && (
              <button
                className="btn-ghost text-xs py-1 px-2 text-primary-600"
                onClick={() => onAddSub(cat.id)}
              >
                + Sub
              </button>
            )}
            {isOwner && (
              <>
                <button className="btn-secondary text-xs py-1 px-2" onClick={() => onEdit(cat.id)}>Edit</button>
                <button className="btn-danger text-xs py-1 px-2" onClick={() => onDelete(cat.id, isChild)}>Delete</button>
              </>
            )}
          </div>
        </div>
      )}
      {!isEditing && (
        <div className="mt-1.5 space-y-0.5">
          {cat.description && <p className="text-xs text-gray-500">{cat.description}</p>}
          <p className="text-xs text-gray-400">Created by {cat.owner?.name}</p>
        </div>
      )}
    </div>
  )
}

export default function CategoriesPage() {
  const { user } = useAuth()
  const { data: categories = [], isLoading } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()

  const [showCreate, setShowCreate] = useState(false)
  const [showSubCreateFor, setShowSubCreateFor] = useState(null) // parent category id
  const [editingId, setEditingId] = useState(null)

  async function handleCreate(data) {
    await createCategory.mutateAsync(data)
    setShowCreate(false)
    setShowSubCreateFor(null)
  }

  async function handleUpdate(id, data) {
    await updateCategory.mutateAsync({ id, ...data })
    setEditingId(null)
  }

  async function handleDelete(id, isChild) {
    const msg = isChild
      ? 'Delete this subcategory? Tasks will be unlinked.'
      : 'Delete this category? Any subcategories will become top-level. Tasks will be unlinked.'
    if (!confirm(msg)) return
    await deleteCategory.mutateAsync(id)
  }

  const totalCount = categories.reduce((n, c) => n + 1 + (c.children?.length || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Categories</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalCount} categor{totalCount !== 1 ? 'ies' : 'y'} · use them to group tasks across projects
          </p>
        </div>
        {!showCreate && (
          <button className="btn-primary" onClick={() => { setShowCreate(true); setShowSubCreateFor(null) }}>
            + New category
          </button>
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

      <div className="space-y-3">
        {categories.map(cat => {
          const isOwner = cat.ownerId === user?.id
          return (
            <div key={cat.id}>
              <CategoryRow
                cat={cat}
                isChild={false}
                isOwner={isOwner}
                onEdit={id => { setEditingId(id); setShowSubCreateFor(null) }}
                onDelete={handleDelete}
                onAddSub={id => { setShowSubCreateFor(id); setShowCreate(false); setEditingId(null) }}
                editingId={editingId}
                showSubCreateFor={showSubCreateFor}
                onSaveEdit={handleUpdate}
                onCancelEdit={() => setEditingId(null)}
                updateLoading={updateCategory.isPending}
                createLoading={createCategory.isPending}
              />

              {/* Subcategories */}
              {(cat.children?.length > 0 || showSubCreateFor === cat.id) && (
                <div className="ml-6 mt-2 space-y-2">
                  {cat.children?.map(child => (
                    <CategoryRow
                      key={child.id}
                      cat={{ ...child, parent: cat }}
                      isChild={true}
                      isOwner={child.ownerId === user?.id}
                      onEdit={id => { setEditingId(id); setShowSubCreateFor(null) }}
                      onDelete={handleDelete}
                      editingId={editingId}
                      onSaveEdit={handleUpdate}
                      onCancelEdit={() => setEditingId(null)}
                      updateLoading={updateCategory.isPending}
                    />
                  ))}

                  {showSubCreateFor === cat.id && (
                    <div className="card p-4 border-l-4" style={{ borderLeftColor: cat.color }}>
                      <CategoryForm
                        parentId={cat.id}
                        parentName={cat.name}
                        onSave={handleCreate}
                        onCancel={() => setShowSubCreateFor(null)}
                        loading={createCategory.isPending}
                      />
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
