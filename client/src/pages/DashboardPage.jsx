import { useState } from 'react'
import { useTasks, useCreateTask } from '../hooks/useTasks'
import { useProjects } from '../hooks/useProjects'
import { useCategories } from '../hooks/useCategories'
import TaskCard from '../components/TaskCard'
import TaskModal from '../components/TaskModal'

const STATUS_COLUMNS = [
  { key: 'TODO',        label: 'To Do' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'DONE',        label: 'Done' },
]

export default function DashboardPage() {
  const [filters, setFilters] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [view, setView] = useState('board') // 'board' | 'list'

  const { data: tasks = [], isLoading } = useTasks(filters)
  const { data: projects = [] } = useProjects()
  const { data: categories = [] } = useCategories()
  const createTask = useCreateTask()

  async function handleCreate(data) {
    await createTask.mutateAsync(data)
    setShowModal(false)
  }

  const tasksByStatus = STATUS_COLUMNS.reduce((acc, col) => {
    acc[col.key] = tasks.filter(t => t.status === col.key)
    return acc
  }, {})

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
            {Object.keys(filters).length > 0 && ' (filtered)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`btn-ghost text-xs px-2 py-1 ${view === 'board' ? 'bg-gray-100' : ''}`}
            onClick={() => setView('board')}
          >Board</button>
          <button
            className={`btn-ghost text-xs px-2 py-1 ${view === 'list' ? 'bg-gray-100' : ''}`}
            onClick={() => setView('list')}
          >List</button>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + New task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <select
          className="input w-auto text-sm py-1.5"
          value={filters.status || ''}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value || undefined }))}
        >
          <option value="">All statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="DONE">Done</option>
        </select>

        <select
          className="input w-auto text-sm py-1.5"
          value={filters.priority || ''}
          onChange={e => setFilters(f => ({ ...f, priority: e.target.value || undefined }))}
        >
          <option value="">All priorities</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>

        {projects.length > 0 && (
          <select
            className="input w-auto text-sm py-1.5"
            value={filters.projectId || ''}
            onChange={e => setFilters(f => ({ ...f, projectId: e.target.value || undefined }))}
          >
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        {categories.length > 0 && (
          <select
            className="input w-auto text-sm py-1.5"
            value={filters.categoryId || ''}
            onChange={e => setFilters(f => ({ ...f, categoryId: e.target.value || undefined }))}
          >
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <select
          className="input w-auto text-sm py-1.5"
          value={filters.shared || ''}
          onChange={e => setFilters(f => ({ ...f, shared: e.target.value || undefined }))}
        >
          <option value="">All tasks</option>
          <option value="true">Shared only</option>
          <option value="false">My tasks only</option>
        </select>

        {Object.keys(filters).some(k => filters[k]) && (
          <button className="btn-ghost text-sm py-1.5 text-red-500" onClick={() => setFilters({})}>
            Clear filters
          </button>
        )}
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">Loading tasks…</div>
      )}

      {!isLoading && tasks.length === 0 && (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">No tasks found.</p>
          <button className="btn-primary mt-3" onClick={() => setShowModal(true)}>Create your first task</button>
        </div>
      )}

      {/* Board view */}
      {!isLoading && view === 'board' && tasks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATUS_COLUMNS.map(col => (
            <div key={col.key}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-700">{col.label}</h2>
                <span className="badge bg-gray-100 text-gray-600">
                  {tasksByStatus[col.key]?.length || 0}
                </span>
              </div>
              <div className="space-y-2">
                {tasksByStatus[col.key]?.map(task => (
                  <TaskCard key={task.id} task={task} />
                ))}
                {tasksByStatus[col.key]?.length === 0 && (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {!isLoading && view === 'list' && tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map(task => <TaskCard key={task.id} task={task} />)}
        </div>
      )}

      {showModal && (
        <TaskModal
          onClose={() => setShowModal(false)}
          onSave={handleCreate}
          loading={createTask.isPending}
        />
      )}
    </div>
  )
}
