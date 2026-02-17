import React, { useState, useEffect, useRef, FormEvent } from 'react'
import { UserPlus, Loader2, Check, Search } from 'lucide-react'
import Modal from '@renderer/components/common/Modal'
import UserAvatar from '@renderer/components/user/UserAvatar'
import { useUIStore } from '@renderer/stores/uiStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useFriendStore } from '@renderer/stores/friendStore'
import { friendAPI, userAPI } from '@renderer/services/api'
import type { UserProfile } from '@shared/types'

export default function AddFriendModal() {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchResults, setSearchResults] = useState<UserProfile[]>([])
  const [searching, setSearching] = useState(false)
  const closeModal = useUIStore((s) => s.closeModal)
  const currentUser = useAuthStore((s) => s.user)
  const addFriend = useFriendStore((s) => s.addFriend)
  const addOutgoingRequest = useFriendStore((s) => s.addOutgoingRequest)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (username.trim().length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const users = await userAPI.search(username.trim())
        setSearchResults(users.filter((u) => u.id !== currentUser?.id))
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [username, currentUser?.id])

  const handleSendRequest = async (targetUsername: string) => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const result = await friendAPI.sendRequest(targetUsername)

      if (result.autoAccepted && result.friendship) {
        addFriend(result.friendship)
        setSuccess(`You are now friends with ${targetUsername}!`)
      } else if (result.request) {
        addOutgoingRequest(result.request)
        setSuccess(`Friend request sent to ${targetUsername}!`)
      }

      setUsername('')
      setSearchResults([])
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send friend request.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return
    await handleSendRequest(username.trim())
  }

  return (
    <Modal title="Add Friend" onClose={closeModal}>
      {error && (
        <div className="mb-4 p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 rounded-md bg-blite-success/10 border border-blite-success/30 text-blite-success text-sm flex items-center gap-2">
          <Check size={14} />
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-lg gradient-accent flex items-center justify-center mx-auto mb-3 glow-accent">
            <UserPlus size={22} className="text-white" />
          </div>
          <p className="text-sm text-blite-text-secondary">
            Search for a user or enter a username to send a friend request.
          </p>
        </div>

        <div className="relative">
          <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
            Username
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-blite-text-muted" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field font-mono pl-9"
              placeholder="Search or enter username"
              autoFocus
            />
            {searching && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blite-text-muted" />
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-blite-glass-border bg-blite-bg-secondary">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSendRequest(user.username)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blite-bg-hover transition-colors text-left"
                >
                  <UserAvatar
                    username={user.displayName || user.username}
                    avatarUrl={user.avatarUrl}
                    size="sm"
                    showStatus={false}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-blite-text-primary truncate">
                      {user.displayName || user.username}
                    </p>
                    <p className="text-xs text-blite-text-muted font-mono truncate">@{user.username}</p>
                  </div>
                  <UserPlus size={14} className="text-blite-text-muted flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={closeModal} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!username.trim() || loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Sending...
              </>
            ) : (
              'Send Request'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
