import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Edit, Trash2, Reply, Smile, Pin, Lock, Timer, Forward, Download, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import UserAvatar from '@renderer/components/user/UserAvatar'
import UserPopover from '@renderer/components/user/UserPopover'
import MarkdownRenderer from './MarkdownRenderer'
import ReactionBar from './ReactionBar'
import LinkPreview from './LinkPreview'
import EmojiPicker from '@renderer/components/common/EmojiPicker'
import AudioPlayer from './AudioPlayer'
import { useAuthStore } from '@renderer/stores/authStore'
import { usePresenceStore } from '@renderer/stores/presenceStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { useMessageStore } from '@renderer/stores/messageStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { deleteMessage as socketDeleteMessage, editMessage as socketEditMessage, addReaction } from '@renderer/services/socket'
import { pinAPI } from '@renderer/services/api'
import { encryptDM, encryptChannel } from '@renderer/services/crypto'
import { getAssetUrl } from '@renderer/services/config'
import { parseEncryptedFileMetadata, decryptFile } from '@renderer/services/fileEncryption'
import type { EncryptedFileMetadata } from '@renderer/services/fileEncryption'
import type { Message } from '@shared/types'

interface MessageItemProps {
  message: Message
  compact?: boolean
  isFirstInGroup?: boolean
  channelKey?: Uint8Array | null
  isDM?: boolean
  recipientPublicKey?: string
}

const URL_REGEX = /https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/g

