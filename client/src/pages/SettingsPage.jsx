import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { Users, Copy, RefreshCw, Trash2, Pencil } from 'lucide-react'

function HouseholdSection() {
  const [familyInfo, setFamilyInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)

  const loadFamily = async () => {
    try {
      const { data } = await api.get('/family/current')
      setFamilyInfo(data)
      setNameInput(data.name || data.family?.name || '')
    } catch (err) {
      console.warn('Could not load family in Settings:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFamily()
  }, [])

  const handleCopyInvite = () => {
    const code = familyInfo?.inviteCode || familyInfo?.family?.inviteCode
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopiedInvite(true)
    toast.success('Invite code copied!')
    setTimeout(() => setCopiedInvite(false), 2500)
  }

  const handleRegenerateInvite = async () => {
    if (!window.confirm('Regenerate family invite code? The old code will immediately stop working.')) return
    try {
      const { data } = await api.post('/family/invite-code/regenerate')
      setFamilyInfo(prev => ({
        ...prev,
        inviteCode: data.inviteCode,
        ...(prev?.family ? { family: { ...prev.family, inviteCode: data.inviteCode } } : {})
      }))
      toast.success('New invite code generated!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to regenerate invite code')
    }
  }

  const handleSaveName = async (e) => {
    e.preventDefault()
    if (!nameInput.trim()) return
    setIsRenaming(true)
    try {
      const { data } = await api.put('/family/name', { name: nameInput.trim() })
      setFamilyInfo(prev => ({
        ...prev,
        name: data.name,
        ...(prev?.family ? { family: { ...prev.family, name: data.name } } : {})
      }))
      setEditingName(false)
      toast.success('Household renamed!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to rename household')
    } finally {
      setIsRenaming(false)
    }
  }

  const handleJoinFamily = async (e) => {
    e.preventDefault()
    if (!joinCode.trim()) return
    setIsJoining(true)
    try {
      await api.post('/family/join', { inviteCode: joinCode.trim().toUpperCase() })
      toast.success('Successfully joined household!')
      setJoinCode('')
      loadFamily()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to join household')
    } finally {
      setIsJoining(false)
    }
  }

  const handleRemoveMember = async (userId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from this household? They will lose access to shared cards and settlements.`)) return
    try {
      await api.delete(`/family/members/${userId}`)
      toast.success(`${memberName} removed`)
      loadFamily()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove member')
    }
  }

  if (loading) return null

  const family = familyInfo?.family || familyInfo
  if (!family) return null

  const isOwner = familyInfo.isOwner !== undefined ? familyInfo.isOwner : (family.userRole === 'OWNER')
  const currentUserId = familyInfo.currentUserId || familyInfo.userId
  const members = family.members || []

  return (
    <div className="card p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Users size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 leading-tight">Household & Family Sharing</h2>
            <p className="text-xs text-gray-500">Manage household members, invite codes, and shared settlements</p>
          </div>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </span>
      </div>

      {/* Household Name */}
      <div className="bg-gray-50 rounded-xl p-3.5 mb-4 border border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Household Name</span>
          {isOwner && !editingName && (
            <button
              onClick={() => setEditingName(true)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              <Pencil size={11} /> Rename
            </button>
          )}
        </div>
        {editingName ? (
          <form onSubmit={handleSaveName} className="flex gap-2 mt-2">
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              className="input text-xs font-semibold py-1.5 flex-1"
              required
            />
            <button type="submit" disabled={isRenaming} className="btn-primary py-1.5 text-xs">
              {isRenaming ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setEditingName(false); setNameInput(family.name); }}
              className="btn-secondary py-1.5 text-xs"
            >
              Cancel
            </button>
          </form>
        ) : (
          <p className="text-base font-bold text-gray-900">{family.name}</p>
        )}
      </div>

      {/* Invite Code */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Family Invite Code</span>
          <span className="text-xs text-indigo-500">Share with family members to join</span>
        </div>
        <div className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-indigo-200/70 shadow-sm">
          <span className="font-mono text-base font-black tracking-widest text-indigo-950">
            {family.inviteCode}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyInvite}
              className="btn-primary py-1 px-3 text-xs flex items-center gap-1"
            >
              <Copy size={12} />
              {copiedInvite ? 'Copied!' : 'Copy Code'}
            </button>
            {isOwner && (
              <button
                onClick={handleRegenerateInvite}
                title="Regenerate invite code"
                className="btn-secondary py-1 px-2 text-xs"
              >
                <RefreshCw size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Members List */}
      <div className="mb-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">Members ({members.length})</span>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {members.map(m => (
            <div key={m.id || m.userId} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                  {(m.name || m.user?.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {m.name || m.user?.name} {m.userId === currentUserId && <span className="text-gray-400 font-normal">(You)</span>}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">{m.email || m.user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  m.role === 'OWNER' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'
                }`}>
                  {m.role}
                </span>
                {isOwner && m.userId !== currentUserId && (
                  <button
                    onClick={() => handleRemoveMember(m.userId, m.name || m.user?.name)}
                    className="text-gray-400 hover:text-red-500 p-1 text-xs"
                    title="Remove member"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Join Another Family */}
      <div className="pt-3 border-t border-gray-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
          Join a Different Household
        </span>
        <form onSubmit={handleJoinFamily} className="flex gap-2">
          <input
            type="text"
            placeholder="Enter invite code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value)}
            className="input text-xs uppercase font-mono py-1.5 flex-1"
          />
          <button type="submit" disabled={isJoining || !joinCode.trim()} className="btn-secondary py-1.5 text-xs">
            {isJoining ? 'Joining…' : 'Join'}
          </button>
        </form>
      </div>
    </div>
  )
}

function CalendarSection() {
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleGetLink() {
    setLoading(true)
    try {
      const { data } = await api.get('/calendar/token')
      setToken(data.token)
    } catch {
      toast.error('Failed to generate calendar link')
    } finally {
      setLoading(false)
    }
  }

  const feedUrl = token ? `${window.location.origin}/api/calendar/feed?token=${token}` : null
  const webcalUrl = feedUrl?.replace(/^https?:/, 'webcal:')

  return (
    <div className="card p-6 mt-4">
      <h2 className="font-semibold text-gray-900 mb-1">Apple Calendar</h2>
      <p className="text-sm text-gray-500 mb-4">
        Subscribe to a live feed of your tasks with due dates. Syncs automatically — no setup needed beyond the first subscribe.
      </p>
      {!token ? (
        <button className="btn-secondary" onClick={handleGetLink} disabled={loading}>
          {loading ? 'Generating…' : 'Get calendar link'}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              className="input text-xs font-mono"
              value={feedUrl}
              onFocus={e => e.target.select()}
            />
            <button
              className="btn-secondary flex-shrink-0"
              onClick={() => { navigator.clipboard.writeText(feedUrl); toast.success('Copied!') }}
            >
              Copy
            </button>
          </div>
          <a href={webcalUrl} className="btn-primary inline-flex">
            Subscribe in Apple Calendar
          </a>
          <p className="text-xs text-gray-400">
            Works with any app that supports ICS subscriptions (Apple Calendar, Google Calendar, Outlook). Apple Calendar refreshes roughly every hour.
          </p>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { user, updateUser, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

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

      <HouseholdSection />

      {/* Change password */}
      <div className="card p-6 mb-4">
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

      <CalendarSection />

      {/* Sign out — visible on mobile where sidebar is hidden */}
      <div className="card p-5 mt-4 md:hidden">
        <h2 className="font-semibold text-gray-900 mb-1">Account</h2>
        <p className="text-sm text-gray-500 mb-4">Signed in as {user?.email}</p>
        <button onClick={handleLogout} className="btn-danger w-full justify-center">
          Sign out
        </button>
      </div>
    </div>
  )
}
