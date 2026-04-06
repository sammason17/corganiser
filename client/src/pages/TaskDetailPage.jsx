import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import {
  useTask, useUpdateTask, useDeleteTask,
  useTaskUpdates, useAddTaskUpdate,
  useTimeLogs, useAddTimeLog,
} from '../hooks/useTasks'
import TaskModal from '../components/TaskModal'

const STATUS_STYLES = {
  TODO:        { label: 'To Do',       cls: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' },
  DONE:        { label: 'Done',        cls: 'bg-green-100 text-green-700' },
}

const PRIORITY_STYLES = {
  LOW:    { label: 'Low',    cls: 'bg-gray-100 text-gray-500' },
  MEDIUM: { label: 'Medium', cls: 'bg-yellow-100 text-yellow-700' },
  HIGH:   { label: 'High',   cls: 'bg-red-100 text-red-700' },
}

export default function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: task, isLoading } = useTask(id)
  const { data: updates = [] } = useTaskUpdates(id)
  const { data: timeData } = useTimeLogs(id)
  const updateTask = useUpdateTask(id)
  const deleteTask = useDeleteTask()
  const addUpdate = useAddTaskUpdate(id)
  const addTimeLog = useAddTimeLog(id)

  const [showEdit, setShowEdit] = useState(false)
  const [updateText, setUpdateText] = useState('')
  const [timeForm, setTimeForm] = useState({ durationMinutes: '', description: '' })
  const [submittingUpdate, setSubmittingUpdate] = useState(false)
  const [submittingTime, setSubmittingTime] = useState(false)

  if (isLoading) return <div className="text-center py-16 text-gray-400">Loading…</div>
  if (!task) return <div className="text-center py-16 text-gray-400">Task not found.</div>

  const isOwner = task.ownerId === user?.id
  const status = STATUS_STYLES[task.status] || STATUS_STYLES.TODO
  const priority = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.MEDIUM
  const totalMinutes = timeData?.totalMinutes || 0
  const totalHours = Math.floor(totalMinutes / 60)
  const remainingMins = totalMinutes % 60

  async function handleSaveEdit(data) {
    await updateTask.mutateAsync(data)
    setShowEdit(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this task? This cannot be undone.')) return
    await deleteTask.mutateAsync(id)
    navigate('/')
  }

  async function handleAddUpdate(e) {
    e.preventDefault()
    if (!updateText.trim()) return
    setSubmittingUpdate(true)
    try {
      await addUpdate.mutateAsync(updateText.trim())
      setUpdateText('')
    } finally {
      setSubmittingUpdate(false)
    }
  }

  async function handleAddTimeLog(e) {
    e.preventDefault()
    setSubmittingTime(true)
    try {
      await addTimeLog.mutateAsync({
        durationMinutes: parseInt(timeForm.durationMinutes),
        description: timeForm.description,
      })
      setTimeForm({ durationMinutes: '', description: '' })
    } finally {
      setSubmittingTime(false)
    }
  }

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="btn-ghost text-sm mb-4 -ml-2">
        ← Back
      </button>

      {/* Header */}
      <div className="card p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{task.title}</h1>
            {task.description && (
              <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{task.description}</p>
            )}
          </div>
          {isOwner && (
            <div className="flex gap-2 flex-shrink-0">
              <button className="btn-secondary text-xs" onClick={() => setShowEdit(true)}>Edit</button>
              <button className="btn-danger text-xs" onClick={handleDelete}>Delete</button>
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`badge ${status.cls}`}>{status.label}</span>
          <span className={`badge ${priority.cls}`}>{priority.label} priority</span>
          {task.isShared && <span className="badge bg-primary-100 text-primary-700">Shared</span>}
          {task.categories?.map(c => (
            <span key={c.id} className="badge text-white" style={{ backgroundColor: c.color }}>{c.name}</span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
          {task.dueDate && (
            <span>Due: {format(new Date(task.dueDate), 'dd MMM yyyy')}</span>
          )}
          <span>Owner: {task.owner?.name}</span>
          <span>Created: {format(new Date(task.createdAt), 'dd MMM yyyy')}</span>
          {totalMinutes > 0 && (
            <span className="font-medium text-gray-700">
              Total time: {totalHours > 0 ? `${totalHours}h ` : ''}{remainingMins > 0 ? `${remainingMins}m` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Notes log */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Updates &amp; Notes</h2>

          <form onSubmit={handleAddUpdate} className="mb-4">
            <textarea
              className="input resize-none text-sm"
              rows={3}
              placeholder="Add an update or note…"
              value={updateText}
              onChange={e => setUpdateText(e.target.value)}
            />
            <button type="submit" className="btn-primary text-xs mt-2" disabled={submittingUpdate || !updateText.trim()}>
              {submittingUpdate ? 'Posting…' : 'Add update'}
            </button>
          </form>

          <div className="space-y-3 max-h-80 overflow-y-auto">
            {updates.length === 0 && (
              <p className="text-xs text-gray-400">No updates yet.</p>
            )}
            {updates.map(u => (
              <div key={u.id} className="border-l-2 border-primary-200 pl-3">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{u.content}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {u.user?.name} · {format(new Date(u.createdAt), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Time log */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Time Log</h2>
          {totalMinutes > 0 && (
            <p className="text-xs text-gray-500 mb-4">
              Total: {totalHours > 0 ? `${totalHours}h ` : ''}{remainingMins > 0 ? `${remainingMins}m` : ''}
            </p>
          )}

          <form onSubmit={handleAddTimeLog} className="mb-4 space-y-2">
            <div>
              <label className="label text-xs">Duration (minutes)</label>
              <input
                type="number"
                min="1"
                className="input text-sm"
                placeholder="e.g. 60"
                value={timeForm.durationMinutes}
                onChange={e => setTimeForm(f => ({ ...f, durationMinutes: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label text-xs">Description (optional)</label>
              <input
                type="text"
                className="input text-sm"
                placeholder="What did you work on?"
                value={timeForm.description}
                onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn-primary text-xs" disabled={submittingTime}>
              {submittingTime ? 'Logging…' : 'Log time'}
            </button>
          </form>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {timeData?.logs?.length === 0 && (
              <p className="text-xs text-gray-400">No time logged yet.</p>
            )}
            {timeData?.logs?.map(log => (
              <div key={log.id} className="flex items-start justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-xs font-medium text-gray-700">
                    {log.durationMinutes >= 60
                      ? `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60 > 0 ? `${log.durationMinutes % 60}m` : ''}`
                      : `${log.durationMinutes}m`}
                  </p>
                  {log.description && <p className="text-xs text-gray-500">{log.description}</p>}
                </div>
                <div className="text-xs text-gray-400 text-right">
                  <p>{log.user?.name}</p>
                  <p>{format(new Date(log.loggedAt), 'dd MMM')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showEdit && (
        <TaskModal
          task={task}
          onClose={() => setShowEdit(false)}
          onSave={handleSaveEdit}
          loading={updateTask.isPending}
        />
      )}
    </div>
  )
}
