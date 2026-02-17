import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/auth';
import { db } from '../db/connection';
import { dmParticipants } from '../db/schema';
import { eq, and } from 'drizzle-orm';

// Track active calls: recipientId -> { callerId, dmId, withVideo }
const activeCalls = new Map<string, { callerId: string; dmId: string; withVideo: boolean }>();

/**
 * Register call signaling handlers for a socket.
 */
export function registerCallHandlers(io: Server, socket: AuthenticatedSocket): void {
  const userId = socket.user.id;

  // Initiate a call to another user
  socket.on('call:initiate', async (payload: {
    recipientId: string;
    dmId: string;
    withVideo: boolean;
    callerName: string;
    callerAvatar: string | null;
  }, callback?: (response: { success?: boolean; error?: string }) => void) => {
    const { recipientId, dmId, withVideo, callerName, callerAvatar } = payload;

    console.log(`[Call] User ${userId} initiating call to ${recipientId}, DM: ${dmId}`);

    // Verify the caller is a participant in this DM
    const [callerAccess] = await db
      .select({ dmChannelId: dmParticipants.dmChannelId })
      .from(dmParticipants)
      .where(and(eq(dmParticipants.dmChannelId, dmId), eq(dmParticipants.userId, userId)))
      .limit(1);
    if (!callerAccess) {
      if (callback) callback({ error: 'You are not a participant in this conversation' });
      return;
    }

    // Verify the recipient is also a participant
    const [recipientAccess] = await db
      .select({ dmChannelId: dmParticipants.dmChannelId })
      .from(dmParticipants)
      .where(and(eq(dmParticipants.dmChannelId, dmId), eq(dmParticipants.userId, recipientId)))
      .limit(1);
    if (!recipientAccess) {
      if (callback) callback({ error: 'Recipient is not in this conversation' });
      return;
    }

    // Check if recipient is already in a call
    if (activeCalls.has(recipientId)) {
      console.log(`[Call] Recipient ${recipientId} is busy`);
      // Recipient is busy
      socket.emit('call:busy');
      if (callback) callback({ error: 'User is busy' });
      return;
    }

    // Store the active call
    activeCalls.set(recipientId, { callerId: userId, dmId, withVideo });

    const targetRoom = `user:${recipientId}`;
    console.log(`[Call] Emitting call:incoming to room: ${targetRoom}`);

    // Check how many sockets are in the target room
    const room = io.sockets.adapter.rooms.get(targetRoom);
    const socketsInRoom = room ? room.size : 0;
    console.log(`[Call] Sockets in room ${targetRoom}:`, socketsInRoom);

    if (socketsInRoom === 0) {
      console.log(`[Call] WARNING: No sockets in target room! Recipient may be offline.`);
      // List all user rooms for debugging
      const userRooms = Array.from(io.sockets.adapter.rooms.keys()).filter(r => r.startsWith('user:'));
      console.log(`[Call] All user rooms:`, userRooms);
      console.log(`[Call] Total connected sockets:`, io.sockets.sockets.size);
    } else {
      console.log(`[Call] Socket IDs in target room:`, Array.from(room!));
    }

    // Send incoming call notification to recipient
    console.log(`[Call] About to emit call:incoming event with data:`, {
      callerId: userId,
      callerName,
      callerAvatar,
      dmId,
      withVideo,
    });
    io.to(targetRoom).emit('call:incoming', {
      callerId: userId,
      callerName,
      callerAvatar,
      dmId,
      withVideo,
    });

    console.log(`[Call] call:incoming event emitted to ${targetRoom}`);

    if (callback) callback({ success: true });

    // Set a timeout to auto-cancel the call if not answered
    setTimeout(() => {
      const call = activeCalls.get(recipientId);
      if (call && call.callerId === userId && call.dmId === dmId) {
        activeCalls.delete(recipientId);
        // Notify caller that call was not answered
        socket.emit('call:timeout');
      }
    }, 30000); // 30 second timeout
  });

  // Accept an incoming call
  socket.on('call:accept', (payload: {
    callerId: string;
    dmId: string;
  }, callback?: (response: { success?: boolean; error?: string }) => void) => {
    const { callerId, dmId } = payload;

    console.log(`[Call] User ${userId} accepting call from ${callerId}, dmId: ${dmId}`);

    // Remove from active calls
    activeCalls.delete(userId);

    // Check if caller is still connected
    const callerRoom = io.sockets.adapter.rooms.get(`user:${callerId}`);
    console.log(`[Call] Caller room has ${callerRoom ? callerRoom.size : 0} sockets`);

    // Notify caller that call was accepted
    io.to(`user:${callerId}`).emit('call:accepted', {
      dmId,
      recipientId: userId,
    });

    console.log(`[Call] Emitted call:accepted to user:${callerId}`);

    if (callback) callback({ success: true });
  });

  // Decline an incoming call
  socket.on('call:decline', (payload: {
    callerId: string;
    dmId: string;
  }, callback?: (response: { success?: boolean; error?: string }) => void) => {
    const { callerId, dmId } = payload;

    // Remove from active calls
    activeCalls.delete(userId);

    // Notify caller that call was declined
    io.to(`user:${callerId}`).emit('call:declined');

    if (callback) callback({ success: true });
  });

  // Cancel an outgoing call
  socket.on('call:cancel', (payload: {
    recipientId: string;
    dmId: string;
  }, callback?: (response: { success?: boolean; error?: string }) => void) => {
    const { recipientId, dmId } = payload;

    // Remove from active calls
    const call = activeCalls.get(recipientId);
    if (call && call.callerId === userId) {
      activeCalls.delete(recipientId);
    }

    // Notify recipient that call was cancelled
    io.to(`user:${recipientId}`).emit('call:cancelled');

    if (callback) callback({ success: true });
  });

  // Busy signal (user is already in a call)
  socket.on('call:busy', (payload: {
    callerId: string;
    dmId: string;
  }, callback?: (response: { success?: boolean; error?: string }) => void) => {
    const { callerId } = payload;

    // Remove from active calls so the recipient isn't stuck as "busy"
    // until the 30-second timeout fires
    const call = activeCalls.get(userId);
    if (call && call.callerId === callerId) {
      activeCalls.delete(userId);
    }

    // Notify caller that recipient is busy
    io.to(`user:${callerId}`).emit('call:busy');

    if (callback) callback({ success: true });
  });

  // Clean up active calls when user disconnects
  socket.on('disconnect', () => {
    // Find any calls where this user is the recipient
    for (const [recipientId, call] of activeCalls.entries()) {
      if (recipientId === userId) {
        // Notify caller that recipient disconnected
        io.to(`user:${call.callerId}`).emit('call:cancelled');
        activeCalls.delete(recipientId);
      } else if (call.callerId === userId) {
        // This user was calling someone, cancel the call
        io.to(`user:${recipientId}`).emit('call:cancelled');
        activeCalls.delete(recipientId);
      }
    }
  });
}
