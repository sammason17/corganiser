import WeatherIcon from './WeatherIcon'

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return DAYS_SHORT[d.getDay()]
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function ForecastGrid({ forecasts }) {
  if (!forecasts?.length) return null
  const dates = forecasts[0].days.map(d => d.date)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="py-3 px-3 text-left text-gray-500 font-medium w-28 border-b border-gray-200">Date</th>
            {forecasts.map(f => (
              <th key={f.model} colSpan={3} className="py-3 px-2 text-center text-blue-600 font-semibold border-l border-b border-gray-200">
                {f.label}
              </th>
            ))}
          </tr>
          <tr className="text-xs text-gray-500 uppercase tracking-wide">
            <th className="pb-2 px-3 border-b border-gray-200"></th>
            {forecasts.map(f => (
              <optgroup key={f.model + '-group'} className="contents">
                <th key={f.model + '-temp'} className="py-2 px-2 text-center border-l border-b border-gray-200 font-medium">Temp</th>
                <th key={f.model + '-rain'} className="py-2 px-2 text-center border-b border-gray-200 font-medium">Rain %</th>
                <th key={f.model + '-cloud'} className="py-2 px-2 text-center border-b border-gray-200 font-medium">Cloud</th>
              </optgroup>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {dates.map((date, i) => {
            const isToday = i === 0
            return (
              <tr
                key={date}
                className={`transition-colors hover:bg-gray-50 ${isToday ? 'bg-blue-50/30' : ''}`}
              >
                <td className="py-3 px-3">
                  <div className="font-semibold text-gray-900">{isToday ? 'Today' : formatDay(date)}</div>
                  <div className="text-xs text-gray-500">{formatDate(date)}</div>
                </td>
                {forecasts.map(f => {
                  const day = f.days[i]
                  if (!day) return <td key={f.model} colSpan={3} className="border-l border-gray-100 text-center text-gray-400">N/A</td>
                  return (
                    <optgroup key={f.model + '-data'} className="contents">
                      <td key={f.model + '-temp'} className="py-3 px-3 text-center border-l border-gray-100">
                        <div className="flex flex-col items-center gap-1">
                          <WeatherIcon precipProb={day.precipProb} cloudCover={day.cloudCover} />
                          <span className="text-orange-500 font-bold">{day.tempMax}°</span>
                          <span className="text-blue-500 text-xs">{day.tempMin}°</span>
                        </div>
                      </td>
                      <td key={f.model + '-rain'} className="py-3 px-3 text-center">
                        <div className={`font-semibold ${day.precipProb >= 60 ? 'text-blue-600' : day.precipProb >= 30 ? 'text-blue-400' : 'text-gray-400'}`}>
                          {day.precipProb}%
                        </div>
                      </td>
                      <td key={f.model + '-cloud'} className="py-3 px-3 text-center text-gray-400">
                        {day.cloudCover}%
                      </td>
                    </optgroup>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
