import { Server as SocketServer } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/auth';
import {
  getOrCreateRoom,
  getRoom,
  addPeer,
  removePeer,
  getUserRoom,
  createWebRtcTransport,
  connectTransport,
  createProducer,
  createConsumer,
  resumeConsumer,
  pauseProducer,
  resumeProducer,
  closeProducer,
  getRoomPeers,
  getPeerProducers,
  getServerRoomOccupancy,
} from './mediasoupManager';
import { db } from '../db/connection';
import { serverMembers, dmParticipants } from '../db/schema';
import { eq, and } from 'drizzle-orm';

// Track which rooms already have their audio level observer wired up
const observerSetupDone = new Set<string>();
import type { DtlsParameters, RtpParameters, RtpCapabilities, MediaKind } from 'mediasoup/node/lib/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface VoiceJoinPayload {
  channelId: string;
  serverId: string;
}

interface CreateTransportPayload {
  direction: 'send' | 'recv';
}

interface ConnectTransportPayload {
  direction: 'send' | 'recv';
  dtlsParameters: DtlsParameters;
}

interface ProducePayload {
  kind: MediaKind;
  rtpParameters: RtpParameters;
  appData: { source: 'mic' | 'camera' | 'screen'; [key: string]: unknown };
}

interface ConsumePayload {
  producerId: string;
  rtpCapabilities: RtpCapabilities;
}

interface ResumeConsumerPayload {
  consumerId: string;
}

interface ProducerActionPayload {
  producerId: string;
}

interface ToggleMutePayload {
  muted: boolean;
}

