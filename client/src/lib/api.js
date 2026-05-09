import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 — only auto-logout if the token is actually expired/missing
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const token = localStorage.getItem('token')
      let tokenExpired = !token
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          tokenExpired = payload.exp * 1000 < Date.now()
        } catch {
          tokenExpired = true
        }
      }
      if (tokenExpired) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.href = '/login'
      }
      // If token is still valid, the 401 is a backend issue — reject without logout
    }
    return Promise.reject(err)
  }
)

export default api