const MessageItem = React.memo(function MessageItem({
  message,
  compact = false,
  isFirstInGroup = true,
  channelKey,
  isDM = false,
  recipientPublicKey,
}: MessageItemProps) {
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content || '')
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null)
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptError, setDecryptError] = useState(false)
  const decryptedUrlRef = useRef<string | null>(null)
  const currentUser = useAuthStore((s) => s.user)
  const privateKey = useAuthStore((s) => s.privateKey)
  const presences = usePresenceStore((s) => s.presences)
  const showContextMenu = useUIStore((s) => s.showContextMenu)
  const setReplyingTo = useMessageStore((s) => s.setReplyingTo)
  const blockedUserIds = useServerStore((s) => s.blockedUserIds)

  // When emoji picker closes, allow hover state to clear
  useEffect(() => {
    if (!showEmojiPicker) {
      // Use a microtask so the click handler fires first
      const id = setTimeout(() => setHovered(false), 100)
      return () => clearTimeout(id)
    }
  }, [showEmojiPicker])

  // Parse encrypted file metadata (null for legacy plain URLs)
  const encryptedFileMeta = useMemo<EncryptedFileMetadata | null>(
    () => message.type === 'file' ? parseEncryptedFileMetadata(message.content || '') : null,
    [message.content, message.type]
  )

  // Decrypt encrypted file attachments
  useEffect(() => {
    if (!encryptedFileMeta) return

    let cancelled = false
    setIsDecrypting(true)
    setDecryptError(false)

    const fetchAndDecrypt = async () => {
      try {
        const assetUrl = getAssetUrl(encryptedFileMeta.url)
        const response = await fetch(assetUrl)
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
        const encryptedData = await response.arrayBuffer()

        if (cancelled) return

        const objectUrl = await decryptFile(
          encryptedData,
          encryptedFileMeta.key,
          encryptedFileMeta.iv,
          encryptedFileMeta.mimetype,
          encryptedFileMeta.url
        )

        if (cancelled) {
          // Don't revoke — it's in the cache
          return
        }

        decryptedUrlRef.current = objectUrl
        setDecryptedUrl(objectUrl)
      } catch (err) {
        console.error('Failed to decrypt file:', err)
        if (!cancelled) setDecryptError(true)
      } finally {
        if (!cancelled) setIsDecrypting(false)
      }
    }

    fetchAndDecrypt()

    return () => {
      cancelled = true
    }
  }, [encryptedFileMeta])

  const isOwn = currentUser?.id === message.senderId
  const senderName = message.sender?.displayName || message.sender?.username || 'Unknown'
  const senderStatus = presences[message.senderId] || 'offline'

  // Check if sender is blocked
  if (blockedUserIds.has(message.senderId)) {
    return (
      <div className="flex items-center justify-center py-1 px-4">
        <span className="text-xs text-blite-text-muted italic">Message from blocked user</span>
      </div>
    )
  }

  // System messages
  if (message.type === 'system') {
    return (
      <div className="flex items-center justify-center py-1 px-4">
        <span className="text-xs text-blite-text-muted italic">{message.content}</span>
      </div>
    )
  }

  const handleDelete = () => {
    socketDeleteMessage(message.id)
  }

  const handleEditSave = () => {
    if (!editContent.trim() || editContent === message.content) {
      setEditing(false)
      return
    }

    try {
      let encrypted: string
      let nonce: string

      if (isDM && recipientPublicKey && privateKey) {
        const result = encryptDM(editContent, recipientPublicKey, privateKey)
        encrypted = result.encrypted
        nonce = result.nonce
      } else if (isDM) {
        return
      } else if (channelKey) {
        // Channel messages: encrypt with channel key
        const result = encryptChannel(editContent, channelKey)
        encrypted = result.encrypted
        nonce = result.nonce
      } else {
        // No channel key available - cannot safely edit
        console.error('Cannot edit message: no encryption key available')
        return
      }

      socketEditMessage(message.id, encrypted, nonce)
      setEditing(false)
    } catch (err) {
      console.error('Failed to encrypt edit:', err)
    }
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEditSave()
    }
    if (e.key === 'Escape') {
      setEditing(false)
      setEditContent(message.content || '')
    }
  }

  const setForwardingMessage = useMessageStore((s) => s.setForwardingMessage)

  const handleReply = () => {
    setReplyingTo(message.channelId, message)
  }

  const handleForward = () => {
    setForwardingMessage(message)
  }

  const handlePin = async () => {
    try {
      if (message.isPinned) {
        await pinAPI.unpin(message.channelId, message.id)
      } else {
        await pinAPI.pin(message.channelId, message.id)
      }
    } catch (err) {
      console.error('Failed to pin/unpin:', err)
    }
  }

  const handleEmojiSelect = (emoji: string) => {
    addReaction(message.id, message.channelId, emoji)
    setShowEmojiPicker(false)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const items = []
    items.push({
      label: 'Reply',
      onClick: handleReply,
    })
    items.push({
      label: 'Forward',
      onClick: handleForward,
    })
    if (isOwn) {
      items.push({
        label: 'Edit Message',
        onClick: () => setEditing(true),
      })
      items.push({
        label: 'Delete Message',
        danger: true,
        onClick: handleDelete,
      })
    }
    items.push({
      label: message.isPinned ? 'Unpin Message' : 'Pin Message',
      onClick: handlePin,
    })
    if (items.length > 0) {
      showContextMenu(e.clientX, e.clientY, items)
    }
  }

  const handleAvatarClick = (e: React.MouseEvent) => {
    if (message.sender) {
      setPopover({ x: e.clientX, y: e.clientY })
    }
  }

  const timestamp = format(new Date(message.createdAt), 'h:mm a')
  const fullTimestamp = format(new Date(message.createdAt), 'MMMM d, yyyy h:mm a')

  // Check for image attachments in content
  const isImageUrl = (text: string): boolean => {
    return /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(text)
  }

  const isAudioUrl = (text: string): boolean => {
    return /\.(webm|ogg|mp3|wav|m4a)(\?.*)?$/i.test(text)
  }

  const contentText = message.content || '[Encrypted]'

  // Extract URLs for link previews
  const urls = useMemo(() => {
    if (isImageUrl(contentText)) return []
    const matches = contentText.match(URL_REGEX)
    return matches ? [...new Set(matches)].slice(0, 3) : []
  }, [contentText])

  // Reply preview content
  const replyToContent = message.replyTo?.content || message.replyTo?.encryptedContent || ''
  const replyToSender = message.replyTo?.sender?.displayName || 'Unknown'

  return (
    <>
      <div
        className={`group relative flex px-4 hover:bg-blite-bg-hover/50 transition-colors ${isFirstInGroup ? 'mt-3 pt-1' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { if (!showEmojiPicker) setHovered(false) }}
        onContextMenu={handleContextMenu}
      >
        {/* Avatar / timestamp gutter */}
        <div className="w-10 flex-shrink-0 mr-3">
          {isFirstInGroup && !compact ? (
            <button onClick={handleAvatarClick} className="mt-0.5">
              <UserAvatar
                username={senderName}
                avatarUrl={message.sender?.avatarUrl}
                status={senderStatus}
                size="sm"
                showStatus={false}
              />
            </button>
          ) : (
            <span
              className="hidden group-hover:flex items-center justify-center h-full text-[10px] text-blite-text-muted select-none leading-[22px]"
              title={fullTimestamp}
            >
              {format(new Date(message.createdAt), 'h:mm')}
            </span>
          )}
        </div>

        {/* Message content */}
        <div className="flex-1 min-w-0 py-0.5">
          {/* Header: name + timestamp (first in group only) */}
          {isFirstInGroup && !compact && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <button
                onClick={handleAvatarClick}
                className={`text-sm font-semibold hover:underline ${isOwn ? 'gradient-accent-text' : 'text-blite-text-primary'}`}
              >
                {senderName}
              </button>
              <span className="text-[11px] text-blite-text-muted" title={fullTimestamp}>
                {timestamp}
              </span>
              {message.nonce && (
                <Lock size={10} className="text-blite-text-muted/50" />
              )}
              {message.isPinned && (
                <Pin size={10} className="text-neon-cyan/60" />
              )}
              {message.editedAt && (
                <span
                  className="text-[11px] text-blite-text-muted"
                  title={`Edited ${format(new Date(message.editedAt), 'MMMM d, yyyy h:mm a')}`}
                >
                  (edited)
                </span>
              )}
            </div>
          )}

          {/* Reply preview */}
          {message.replyTo && (
            <div className="flex items-center gap-1.5 mb-1 px-2.5 py-1 rounded bg-blite-bg-hover/60 border-l-2 border-neon-cyan/40 max-w-lg">
              <Reply size={12} className="text-blite-text-muted flex-shrink-0" />
              <span className="text-xs font-medium text-neon-cyan flex-shrink-0">{replyToSender}</span>
              <span className="text-xs text-blite-text-muted truncate">{replyToContent}</span>
            </div>
          )}

          {editing ? (
            <div className="max-w-2xl">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="input-field text-sm resize-none w-full"
                rows={2}
                autoFocus
              />
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-blite-text-muted">
                  escape to{' '}
                  <button onClick={() => setEditing(false)} className="gradient-accent-text hover:opacity-80">
                    cancel
                  </button>
                  {' '} enter to{' '}
                  <button onClick={handleEditSave} className="gradient-accent-text hover:opacity-80">
                    save
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <div className="chat-message">
              {encryptedFileMeta ? (
                // Encrypted file — decrypt and render by mimetype
                isDecrypting ? (
                  <div className="flex items-center gap-2 text-blite-text-muted text-sm py-2">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Decrypting {encryptedFileMeta.filename}...</span>
                  </div>
                ) : decryptError ? (
                  <div className="text-blite-danger text-sm py-1">
                    Failed to decrypt file: {encryptedFileMeta.filename}
                  </div>
                ) : decryptedUrl && encryptedFileMeta.mimetype.startsWith('image/') ? (
                  <div>
                    <img
                      src={decryptedUrl}
                      alt={encryptedFileMeta.filename}
                      className="max-w-md max-h-80 rounded-lg"
                      loading="lazy"
                    />
                  </div>
                ) : decryptedUrl && encryptedFileMeta.mimetype.startsWith('audio/') ? (
                  <div className="max-w-xs">
                    <AudioPlayer src={decryptedUrl} />
                  </div>
                ) : decryptedUrl ? (
                  <a
                    href={decryptedUrl}
                    download={encryptedFileMeta.filename}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg glass text-blite-text-primary hover:text-neon-cyan transition-colors text-sm"
                  >
                    <Download size={16} />
                    <span>{encryptedFileMeta.filename}</span>
                    <span className="text-blite-text-muted text-xs">
                      ({(encryptedFileMeta.size / 1024).toFixed(1)} KB)
                    </span>
                  </a>
                ) : null
              ) : isImageUrl(contentText) ? (
                <div>
                  <img
                    src={getAssetUrl(contentText)}
                    alt="attachment"
                    className="max-w-md max-h-80 rounded-lg"
                    loading="lazy"
                  />
                </div>
              ) : isAudioUrl(contentText) ? (
                <div className="max-w-xs">
                  <AudioPlayer src={getAssetUrl(contentText)} />
                </div>
              ) : (
                <MarkdownRenderer content={contentText} />
              )}
              {/* Inline metadata for continuation messages */}
              {!isFirstInGroup && (
                <span className="inline-flex items-center gap-1 ml-1">
                  {message.nonce && <Lock size={9} className="text-blite-text-muted/40" />}
                  {message.isPinned && <Pin size={9} className="text-neon-cyan/50" />}
                  {message.expiresAt && (
                    <Timer size={9} className="text-blite-text-muted/50" title={`Expires ${new Date(message.expiresAt).toLocaleString()}`} />
                  )}
                  {message.editedAt && (
                    <span
                      className="text-[10px] text-blite-text-muted/60"
                      title={`Edited ${format(new Date(message.editedAt), 'MMMM d, yyyy h:mm a')}`}
                    >
                      (edited)
                    </span>
                  )}
                </span>
              )}
              {isFirstInGroup && message.expiresAt && (
                <Timer size={10} className="inline text-blite-text-muted/50 ml-1" title={`Expires ${new Date(message.expiresAt).toLocaleString()}`} />
              )}
            </div>
          )}

          {/* Link previews */}
          {!editing && urls.map((url) => (
            <LinkPreview key={url} url={url} />
          ))}

          {/* Reaction bar */}
          {!editing && message.reactions && message.reactions.length > 0 && (
            <ReactionBar
              messageId={message.id}
              channelId={message.channelId}
              reactions={message.reactions}
            />
          )}
        </div>

        {/* Action buttons - top right on hover */}
        {hovered && !editing && (
          <div className="absolute -top-3 right-4 flex items-center glass rounded-lg shadow-lg overflow-hidden z-10">
            <button
              onClick={handleReply}
              className="p-2 text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
              title="Reply"
            >
              <Reply size={15} />
            </button>
            <button
              onClick={handleForward}
              className="p-2 text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
              title="Forward"
            >
              <Forward size={15} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2 text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
                title="React"
              >
                <Smile size={15} />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-8 right-0 z-50">
                  <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
                </div>
              )}
            </div>
            <button
              onClick={handlePin}
              className={`p-2 transition-colors ${message.isPinned ? 'text-neon-cyan hover:brightness-125' : 'text-blite-text-muted hover:text-blite-text-primary'} hover:bg-blite-bg-hover`}
              title={message.isPinned ? 'Unpin' : 'Pin'}
            >
              <Pin size={15} />
            </button>
            {isOwn && (
              <>
                <button
                  onClick={() => {
                    setEditing(true)
                    setEditContent(message.content || '')
                  }}
                  className="p-2 text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
                  title="Edit"
                >
                  <Edit size={15} />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 text-blite-text-muted hover:text-blite-danger hover:bg-blite-danger/10 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* User Popover */}
      {popover && message.sender && (
        <UserPopover
          user={message.sender}
          onClose={() => setPopover(null)}
          position={popover}
        />
      )}
    </>
  )
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  // Only re-render if message content, reactions, or key props change
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.editedAt === nextProps.message.editedAt &&
    prevProps.message.reactions?.length === nextProps.message.reactions?.length &&
    prevProps.compact === nextProps.compact &&
    prevProps.isFirstInGroup === nextProps.isFirstInGroup &&
    prevProps.isDM === nextProps.isDM
  )
})

export default MessageItem
