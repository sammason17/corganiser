import { Link } from 'react-router-dom'
import { format, isPast, isToday } from 'date-fns'

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

export default function TaskCard({ task, innerRef, draggableProps, dragHandleProps }) {
  const status = STATUS_STYLES[task.status] || STATUS_STYLES.TODO
  const priority = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.MEDIUM

  const dueDate = task.dueDate ? new Date(task.dueDate) : null
  const duePast = dueDate && isPast(dueDate) && task.status !== 'DONE'
  const dueToday = dueDate && isToday(dueDate)

  return (
    <Link
      ref={innerRef}
      {...draggableProps}
      {...dragHandleProps}
      to={`/tasks/${task.id}`}
      className="card p-4 block hover:shadow-md transition-shadow group"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 leading-snug">
          {task.title}
        </h3>
        <span className={`badge flex-shrink-0 ${priority.cls}`}>{priority.label}</span>
      </div>

      {task.description && (
        <p className="mt-1 text-xs text-gray-500 line-clamp-2">{task.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`badge ${status.cls}`}>{status.label}</span>

        {task.categories?.map(cat => (
          <span
            key={cat.id}
            className="badge text-white"
            style={{ backgroundColor: cat.color }}
          >
            {cat.name}
          </span>
        ))}

        {task.projects?.map(proj => (
          <span
            key={proj.id}
            className="badge border"
            style={{ borderColor: proj.color, color: proj.color }}
          >
            {proj.name}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-3">
          {task._count?.updates > 0 && (
            <span>{task._count.updates} note{task._count.updates !== 1 ? 's' : ''}</span>
          )}
          {task._count?.timeLogs > 0 && (
            <span>{task._count.timeLogs} time log{task._count.timeLogs !== 1 ? 's' : ''}</span>
          )}
          {task.isShared && <span className="text-primary-500 font-medium">Shared</span>}
        </div>
        {dueDate && (
          <span className={duePast ? 'text-red-500 font-medium' : dueToday ? 'text-orange-500 font-medium' : ''}>
            {dueToday ? 'Due today' : duePast ? `Overdue · ${format(dueDate, 'dd MMM')}` : format(dueDate, 'dd MMM yyyy')}
          </span>
        )}
      </div>
    </Link>
  )
}
