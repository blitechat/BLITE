import React, { useState, useMemo } from 'react'
import { Search, Hash, MessageSquare, Send, X } from 'lucide-react'
import Modal from '@renderer/components/common/Modal'
import { useMessageStore } from '@renderer/stores/messageStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { sendMessage } from '@renderer/services/socket'
import { encryptDM, encryptChannel, generateChannelKey, encryptKeyForUser } from '@renderer/services/crypto'
import { channelKeyAPI, serverAPI, keyAPI } from '@renderer/services/api'
import {
  getSession,
  saveSession,
  performX3DH,
  initSession as initRatchetSession,
  advanceSendChain,
  encryptWithMessageKey,
  getSenderKeyState,
  saveSenderKeyState,
  generateSenderKey,
  createSenderKeyState,
  advanceSenderChain,
  encryptWithSenderKey,
  distributeSenderKey,
} from '@renderer/services/e2ee'

export default function ForwardModal() {
  const forwardingMessage = useMessageStore((s) => s.forwardingMessage)
  const setForwardingMessage = useMessageStore((s) => s.setForwardingMessage)
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)

  const servers = useServerStore((s) => s.servers)
  const channelsMap = useServerStore((s) => s.channels)
  const dmChannels = useDMStore((s) => s.dmChannels)
  const user = useAuthStore((s) => s.user)
  const privateKey = useAuthStore((s) => s.privateKey)
  const keyBundleLoaded = useAuthStore((s) => s.keyBundleLoaded)

  const targets = useMemo(() => {
    const results: { id: string; name: string; type: 'channel' | 'dm'; serverId?: string }[] = []

    // Server channels
    for (const server of servers) {
      const channels = channelsMap[server.id] || []
      for (const ch of channels) {
        if (ch.type === 'text') {
          results.push({ id: ch.id, name: `${server.name} > #${ch.name}`, type: 'channel', serverId: server.id })
        }
      }
    }

    // DM channels
    for (const dm of dmChannels) {
      const other = dm.participants?.find((p) => p.id !== user?.id)
      if (other) {
        results.push({ id: dm.id, name: `@${other.displayName || other.username}`, type: 'dm' })
      }
    }

    if (!search) return results
    const q = search.toLowerCase()
    return results.filter((t) => t.name.toLowerCase().includes(q))
  }, [servers, channelsMap, dmChannels, user, search])

  if (!forwardingMessage) return null

  const content = forwardingMessage.content || '[Encrypted]'

  const handleForward = async (target: typeof targets[0]) => {
    if (!user || !privateKey || sending) return
    setSending(true)

    const forwardedText = `> Forwarded:\n${content}`

    try {
      if (target.type === 'dm') {
        const dm = dmChannels.find((d) => d.id === target.id)
        const otherUser = dm?.participants?.find((p) => p.id !== user.id)
        if (!otherUser?.publicKey) return

        // Try v2 ratchet, fallback to v1
        if (keyBundleLoaded) {
          try {
            let session = await getSession(otherUser.id)
            if (!session) {
              const bundle = await keyAPI.getBundle(otherUser.id)
              const x3dhResult = await performX3DH({
                myIdentitySecret: privateKey,
                recipientBundle: bundle,
              })
              session = await initRatchetSession(
                `${user.id}:${otherUser.id}`,
                otherUser.id,
                x3dhResult.sharedSecret,
                true
              )
              await saveSession(session)
              const { messageKey, session: updated } = await advanceSendChain(session)
              const { encrypted, nonce } = encryptWithMessageKey(forwardedText, messageKey)
              await saveSession(updated)
              const v2Nonce = JSON.stringify({ v: 2, n: nonce, c: updated.sendCounter - 1, sid: session.sessionId, ek: x3dhResult.ephemeralPublicKey, otk: x3dhResult.usedOtpKeyId })
              sendMessage(target.id, encrypted, v2Nonce, 'text', undefined, forwardedText)
              setForwardingMessage(null)
              return
            }
            if (session) {
              const { messageKey, session: updated } = await advanceSendChain(session)
              const { encrypted, nonce } = encryptWithMessageKey(forwardedText, messageKey)
              await saveSession(updated)
              const v2Nonce = JSON.stringify({ v: 2, n: nonce, c: updated.sendCounter - 1, sid: session.sessionId })
              sendMessage(target.id, encrypted, v2Nonce, 'text', undefined, forwardedText)
              setForwardingMessage(null)
              return
            }
          } catch { /* fall through to v1 */ }
        }

        const result = encryptDM(forwardedText, otherUser.publicKey, privateKey)
        sendMessage(target.id, result.encrypted, result.nonce, 'text', undefined, forwardedText)
      } else {
        // Channel message - use sender keys or legacy
        if (keyBundleLoaded && target.serverId) {
          try {
            let senderState = await getSenderKeyState(target.id, user.id)
            if (!senderState) {
              const senderKey = generateSenderKey()
              senderState = createSenderKeyState(target.id, user.id, senderKey)
              const memberList = await serverAPI.getMembers(target.serverId)
              const memberData = memberList
                .filter((m) => m.user?.publicKey && m.userId !== user.id)
                .map((m) => ({ id: m.userId, publicKey: m.user!.publicKey }))
              const keys = distributeSenderKey(senderKey, memberData, privateKey)
              if (keys.length > 0) await channelKeyAPI.setKeys(target.id, keys)
              await saveSenderKeyState(senderState)
            }
            const { messageKey, state: updated } = await advanceSenderChain(senderState)
            const { encrypted, nonce } = encryptWithSenderKey(forwardedText, messageKey)
            await saveSenderKeyState(updated)
            const v2Nonce = JSON.stringify({ v: 2, n: nonce, c: updated.counter - 1, sk: true, sid: user.id })
            sendMessage(target.id, encrypted, v2Nonce, 'text', undefined, forwardedText)
            setForwardingMessage(null)
            return
          } catch { /* fall through */ }
        }

        // v1 fallback
        const channelKey = generateChannelKey()
        const result = encryptChannel(forwardedText, channelKey)
        sendMessage(target.id, result.encrypted, result.nonce, 'text', undefined, forwardedText)
      }

      setForwardingMessage(null)
    } catch (err) {
      console.error('Failed to forward message:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal title="Forward Message" onClose={() => setForwardingMessage(null)} width="max-w-md">
      {/* Preview */}
      <div className="p-3 glass rounded-lg mb-3">
        <p className="text-xs text-blite-text-muted mb-1">Message to forward:</p>
        <p className="text-sm text-blite-text-primary line-clamp-3">{content}</p>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-blite-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search channels or DMs..."
          className="input-field pl-9 text-sm"
          autoFocus
        />
      </div>

      {/* Target list */}
      <div className="max-h-64 overflow-y-auto space-y-0.5">
        {targets.map((target) => (
          <button
            key={target.id}
            onClick={() => handleForward(target)}
            disabled={sending}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary transition-colors"
          >
            {target.type === 'channel' ? (
              <Hash size={14} className="text-blite-text-muted flex-shrink-0" />
            ) : (
              <MessageSquare size={14} className="text-blite-text-muted flex-shrink-0" />
            )}
            <span className="truncate">{target.name}</span>
            <Send size={12} className="ml-auto text-blite-text-muted flex-shrink-0" />
          </button>
        ))}
        {targets.length === 0 && (
          <p className="text-sm text-blite-text-muted text-center py-4">No matching channels or DMs.</p>
        )}
      </div>
    </Modal>
  )
}
