import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Plus, Send, X, FileIcon, Image, Smile, Reply, Clock } from 'lucide-react'
import { useAuthStore } from '@renderer/stores/authStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { useMessageStore } from '@renderer/stores/messageStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { sendMessage, startTyping, stopTyping } from '@renderer/services/socket'
import { encryptDM, encryptChannel, generateChannelKey, encryptKeyForUser } from '@renderer/services/crypto'
import { channelKeyAPI, serverAPI, keyAPI, uploadAPI } from '@renderer/services/api'
import { encryptFile } from '@renderer/services/fileEncryption'
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
  createCanonicalSessionId,
  isCanonicalInitiator,
} from '@renderer/services/e2ee'
import { cacheSentMessageById } from '@renderer/hooks/useMessages'
import EmojiPicker from '@renderer/components/common/EmojiPicker'
import MentionAutocomplete from './MentionAutocomplete'
import VoiceRecorder from './VoiceRecorder'
import ScheduleModal from './ScheduleModal'

interface MessageInputProps {
  channelId: string | null
  channelName?: string
  isDM?: boolean
}

const MAX_LENGTH = 4000
const TYPING_TIMEOUT = 3000

// Cache for channel keys (legacy symmetric encryption)
const channelKeyCache: Record<string, Uint8Array> = {}

