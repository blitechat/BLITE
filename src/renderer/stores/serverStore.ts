import { create } from 'zustand'
import type { Server, Channel, ServerMember, Role } from '@shared/types'

interface ServerState {
  servers: Server[]
  channels: Record<string, Channel[]>
  members: Record<string, ServerMember[]>
  roles: Record<string, Role[]>
  activeServerId: string | null
  activeChannelId: string | null
  unreadChannels: Set<string>
  blockedUserIds: Set<string>

  setServers: (servers: Server[]) => void
  addServer: (server: Server) => void
  removeServer: (serverId: string) => void
  updateServer: (serverId: string, data: Partial<Server>) => void
  setChannels: (serverId: string, channels: Channel[]) => void
  addChannel: (serverId: string, channel: Channel) => void
  updateChannel: (serverId: string, channelId: string, data: Partial<Channel>) => void
  removeChannel: (serverId: string, channelId: string) => void
  setMembers: (serverId: string, members: ServerMember[]) => void
  addMember: (serverId: string, member: ServerMember) => void
  removeMember: (serverId: string, userId: string) => void
  setRoles: (serverId: string, roles: Role[]) => void
  setActiveServer: (serverId: string | null) => void
  setActiveChannel: (channelId: string | null) => void
  markChannelUnread: (channelId: string) => void
  markChannelRead: (channelId: string) => void
  setBlockedUsers: (ids: string[]) => void
  addBlockedUser: (userId: string) => void
  removeBlockedUser: (userId: string) => void
}

export const useServerStore = create<ServerState>((set) => ({
  servers: [],
  channels: {},
  members: {},
  roles: {},
  activeServerId: null,
  activeChannelId: null,
  unreadChannels: new Set<string>(),
  blockedUserIds: new Set<string>(),

  setServers: (servers) => set({ servers }),

  addServer: (server) => set((state) => ({
    servers: [...state.servers, server]
  })),

  removeServer: (serverId) => set((state) => ({
    servers: state.servers.filter((s) => s.id !== serverId),
    activeServerId: state.activeServerId === serverId ? null : state.activeServerId,
    activeChannelId: state.activeServerId === serverId ? null : state.activeChannelId
  })),

  updateServer: (serverId, data) => set((state) => ({
    servers: state.servers.map((s) => s.id === serverId ? { ...s, ...data } : s)
  })),

  setChannels: (serverId, channels) => set((state) => ({
    channels: { ...state.channels, [serverId]: channels }
  })),

  addChannel: (serverId, channel) => set((state) => ({
    channels: {
      ...state.channels,
      [serverId]: [...(state.channels[serverId] || []), channel]
    }
  })),

  updateChannel: (serverId, channelId, data) => set((state) => ({
    channels: {
      ...state.channels,
      [serverId]: (state.channels[serverId] || []).map((c) =>
        c.id === channelId ? { ...c, ...data } : c
      )
    }
  })),

  removeChannel: (serverId, channelId) => set((state) => ({
    channels: {
      ...state.channels,
      [serverId]: (state.channels[serverId] || []).filter((c) => c.id !== channelId)
    }
  })),

  setMembers: (serverId, members) => set((state) => ({
    members: { ...state.members, [serverId]: members }
  })),

  addMember: (serverId, member) => set((state) => ({
    members: {
      ...state.members,
      [serverId]: [...(state.members[serverId] || []), member]
    }
  })),

  removeMember: (serverId, userId) => set((state) => ({
    members: {
      ...state.members,
      [serverId]: (state.members[serverId] || []).filter((m) => m.userId !== userId)
    }
  })),

  setRoles: (serverId, roles) => set((state) => ({
    roles: { ...state.roles, [serverId]: roles }
  })),

  setActiveServer: (serverId) => set({ activeServerId: serverId, activeChannelId: null }),

  setActiveChannel: (channelId) => set((state) => {
    const newUnread = new Set(state.unreadChannels)
    if (channelId) newUnread.delete(channelId)
    return { activeChannelId: channelId, unreadChannels: newUnread }
  }),

  markChannelUnread: (channelId) => set((state) => {
    if (state.activeChannelId === channelId) return state
    const newUnread = new Set(state.unreadChannels)
    newUnread.add(channelId)
    return { unreadChannels: newUnread }
  }),

  markChannelRead: (channelId) => set((state) => {
    const newUnread = new Set(state.unreadChannels)
    newUnread.delete(channelId)
    return { unreadChannels: newUnread }
  }),

  setBlockedUsers: (ids) => set({ blockedUserIds: new Set(ids) }),

  addBlockedUser: (userId) => set((state) => {
    const newSet = new Set(state.blockedUserIds)
    newSet.add(userId)
    return { blockedUserIds: newSet }
  }),

  removeBlockedUser: (userId) => set((state) => {
    const newSet = new Set(state.blockedUserIds)
    newSet.delete(userId)
    return { blockedUserIds: newSet }
  }),
}))