interface ToggleDeafenPayload {
  deafened: boolean;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function broadcastChannelUpdate(io: SocketServer, channelId: string, serverId: string): void {
  const peers = getRoomPeers(channelId);
  const occupancy = getServerRoomOccupancy(serverId);
  // Broadcast to the entire server room so sidebar can show who's in voice
  io.to(`server:${serverId}`).emit('voice:channelUpdate', { channelId, peers, occupancy });
}

// ─── Handler Registration ───────────────────────────────────────────────────

/**
 * Register mediasoup SFU voice event handlers for a socket.
 */
export function registerVoiceHandlers(io: SocketServer, socket: AuthenticatedSocket): void {
  const userId = socket.user.id;
  const displayName = socket.user.displayName;

  // ─── voice:join ───────────────────────────────────────────────────
  socket.on('voice:join', async (payload: VoiceJoinPayload, callback?: Function) => {
    try {
      const { channelId, serverId } = payload;
      console.log(`[Voice] User ${userId} (${displayName}) joining channel ${channelId} in server ${serverId}`);

      if (!channelId || !serverId) {
        console.log('[Voice] Missing channelId or serverId');
        if (callback) callback({ error: 'channelId and serverId are required' });
        return;
      }

      // Verify the user has access to this channel
      if (serverId === 'dm') {
        // DM call: verify user is a participant
        const [dmAccess] = await db
          .select({ dmChannelId: dmParticipants.dmChannelId })
          .from(dmParticipants)
          .where(and(eq(dmParticipants.dmChannelId, channelId), eq(dmParticipants.userId, userId)))
          .limit(1);
        if (!dmAccess) {
          if (callback) callback({ error: 'You are not a participant in this conversation' });
          return;
        }
      } else {
        // Server channel: verify server membership
        const [membership] = await db
          .select({ serverId: serverMembers.serverId })
          .from(serverMembers)
          .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
          .limit(1);
        if (!membership) {
          if (callback) callback({ error: 'You are not a member of this server' });
          return;
        }
      }

      // Leave previous voice channel if in one
      const previousChannelId = getUserRoom(userId);
      if (previousChannelId) {
        const prevRoom = getRoom(previousChannelId);
        if (prevRoom) {
          socket.leave(`voice:${previousChannelId}`);
          removePeer(previousChannelId, userId);
          io.to(`voice:${previousChannelId}`).emit('voice:user-left', {
            userId,
            channelId: previousChannelId,
          });
          broadcastChannelUpdate(io, previousChannelId, prevRoom.serverId);
        }
      }

      // Get or create the room
      const room = await getOrCreateRoom(channelId, serverId);

      // Wire up audio level observer forwarding (once per room)
      if (!observerSetupDone.has(channelId)) {
        setupAudioLevelObserver(io, channelId);
        observerSetupDone.add(channelId);
      }

      // Add this peer
      addPeer(room, userId, socket.id, displayName);

      // Join socket.io room for voice events
      socket.join(`voice:${channelId}`);

      // Get existing peers info (for the joining user to set up consumers)
      const existingPeers = getRoomPeers(channelId)
        .filter((p) => p.userId !== userId)
        .map((p) => {
          const producers = getPeerProducers(channelId, p.userId);
          return { ...p, producers };
        });

      // Notify existing users
      socket.to(`voice:${channelId}`).emit('voice:user-joined', {
        userId,
        displayName,
        channelId,
      });

      // Broadcast channel update to server
      broadcastChannelUpdate(io, channelId, serverId);

      console.log(`[Voice] User ${userId} successfully joined channel ${channelId}. Existing peers:`, existingPeers.length);

      if (callback) {
        callback({
          routerRtpCapabilities: room.router.rtpCapabilities,
          peers: existingPeers,
          channelId,
        });
      }
    } catch (error: any) {
      console.error('[Voice] voice:join error:', error);
      const message = error?.message || 'Failed to join voice channel';
      if (callback) callback({ error: `Failed to join voice channel: ${message}` });
    }
  });

  // ─── voice:leave ──────────────────────────────────────────────────
  socket.on('voice:leave', (callback?: Function) => {
    try {
      const channelId = getUserRoom(userId);
      if (!channelId) {
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      const serverId = room?.serverId;

      socket.leave(`voice:${channelId}`);
      removePeer(channelId, userId);

      // If the room was cleaned up (no peers left), remove observer tracking
      if (!getRoom(channelId)) {
        observerSetupDone.delete(channelId);
      }

      io.to(`voice:${channelId}`).emit('voice:user-left', {
        userId,
        channelId,
      });

      if (serverId) {
        broadcastChannelUpdate(io, channelId, serverId);
      }

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('voice:leave error:', error);
      if (callback) callback({ error: 'Failed to leave voice channel' });
    }
  });

  // ─── voice:createTransport ────────────────────────────────────────
  socket.on('voice:createTransport', async (payload: CreateTransportPayload, callback?: Function) => {
    try {
      const { direction } = payload;
      const channelId = getUserRoom(userId);
      if (!channelId) {
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        if (callback) callback({ error: 'Room not found' });
        return;
      }

      const transport = await createWebRtcTransport(room, userId, direction);

      if (callback) {
        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      }
    } catch (error) {
      console.error('voice:createTransport error:', error);
      if (callback) callback({ error: 'Failed to create transport' });
    }
  });

  // ─── voice:connectTransport ───────────────────────────────────────
  socket.on('voice:connectTransport', async (payload: ConnectTransportPayload, callback?: Function) => {
    try {
      const { direction, dtlsParameters } = payload;
      const channelId = getUserRoom(userId);
      if (!channelId) {
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        if (callback) callback({ error: 'Room not found' });
        return;
      }

      await connectTransport(room, userId, direction, dtlsParameters);

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('voice:connectTransport error:', error);
      if (callback) callback({ error: 'Failed to connect transport' });
    }
  });

  // ─── voice:produce ────────────────────────────────────────────────
  socket.on('voice:produce', async (payload: ProducePayload, callback?: Function) => {
    try {
      const { kind, rtpParameters, appData } = payload;
      console.log(`[Voice] User ${userId} producing ${kind} (source: ${appData?.source})`);

      const channelId = getUserRoom(userId);
      if (!channelId) {
        console.log('[Voice] Cannot produce: not in a voice channel');
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        console.log('[Voice] Cannot produce: room not found');
        if (callback) callback({ error: 'Room not found' });
        return;
      }

      const producer = await createProducer(room, userId, kind, rtpParameters, appData);
      console.log(`[Voice] Producer created: ${producer.id}, notifying peers in voice:${channelId}`);

      // Notify other peers about the new producer
      socket.to(`voice:${channelId}`).emit('voice:newProducer', {
        producerId: producer.id,
        userId,
        kind: producer.kind,
        appData: producer.appData,
      });

      // Broadcast state change
      const peer = room.peers.get(userId);
      if (peer) {
        socket.to(`voice:${channelId}`).emit('voice:peerStateChanged', {
          userId,
          isMuted: peer.isMuted,
          isDeafened: peer.isDeafened,
          isCameraOn: peer.isCameraOn,
          isScreenSharing: peer.isScreenSharing,
        });
        broadcastChannelUpdate(io, channelId, room.serverId);
      }

      if (callback) callback({ producerId: producer.id });
    } catch (error) {
      console.error('voice:produce error:', error);
      if (callback) callback({ error: 'Failed to produce' });
    }
  });

  // ─── voice:consume ────────────────────────────────────────────────
  socket.on('voice:consume', async (payload: ConsumePayload, callback?: Function) => {
    try {
      const { producerId, rtpCapabilities } = payload;
      const channelId = getUserRoom(userId);
      if (!channelId) {
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        if (callback) callback({ error: 'Room not found' });
        return;
      }

      // Find which peer owns this producer
      let producerUserId: string | null = null;
      for (const [peerUserId, peer] of room.peers) {
        if (peer.producers.has(producerId)) {
          producerUserId = peerUserId;
          break;
        }
      }

      if (!producerUserId) {
        if (callback) callback({ error: 'Producer not found' });
        return;
      }

      const consumer = await createConsumer(room, userId, producerUserId, producerId, rtpCapabilities);
      if (!consumer) {
        if (callback) callback({ error: 'Cannot consume' });
        return;
      }

      if (callback) {
        callback({
          id: consumer.id,
          producerId: consumer.producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          appData: consumer.appData,
        });
      }
    } catch (error) {
      console.error('voice:consume error:', error);
      if (callback) callback({ error: 'Failed to consume' });
    }
  });

  // ─── voice:resumeConsumer ─────────────────────────────────────────
  socket.on('voice:resumeConsumer', async (payload: ResumeConsumerPayload, callback?: Function) => {
    try {
      const { consumerId } = payload;
      const channelId = getUserRoom(userId);
      if (!channelId) {
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        if (callback) callback({ error: 'Room not found' });
        return;
      }

      await resumeConsumer(room, userId, consumerId);

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('voice:resumeConsumer error:', error);
      if (callback) callback({ error: 'Failed to resume consumer' });
    }
  });

  // ─── voice:pauseProducer ──────────────────────────────────────────
  socket.on('voice:pauseProducer', async (payload: ProducerActionPayload, callback?: Function) => {
    try {
      const { producerId } = payload;
      const channelId = getUserRoom(userId);
      if (!channelId) {
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        if (callback) callback({ error: 'Room not found' });
        return;
      }

      await pauseProducer(room, userId, producerId);

      socket.to(`voice:${channelId}`).emit('voice:producerPaused', {
        producerId,
        userId,
      });

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('voice:pauseProducer error:', error);
      if (callback) callback({ error: 'Failed to pause producer' });
    }
  });

  // ─── voice:resumeProducer ─────────────────────────────────────────
  socket.on('voice:resumeProducer', async (payload: ProducerActionPayload, callback?: Function) => {
    try {
      const { producerId } = payload;
      const channelId = getUserRoom(userId);
      if (!channelId) {
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        if (callback) callback({ error: 'Room not found' });
        return;
      }

      await resumeProducer(room, userId, producerId);

      socket.to(`voice:${channelId}`).emit('voice:producerResumed', {
        producerId,
        userId,
      });

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('voice:resumeProducer error:', error);
      if (callback) callback({ error: 'Failed to resume producer' });
    }
  });

  // ─── voice:closeProducer ──────────────────────────────────────────
  socket.on('voice:closeProducer', (payload: ProducerActionPayload, callback?: Function) => {
    try {
      const { producerId } = payload;
      const channelId = getUserRoom(userId);
      if (!channelId) {
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        if (callback) callback({ error: 'Room not found' });
        return;
      }

      closeProducer(room, userId, producerId);

      socket.to(`voice:${channelId}`).emit('voice:producerClosed', {
        producerId,
        userId,
      });

      // Broadcast state change
      const peer = room.peers.get(userId);
      if (peer) {
        socket.to(`voice:${channelId}`).emit('voice:peerStateChanged', {
          userId,
          isMuted: peer.isMuted,
          isDeafened: peer.isDeafened,
          isCameraOn: peer.isCameraOn,
          isScreenSharing: peer.isScreenSharing,
        });
        broadcastChannelUpdate(io, channelId, room.serverId);
      }

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('voice:closeProducer error:', error);
      if (callback) callback({ error: 'Failed to close producer' });
    }
  });

  // ─── voice:toggleMute ─────────────────────────────────────────────
  socket.on('voice:toggleMute', (payload: ToggleMutePayload, callback?: Function) => {
    try {
      const { muted } = payload;
      const channelId = getUserRoom(userId);
      if (!channelId) {
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        if (callback) callback({ error: 'Room not found' });
        return;
      }

      const peer = room.peers.get(userId);
      if (!peer) {
        if (callback) callback({ error: 'Peer not found' });
        return;
      }

      peer.isMuted = muted;

      socket.to(`voice:${channelId}`).emit('voice:peerStateChanged', {
        userId,
        isMuted: peer.isMuted,
        isDeafened: peer.isDeafened,
        isCameraOn: peer.isCameraOn,
        isScreenSharing: peer.isScreenSharing,
      });

      broadcastChannelUpdate(io, channelId, room.serverId);

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('voice:toggleMute error:', error);
      if (callback) callback({ error: 'Failed to toggle mute' });
    }
  });

  // ─── voice:toggleDeafen ───────────────────────────────────────────
  socket.on('voice:toggleDeafen', (payload: ToggleDeafenPayload, callback?: Function) => {
    try {
      const { deafened } = payload;
      const channelId = getUserRoom(userId);
      if (!channelId) {
        if (callback) callback({ error: 'Not in a voice channel' });
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        if (callback) callback({ error: 'Room not found' });
        return;
      }

      const peer = room.peers.get(userId);
      if (!peer) {
        if (callback) callback({ error: 'Peer not found' });
        return;
      }

      peer.isDeafened = deafened;
      // Auto-mute when deafening
      if (deafened) {
        peer.isMuted = true;
      }

      socket.to(`voice:${channelId}`).emit('voice:peerStateChanged', {
        userId,
        isMuted: peer.isMuted,
        isDeafened: peer.isDeafened,
        isCameraOn: peer.isCameraOn,
        isScreenSharing: peer.isScreenSharing,
      });

      broadcastChannelUpdate(io, channelId, room.serverId);

      if (callback) callback({ success: true });
    } catch (error) {
      console.error('voice:toggleDeafen error:', error);
      if (callback) callback({ error: 'Failed to toggle deafen' });
    }
  });

  // ─── voice:e2ee-key (relay encrypted AES key to target peer) ─────
  socket.on('voice:e2ee-key', ({ channelId, targetUserId, encrypted, nonce, keyId, senderPublicKey }: {
    channelId: string; targetUserId: string; encrypted: string; nonce: string; keyId: number; senderPublicKey?: string;
  }) => {
    try {
      const currentChannelId = getUserRoom(userId);
      if (!currentChannelId || currentChannelId !== channelId) return;

      const room = getRoom(channelId);
      if (!room) return;

      // Find the target peer's socket in the room
      const targetPeer = room.peers.get(targetUserId);
      if (!targetPeer) return;

      // Relay the encrypted key blob - server cannot decrypt it.
      // Prefer the client-provided senderPublicKey (derived fresh from the
      // sender's actual private key) over socket.user.publicKey, which may
      // be stale if the user updated their identity key after connecting.
      io.to(targetPeer.socketId).emit('voice:e2ee-key', {
        fromUserId: userId,
        fromPublicKey: senderPublicKey || socket.user.publicKey,
        encrypted,
        nonce,
        keyId,
      });
    } catch (error) {
      console.error('[Voice] voice:e2ee-key relay error:', error);
    }
  });

  // ─── voice:request-e2ee-key (request a peer to send their E2EE key) ─────
  socket.on('voice:request-e2ee-key', ({ channelId, targetUserId }: {
    channelId: string; targetUserId: string;
  }) => {
    try {
      const currentChannelId = getUserRoom(userId);
      if (!currentChannelId || currentChannelId !== channelId) {
        console.log(`[Voice] Key request ignored: user ${userId} not in channel ${channelId}`);
        return;
      }

      const room = getRoom(channelId);
      if (!room) {
        console.log(`[Voice] Key request ignored: room ${channelId} not found`);
        return;
      }

      // Find the target peer's socket in the room
      const targetPeer = room.peers.get(targetUserId);
      if (!targetPeer) {
        console.log(`[Voice] Key request ignored: target peer ${targetUserId} not in room`);
        return;
      }

      console.log(`[Voice] User ${userId} requesting E2EE key from ${targetUserId} in channel ${channelId}`);

      // Notify the target peer that someone is requesting their key
      io.to(targetPeer.socketId).emit('voice:e2ee-key-requested', {
        fromUserId: userId,
        channelId,
      });
    } catch (error) {
      console.error('[Voice] voice:request-e2ee-key error:', error);
    }
  });

  // ─── Disconnect cleanup ───────────────────────────────────────────
  socket.on('disconnect', () => {
    const channelId = getUserRoom(userId);
    if (!channelId) return;

    const room = getRoom(channelId);
    const serverId = room?.serverId;

    removePeer(channelId, userId);

    // If the room was cleaned up (no peers left), remove observer tracking
    if (!getRoom(channelId)) {
      observerSetupDone.delete(channelId);
    }

    io.to(`voice:${channelId}`).emit('voice:user-left', {
      userId,
      channelId,
    });

    if (serverId) {
      broadcastChannelUpdate(io, channelId, serverId);
    }
  });

  // ─── AudioLevelObserver handler (set up per room on join) ─────────
  // The audio level observer events are handled in the room's observer
  // and broadcast from there. We set this up when a room is created.
}

/**
 * Set up audio level observer event forwarding for a room.
 * Call this after creating a room to broadcast active speaker events.
 */
export function setupAudioLevelObserver(io: SocketServer, channelId: string): void {
  const room = getRoom(channelId);
  if (!room?.audioLevelObserver) return;

  room.audioLevelObserver.on('volumes', (volumes) => {
    if (volumes.length === 0) return;
    const { producer, volume } = volumes[0];

    // Find the userId who owns this producer
    for (const [peerUserId, peer] of room.peers) {
      for (const [, p] of peer.producers) {
        if (p.id === producer.id) {
          io.to(`voice:${channelId}`).emit('voice:activeSpeaker', {
            userId: peerUserId,
            volume,
          });
          return;
        }
      }
    }
  });

  room.audioLevelObserver.on('silence', () => {
    io.to(`voice:${channelId}`).emit('voice:activeSpeaker', {
      userId: null,
      volume: 0,
    });
  });
}