export default function MessageInput({ channelId, channelName, isDM = false }: MessageInputProps) {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  const user = useAuthStore((s) => s.user)
  const privateKey = useAuthStore((s) => s.privateKey)
  const keyBundleLoaded = useAuthStore((s) => s.keyBundleLoaded)
  const dmChannels = useDMStore((s) => s.dmChannels)
  const replyingTo = useMessageStore((s) => channelId ? s.replyingTo[channelId] : null)
  const setReplyingTo = useMessageStore((s) => s.setReplyingTo)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const members = useServerStore((s) => activeServerId ? s.members[activeServerId] || [] : [])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
    }
  }, [content])

  // Reset on channel change
  useEffect(() => {
    setContent('')
    setFiles([])
    setMentionQuery(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [channelId])

  const handleTyping = useCallback(() => {
    if (!channelId) return

    if (!isTypingRef.current) {
      isTypingRef.current = true
      startTyping(channelId)
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (channelId) {
        stopTyping(channelId)
      }
      isTypingRef.current = false
    }, TYPING_TIMEOUT)
  }, [channelId])

  /**
   * Encrypt a DM message using v2 ratchet protocol if possible, fallback to v1
   */
  const encryptDMMessage = async (
    text: string,
    otherUser: { id: string; publicKey: string; signingKey?: string | null }
  ): Promise<{ encrypted: string; nonce: string } | null> => {
    if (!privateKey || !user) return null

    // Try v2 ratchet protocol
    if (keyBundleLoaded) {
      try {
        let session = await getSession(otherUser.id)

        if (!session) {
          // No session yet - try X3DH
          try {
            const bundle = await keyAPI.getBundle(otherUser.id)
            const x3dhResult = await performX3DH({
              myIdentitySecret: privateKey,
              recipientBundle: bundle,
            })
            // Use canonical session ID and initiator flag so both parties have the same session
            const sessionId = createCanonicalSessionId(user.id, otherUser.id)
            const amInitiator = isCanonicalInitiator(user.id, otherUser.id)
            session = await initRatchetSession(
              sessionId,
              otherUser.id,
              x3dhResult.sharedSecret,
              amInitiator
            )
            await saveSession(session)

            // First message includes X3DH handshake info
            const { messageKey, session: updatedSession } = await advanceSendChain(session)
            const { encrypted, nonce } = encryptWithMessageKey(text, messageKey)
            await saveSession(updatedSession)

            const v2Nonce = JSON.stringify({
              v: 2,
              n: nonce,
              c: updatedSession.sendCounter - 1,
              sid: session.sessionId,
              ek: x3dhResult.ephemeralPublicKey,
              otk: x3dhResult.usedOtpKeyId,
            })

            return { encrypted, nonce: v2Nonce }
          } catch {
            // X3DH failed (no bundle for recipient) - fall back to v1
          }
        }

        if (session) {
          const { messageKey, session: updatedSession } = await advanceSendChain(session)
          const { encrypted, nonce } = encryptWithMessageKey(text, messageKey)
          await saveSession(updatedSession)

          const v2Nonce = JSON.stringify({
            v: 2,
            n: nonce,
            c: updatedSession.sendCounter - 1,
            sid: session.sessionId,
          })

          return { encrypted, nonce: v2Nonce }
        }
      } catch (err) {
        console.error('v2 DM encryption failed, falling back to v1:', err)
      }
    }

    // Fallback to v1 (legacy nacl.box) - always works if we have keys
    try {
      return encryptDM(text, otherUser.publicKey, privateKey)
    } catch (err) {
      console.error('Failed to encrypt DM:', err)
      return null
    }
  }

  /**
   * Encrypt a channel message using v2 sender keys if possible, fallback to v1 symmetric
   */
  const encryptChannelMessage = async (
    text: string
  ): Promise<{ encrypted: string; nonce: string } | null> => {
    if (!privateKey || !user || !channelId) return null

    // Try v2 sender key protocol
    if (keyBundleLoaded) {
      try {
        let senderState = await getSenderKeyState(channelId, user.id)

        // Check if existing sender key needs refresh (e.g. our public key changed since creation)
        // If the state has no originalKey, it predates the fix and should be regenerated
        if (senderState && !senderState.originalKey) {
          console.log('[Encrypt] Sender key state missing originalKey — regenerating')
          senderState = null
        }

        if (!senderState) {
          // Generate and distribute a sender key
          const senderKey = generateSenderKey()
          senderState = createSenderKeyState(channelId, user.id, senderKey)

          // Get channel members and distribute
          if (activeServerId) {
            try {
              const memberList = await serverAPI.getMembers(activeServerId)
              const memberData = memberList
                .filter((m) => m.user?.publicKey && m.userId !== user.id)
                .map((m) => ({ id: m.userId, publicKey: m.user!.publicKey }))

              const keys = distributeSenderKey(senderKey, memberData, privateKey)
              if (keys.length > 0) {
                await channelKeyAPI.setKeys(channelId, keys, user.id)
              }
            } catch (err) {
              console.error('Failed to distribute sender key:', err)
            }
          }

          await saveSenderKeyState(senderState)
        }

        const { messageKey, state: updatedState } = await advanceSenderChain(senderState)
        const { encrypted, nonce } = encryptWithSenderKey(text, messageKey)
        await saveSenderKeyState(updatedState)

        const v2Nonce = JSON.stringify({
          v: 2,
          n: nonce,
          c: updatedState.counter - 1,
          sk: true,
          sid: user.id,
        })

        return { encrypted, nonce: v2Nonce }
      } catch (err) {
        console.error('v2 channel encryption failed, falling back to v1:', err)
      }
    }

    // Fallback to v1 (legacy channel symmetric key)
    try {
      let channelKey = channelKeyCache[channelId]
      if (!channelKey) {
        // Try to fetch existing key
        try {
          const keyData = await channelKeyAPI.getKey(channelId)
          if (keyData?.encryptedKey) {
            const parts = keyData.encryptedKey.split(':')
            if (parts.length === 2) {
              const { decryptKeyForUser } = await import('@renderer/services/crypto')
              channelKey = decryptKeyForUser(parts[0], parts[1], user.publicKey, privateKey)
              channelKeyCache[channelId] = channelKey
            }
          }
        } catch {
          // No key exists yet
        }

        if (!channelKey) {
          // Generate new channel key and distribute
          channelKey = generateChannelKey()
          channelKeyCache[channelId] = channelKey

          if (activeServerId) {
            try {
              const memberList = await serverAPI.getMembers(activeServerId)
              const keys = memberList
                .filter((m) => m.user?.publicKey)
                .map((m) => {
                  const result = encryptKeyForUser(channelKey!, m.user!.publicKey, privateKey)
                  return {
                    userId: m.userId,
                    encryptedKey: `${result.encrypted}:${result.nonce}`,
                  }
                })
              if (keys.length > 0) {
                await channelKeyAPI.setKeys(channelId, keys)
              }
            } catch (err) {
              console.error('Failed to distribute channel key:', err)
            }
          }
        }
      }

      return encryptChannel(text, channelKey)
    } catch (err) {
      console.error('Failed to encrypt channel message:', err)
      return null
    }
  }

  const handleSubmit = async () => {
    if ((!content.trim() && files.length === 0) || !channelId || sending) return

    // Validate encryption keys are available
    if (!privateKey) {
      alert('Encryption keys not loaded. This usually happens after logout. Please:\n\n1. Click your avatar in the top-right\n2. Click "Log Out"\n3. Log back in\n4. Enter your recovery key when prompted\n\nIf you don\'t have your recovery key, you may need to create new keys (you\'ll lose access to old messages).')
      return
    }

    setSending(true)

    // Stop typing indicator
    if (isTypingRef.current) {
      stopTyping(channelId)
      isTypingRef.current = false
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }

    const replyToId = replyingTo?.id

    try {
      // Handle file uploads first (encrypt files client-side before upload)
      for (const file of files) {
        try {
          const encResult = await encryptFile(file)
          const uploadResult = await uploadAPI.uploadEncrypted(encResult.encryptedBlob)

          const metadata = JSON.stringify({
            encrypted: true,
            url: uploadResult.url,
            key: encResult.key,
            iv: encResult.iv,
            filename: encResult.filename,
            mimetype: encResult.mimetype,
            size: encResult.size,
          })

          let result: { encrypted: string; nonce: string } | null = null

          if (isDM) {
            const dm = dmChannels.find((d) => d.id === channelId)
            const otherUser = dm?.participants?.find((p) => p.id !== user?.id)
            if (otherUser && otherUser.publicKey && privateKey) {
              result = await encryptDMMessage(metadata, otherUser)
            }
          } else {
            result = await encryptChannelMessage(metadata)
          }

          if (result) {
            sendMessage(channelId, result.encrypted, result.nonce, 'file', undefined, metadata)
          }
        } catch (err) {
          console.error('Failed to upload file:', err)
        }
      }

      // Handle text message
      if (content.trim()) {
        const plaintext = content.trim()
        let result: { encrypted: string; nonce: string } | null = null

        if (isDM) {
          const dm = dmChannels.find((d) => d.id === channelId)
          const otherUser = dm?.participants?.find((p) => p.id !== user?.id)

          if (!otherUser?.publicKey || !privateKey) {
            alert('Cannot send message: encryption keys are not available for this conversation. Please try refreshing.')
            return
          }

          result = await encryptDMMessage(plaintext, otherUser)
        } else {
          result = await encryptChannelMessage(plaintext)
        }

        if (result) {
          sendMessage(channelId, result.encrypted, result.nonce, 'text', replyToId, plaintext)
        } else {
          alert('Failed to encrypt message. Please try logging out and back in to restore your encryption keys.')
          return
        }
      }

      setContent('')
      setFiles([])
      if (channelId) setReplyingTo(channelId, null)
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape' && replyingTo && channelId) {
      setReplyingTo(channelId, null)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (value.length <= MAX_LENGTH) {
      setContent(value)
      handleTyping()

      // Detect @mention
      const cursorPos = e.target.selectionStart || 0
      const textBefore = value.slice(0, cursorPos)
      const mentionMatch = textBefore.match(/@(\w*)$/)
      if (mentionMatch && !isDM) {
        setMentionQuery(mentionMatch[1])
      } else {
        setMentionQuery(null)
      }
    }
  }

  const handleMentionSelect = (username: string) => {
    const cursorPos = textareaRef.current?.selectionStart || content.length
    const textBefore = content.slice(0, cursorPos)
    const textAfter = content.slice(cursorPos)
    const mentionMatch = textBefore.match(/@(\w*)$/)
    if (mentionMatch) {
      const newBefore = textBefore.slice(0, mentionMatch.index) + `@${username} `
      setContent(newBefore + textAfter)
    }
    setMentionQuery(null)
    textareaRef.current?.focus()
  }

  const handleEmojiSelect = (emoji: string) => {
    setContent((prev) => prev + emoji)
    setShowEmojiPicker(false)
    textareaRef.current?.focus()
  }

  const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
  const ALLOWED_FILE_TYPES = [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/ogg', 'audio/wav',
    'application/pdf',
    'text/plain',
    'application/zip', 'application/x-tar', 'application/gzip',
  ]

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const validFiles: File[] = []
    const errors: string[] = []

    for (const file of selectedFiles) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: exceeds 25 MB limit`)
        continue
      }
      if (ALLOWED_FILE_TYPES.length > 0 && !ALLOWED_FILE_TYPES.includes(file.type)) {
        errors.push(`${file.name}: file type not allowed (${file.type || 'unknown'})`)
        continue
      }
      validFiles.push(file)
    }

    if (errors.length > 0) {
      alert('Some files were rejected:\n' + errors.join('\n'))
    }

    setFiles((prev) => [...prev, ...validFiles].slice(0, 10))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const charsRemaining = MAX_LENGTH - content.length
  const showCharWarning = charsRemaining < 200

  if (!channelId) return null

  return (
    <div className="px-4 pb-4">
      {/* Reply preview */}
      {replyingTo && (
        <div className="flex items-center gap-2 mb-1 px-3.5 py-2 glass rounded-t-lg border-b-0">
          <Reply size={15} className="text-neon-cyan flex-shrink-0" />
          <span className="text-sm text-blite-text-muted">Replying to</span>
          <span className="text-sm font-medium text-neon-cyan">
            {replyingTo.sender?.displayName || 'Unknown'}
          </span>
          <span className="text-sm text-blite-text-muted truncate flex-1">
            {replyingTo.content || replyingTo.encryptedContent}
          </span>
          <button
            onClick={() => channelId && setReplyingTo(channelId, null)}
            className="flex-shrink-0 text-blite-text-muted hover:text-blite-text-primary transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className={`flex flex-wrap gap-2 mb-2 p-3 glass ${replyingTo ? '' : 'rounded-t-lg'} border-b-0`}>
          {files.map((file, index) => (
            <div
              key={index}
              className="relative flex items-center gap-2 px-3 py-2 bg-blite-bg-hover rounded-md border border-blite-glass-border max-w-[200px]"
            >
              {file.type.startsWith('image/') ? (
                <Image size={16} className="text-blite-gradient-start flex-shrink-0" />
              ) : (
                <FileIcon size={16} className="text-blite-text-muted flex-shrink-0" />
              )}
              <span className="text-xs text-blite-text-secondary truncate">{file.name}</span>
              <button
                onClick={() => removeFile(index)}
                className="flex-shrink-0 p-0.5 rounded text-blite-text-muted hover:text-blite-danger hover:bg-blite-danger/10 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className={`relative flex items-end glass ${files.length > 0 || replyingTo ? 'rounded-b-lg' : 'rounded-lg'}`}>
        {/* Mention autocomplete */}
        {mentionQuery !== null && members.length > 0 && (
          <MentionAutocomplete
            query={mentionQuery}
            members={members}
            onSelect={handleMentionSelect}
          />
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0 p-3 text-blite-text-muted hover:text-blite-text-primary transition-colors"
          title="Attach file"
        >
          <Plus size={22} />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isDM ? `Message @${channelName || 'user'}` : `Message #${channelName || 'channel'}`}
          className="flex-1 bg-transparent text-blite-text-primary placeholder-blite-text-muted py-3 px-2 resize-none max-h-[200px] focus:outline-none text-[15px] leading-relaxed"
          rows={1}
          disabled={sending}
        />

        <div className="flex items-center flex-shrink-0 px-2 pb-2 gap-1">
          {showCharWarning && (
            <span className={`text-xs font-mono ${charsRemaining < 50 ? 'text-blite-danger' : 'text-blite-warning'}`}>
              {charsRemaining}
            </span>
          )}

          {/* Voice recorder */}
          <VoiceRecorder onSend={async (file) => {
            if (!channelId || !privateKey || !user) return
            try {
              const encResult = await encryptFile(file)
              const uploadResult = await uploadAPI.uploadEncrypted(encResult.encryptedBlob)

              const metadata = JSON.stringify({
                encrypted: true,
                url: uploadResult.url,
                key: encResult.key,
                iv: encResult.iv,
                filename: encResult.filename,
                mimetype: encResult.mimetype,
                size: encResult.size,
              })

              let result: { encrypted: string; nonce: string } | null = null
              if (isDM) {
                const dm = dmChannels.find((d) => d.id === channelId)
                const otherUser = dm?.participants?.find((p) => p.id !== user.id)
                if (otherUser?.publicKey) {
                  result = await encryptDMMessage(metadata, otherUser)
                }
              } else {
                result = await encryptChannelMessage(metadata)
              }
              if (result) {
                sendMessage(channelId, result.encrypted, result.nonce, 'file', undefined, metadata)
              }
            } catch (err) {
              console.error('Failed to send voice message:', err)
            }
          }} />

          {/* Emoji picker button */}
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2 rounded-lg text-blite-text-muted hover:text-blite-text-primary transition-colors"
              title="Emoji"
            >
              <Smile size={20} />
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-10 right-0 z-50">
                <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
              </div>
            )}
          </div>

          {/* Schedule button */}
          {content.trim() && (
            <button
              onClick={() => setShowScheduleModal(true)}
              className="p-2 rounded-lg text-blite-text-muted hover:text-blite-text-primary transition-colors"
              title="Schedule message"
            >
              <Clock size={20} />
            </button>
          )}

          <button
            onClick={handleSubmit}
            disabled={(!content.trim() && files.length === 0) || sending}
            className={`p-2 rounded-lg transition-all ${
              content.trim() || files.length > 0
                ? 'gradient-accent text-white glow-accent-sm'
                : 'text-blite-text-muted cursor-not-allowed'
            }`}
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Schedule Modal */}
      {showScheduleModal && channelId && (
        <ScheduleModal
          channelId={channelId}
          content={content.trim()}
          isDM={isDM}
          onClose={() => setShowScheduleModal(false)}
          onScheduled={() => setContent('')}
        />
      )}
    </div>
  )
}
