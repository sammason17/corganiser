import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../lib/api'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const { user, updateUser } = useAuth()

  const [profileForm, setProfileForm] = useState({ name: user?.name || '', email: user?.email || '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  async function handleProfileSave(e) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const { data } = await api.put('/users/me', profileForm)
      updateUser(data)
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handlePasswordSave(e) {
    e.preventDefault()
    if (passwordForm.newPassword !== passwordForm.confirm) {
      toast.error('New passwords do not match')
      return
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    setSavingPassword(true)
    try {
      await api.put('/auth/update-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      toast.success('Password updated')
      setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Profile */}
      <div className="card p-6 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">Profile</h2>
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input
              type="text"
              className="input"
              value={profileForm.name}
              onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={profileForm.email}
              onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Change password</h2>
        <form onSubmit={handlePasswordSave} className="space-y-4">
          <div>
            <label className="label">Current password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={passwordForm.currentPassword}
              onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">New password</label>
            <input
              type="password"
              className="input"
              placeholder="Min. 8 characters"
              value={passwordForm.newPassword}
              onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={passwordForm.confirm}
              onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={savingPassword}>
            {savingPassword ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
