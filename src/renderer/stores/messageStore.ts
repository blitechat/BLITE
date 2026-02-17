import { create } from 'zustand'
import type { Message, ReactionGroup } from '@shared/types'

interface MessageState {
  messages: Record<string, Message[]>
  hasMore: Record<string, boolean>
  typingUsers: Record<string, string[]>
  replyingTo: Record<string, Message | null> // channelId -> message being replied to
  forwardingMessage: Message | null

  setMessages: (channelId: string, messages: Message[]) => void
  addMessage: (channelId: string, message: Message) => void
  prependMessages: (channelId: string, messages: Message[]) => void
  editMessage: (channelId: string, messageId: string, content: string, encrypted: string, nonce: string) => void
  deleteMessage: (channelId: string, messageId: string) => void
  setHasMore: (channelId: string, hasMore: boolean) => void
  setTypingUser: (channelId: string, userId: string, isTyping: boolean) => void
  clearChannel: (channelId: string) => void
  updateReactions: (channelId: string, messageId: string, reactions: ReactionGroup[]) => void
  setReplyingTo: (channelId: string, message: Message | null) => void
  setForwardingMessage: (message: Message | null) => void
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: {},
  hasMore: {},
  typingUsers: {},
  replyingTo: {},
  forwardingMessage: null,

  setMessages: (channelId, messages) => set((state) => ({
    messages: { ...state.messages, [channelId]: messages }
  })),

  addMessage: (channelId, message) => set((state) => ({
    messages: {
      ...state.messages,
      [channelId]: [...(state.messages[channelId] || []), message]
    }
  })),

  prependMessages: (channelId, messages) => set((state) => ({
    messages: {
      ...state.messages,
      [channelId]: [...messages, ...(state.messages[channelId] || [])]
    }
  })),

  editMessage: (channelId, messageId, content, encrypted, nonce) => set((state) => ({
    messages: {
      ...state.messages,
      [channelId]: (state.messages[channelId] || []).map((m) =>
        m.id === messageId
          ? { ...m, content, encryptedContent: encrypted, nonce, editedAt: Date.now() }
          : m
      )
    }
  })),

  deleteMessage: (channelId, messageId) => set((state) => ({
    messages: {
      ...state.messages,
      [channelId]: (state.messages[channelId] || []).filter((m) => m.id !== messageId)
    }
  })),

  setHasMore: (channelId, hasMore) => set((state) => ({
    hasMore: { ...state.hasMore, [channelId]: hasMore }
  })),

  setTypingUser: (channelId, userId, isTyping) => set((state) => {
    const current = state.typingUsers[channelId] || []
    const updated = isTyping
      ? current.includes(userId) ? current : [...current, userId]
      : current.filter((id) => id !== userId)
    return {
      typingUsers: { ...state.typingUsers, [channelId]: updated }
    }
  }),

  clearChannel: (channelId) => set((state) => {
    const { [channelId]: _, ...rest } = state.messages
    return { messages: rest }
  }),

  updateReactions: (channelId, messageId, reactions) => set((state) => ({
    messages: {
      ...state.messages,
      [channelId]: (state.messages[channelId] || []).map((m) =>
        m.id === messageId ? { ...m, reactions } : m
      )
    }
  })),

  setReplyingTo: (channelId, message) => set((state) => ({
    replyingTo: { ...state.replyingTo, [channelId]: message }
  })),

  setForwardingMessage: (message) => set({ forwardingMessage: message }),
}))
