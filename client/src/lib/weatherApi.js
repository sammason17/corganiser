const MODELS = [
  { model: 'ecmwf_ifs', label: 'ECMWF IFS' },
  { model: 'ukmo_seamless', label: 'Met Office' },
  { model: 'gfs_seamless', label: 'NOAA GFS' },
]

function derivePrecipProb(precipSum) {
  if (precipSum == null || precipSum <= 0) return 0
  if (precipSum < 1) return 30
  if (precipSum < 2) return 50
  if (precipSum < 5) return 70
  if (precipSum < 10) return 85
  return 95
}

export async function fetchWeekForecasts({ lat, lng }) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,cloud_cover_mean',
    forecast_days: '7',
    timezone: 'Europe/London',
  })

  const results = await Promise.all(
    MODELS.map(async ({ model, label }) => {
      const url = `https://api.open-meteo.com/v1/forecast?${params}&models=${model}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Open-Meteo error for ${label}: ${res.status}`)
      const data = await res.json()
      const { daily } = data

      const days = daily.time.map((date, i) => {
        const precipProbDirect = daily.precipitation_probability_max?.[i]
        const precipSum = daily.precipitation_sum?.[i]
        const precipProb = precipProbDirect != null
          ? Math.round(precipProbDirect)
          : derivePrecipProb(precipSum)

        return {
          date,
          tempMax: Math.round(daily.temperature_2m_max[i]),
          tempMin: Math.round(daily.temperature_2m_min[i]),
          precipProb,
          cloudCover: Math.round(daily.cloud_cover_mean[i] ?? 0),
        }
      })

      return { model, label, days }
    })
  )

  return results
}

export async function fetchSeasonalForecast({ lat, lng }) {
  const url = `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min&forecast_days=92&timezone=Europe/London`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Seasonal API error: ${res.status}`)
  const data = await res.json()
  const { daily } = data

  return daily.time.map((date, i) => ({
    date,
    tempMax: Math.round(daily.temperature_2m_max[i]),
    tempMin: Math.round(daily.temperature_2m_min[i]),
  }))
}

export async function geocodePostcode(postcode) {
  // Try UK Postcodes API first
  try {
    const cleanPostcode = postcode.replace(/\s+/g, '');
    const ukRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`);
    if (ukRes.ok) {
      const ukData = await ukRes.json();
      return {
        lat: ukData.result.latitude,
        lng: ukData.result.longitude,
        name: ukData.result.postcode,
      };
    }
  } catch (err) {
    // Ignore and fallback
  }

  // Fallback to Open-Meteo Geocoding for city names or non-UK locations
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(postcode)}&count=1&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch coordinates')
  const data = await res.json()
  if (!data.results || data.results.length === 0) {
    throw new Error('Postcode or location not found')
  }
  const result = data.results[0]
  return {
    lat: result.latitude,
    lng: result.longitude,
    name: result.name,
  }
}
