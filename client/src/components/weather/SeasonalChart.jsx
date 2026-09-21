import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatXTick(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  if (d.getDate() === 1) return MONTHS[d.getMonth()]
  return ''
}

export default function SeasonalChart({ data }) {
  if (!data?.length) return null

  const chartData = data.map(d => ({
    date: d.date,
    High: d.tempMax,
    Low: d.tempMin,
  }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tickFormatter={formatXTick}
          stroke="#94a3b8"
          tick={{ fill: '#64748b', fontSize: 12 }}
        />
        <YAxis
          stroke="#94a3b8"
          tick={{ fill: '#64748b', fontSize: 12 }}
          unit="°C"
          domain={['auto', 'auto']}
        />
        <Tooltip
          contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          labelStyle={{ color: '#64748b' }}
          formatter={(value, name) => [`${value}°C`, name]}
        />
        <Legend wrapperStyle={{ color: '#64748b', fontSize: 12, paddingTop: 8 }} />
        <Area type="monotone" dataKey="High" stroke="#f97316" fill="#ffedd5" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        <Area type="monotone" dataKey="Low" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
