import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/api'
import { fetchWeekForecasts, fetchSeasonalForecast, geocodePostcode } from '../../lib/weatherApi'
import ForecastGrid from '../../components/weather/ForecastGrid'
import SeasonalChart from '../../components/weather/SeasonalChart'
import toast from 'react-hot-toast'
import { MapPin, Search } from 'lucide-react'

export default function WeatherDashboard() {
  const { user, updateUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  
  const [postcode, setPostcode] = useState(user?.weatherPostcode || '')
  const [isEditing, setIsEditing] = useState(!user?.weatherLat)
  const [geocoding, setGeocoding] = useState(false)

  useEffect(() => {
    if (user?.weatherLat && user?.weatherLng && !isEditing) {
      loadWeather(user.weatherLat, user.weatherLng)
    }
  }, [user?.weatherLat, user?.weatherLng, isEditing])

  async function loadWeather(lat, lng) {
    setLoading(true)
    try {
      const [weekForecasts, seasonalData] = await Promise.all([
        fetchWeekForecasts({ lat, lng }),
        fetchSeasonalForecast({ lat, lng })
      ])
      setData({ weekForecasts, seasonalData })
    } catch (err) {
      toast.error('Failed to load weather data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveLocation(e) {
    e.preventDefault()
    if (!postcode) return
    setGeocoding(true)
    try {
      const location = await geocodePostcode(postcode)
      const res = await api.put('/users/me', {
        weatherPostcode: postcode,
        weatherLat: location.lat,
        weatherLng: location.lng
      })
      updateUser(res.data)
      setIsEditing(false)
      toast.success('Location updated')
    } catch (err) {
      toast.error('Failed to find that postcode')
    } finally {
      setGeocoding(false)
    }
  }

  if (isEditing) {
    return (
      <div className="max-w-xl mx-auto mt-12 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="text-blue-500" />
            Set Weather Location
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Enter your postcode to get hyper-local weather forecasts.
          </p>
        </div>
        <div className="p-6">
          <form onSubmit={handleSaveLocation} className="flex gap-3">
            <input 
              type="text" 
              placeholder="e.g. SW1A 1AA"
              className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
              value={postcode}
              onChange={e => setPostcode(e.target.value)}
              required
            />
            <button 
              type="submit" 
              disabled={geocoding}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
            >
              {geocoding ? 'Finding...' : <><Search size={18} /> Search</>}
            </button>
          </form>
          {user?.weatherLat && (
            <button 
              onClick={() => setIsEditing(false)}
              className="mt-4 text-sm text-gray-500 hover:text-gray-900"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">🌤️</span>
            <h1 className="text-2xl font-bold text-gray-900">Local Weather</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <MapPin size={14} />
            <span className="uppercase font-medium">{user.weatherPostcode}</span>
            <span className="text-gray-300">•</span>
            <button 
              onClick={() => setIsEditing(true)}
              className="text-blue-600 hover:underline"
            >
              Change Location
            </button>
          </div>
        </div>
      </div>

      {loading || !data ? (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-3">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span>Loading weather models...</span>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">7-Day Forecast</h2>
            <p className="text-sm text-gray-500 mb-4">Compare models to see confidence in the forecast.</p>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <ForecastGrid forecasts={data.weekForecasts} />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">3-Month Outlook</h2>
            <p className="text-sm text-gray-500 mb-4">Seasonal temperature trends.</p>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <SeasonalChart data={data.seasonalData} />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
