import { create } from 'zustand'
import type { FriendRequest, Friendship } from '@shared/types'

interface FriendState {
  friends: Friendship[]
  incomingRequests: FriendRequest[]
  outgoingRequests: FriendRequest[]

  setFriends: (friends: Friendship[]) => void
  addFriend: (friendship: Friendship) => void
  removeFriend: (friendId: string) => void
  setIncomingRequests: (requests: FriendRequest[]) => void
  addIncomingRequest: (request: FriendRequest) => void
  removeIncomingRequest: (requestIdOrSenderId: string) => void
  setOutgoingRequests: (requests: FriendRequest[]) => void
  addOutgoingRequest: (request: FriendRequest) => void
  removeOutgoingRequest: (receiverId: string) => void
}

export const useFriendStore = create<FriendState>((set) => ({
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],

  setFriends: (friends) => set({ friends }),

  addFriend: (friendship) => set((state) => ({
    friends: [...state.friends, friendship],
  })),

  removeFriend: (friendId) => set((state) => ({
    friends: state.friends.filter((f) => f.friendId !== friendId),
  })),

  setIncomingRequests: (requests) => set({ incomingRequests: requests }),

  addIncomingRequest: (request) => set((state) => ({
    incomingRequests: [...state.incomingRequests, request],
  })),

  removeIncomingRequest: (requestIdOrSenderId) => set((state) => ({
    incomingRequests: state.incomingRequests.filter(
      (r) => r.id !== requestIdOrSenderId && r.senderId !== requestIdOrSenderId
    ),
  })),

  setOutgoingRequests: (requests) => set({ outgoingRequests: requests }),

  addOutgoingRequest: (request) => set((state) => ({
    outgoingRequests: [...state.outgoingRequests, request],
  })),

  removeOutgoingRequest: (receiverId) => set((state) => ({
    outgoingRequests: state.outgoingRequests.filter((r) => r.receiverId !== receiverId),
  })),
}))
