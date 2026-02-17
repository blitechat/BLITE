import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { friendRequests, friendships, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { getIO } from '../socket/io';

const router = Router();
router.use(authMiddleware);

// GET /friends - List all friends
router.get('/friends', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const result = await db
      .select({
        userId: friendships.userId,
        friendId: friendships.friendId,
        createdAt: friendships.createdAt,
        friend: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          status: users.status,
        },
      })
      .from(friendships)
      .innerJoin(users, eq(friendships.friendId, users.id))
      .where(eq(friendships.userId, userId));

    res.json(result);
  } catch (error) {
    console.error('List friends error:', error);
    res.status(500).json({ message: 'Failed to list friends' });
  }
});

// POST /friends/request - Send friend request by username
router.post('/friends/request', async (req: Request, res: Response): Promise<void> => {
  try {
    const senderId = req.user!.id;
    const { username } = req.body;

    if (!username) {
      res.status(400).json({ message: 'Username is required' });
      return;
    }

    // Find target user
    const [target] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!target) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (target.id === senderId) {
      res.status(400).json({ message: 'Cannot send a friend request to yourself' });
      return;
    }

    // Check if already friends
    const [existing] = await db
      .select()
      .from(friendships)
      .where(and(eq(friendships.userId, senderId), eq(friendships.friendId, target.id)))
      .limit(1);

    if (existing) {
      res.status(409).json({ message: 'You are already friends with this user' });
      return;
    }

    // Check for existing pending request (same direction)
    const [existingRequest] = await db
      .select()
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.senderId, senderId),
          eq(friendRequests.receiverId, target.id),
          eq(friendRequests.status, 'pending')
        )
      )
      .limit(1);

    if (existingRequest) {
      res.status(409).json({ message: 'Friend request already sent' });
      return;
    }

    // Check if they already sent us a request (auto-accept)
    const [reverseRequest] = await db
      .select()
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.senderId, target.id),
          eq(friendRequests.receiverId, senderId),
          eq(friendRequests.status, 'pending')
        )
      )
      .limit(1);

    if (reverseRequest) {
      // Auto-accept: they already want to be our friend
      const now = new Date().toISOString();

      await db.update(friendRequests)
        .set({ status: 'accepted' })
        .where(eq(friendRequests.id, reverseRequest.id));

      await db.insert(friendships).values([
        { userId: senderId, friendId: target.id, createdAt: now },
        { userId: target.id, friendId: senderId, createdAt: now },
      ]);

      // Get sender profile for the notification
      const [senderProfile] = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          status: users.status,
        })
        .from(users)
        .where(eq(users.id, senderId))
        .limit(1);

      const friendship = {
        userId: senderId,
        friendId: target.id,
        createdAt: now,
        friend: target,
      };

      // Notify the other user
      try {
        const io = getIO();
        io.to(`user:${target.id}`).emit('friend:request-accepted', {
          friendship: { userId: target.id, friendId: senderId, createdAt: now, friend: senderProfile },
        });
      } catch {}

      res.status(201).json({ friendship, autoAccepted: true });
      return;
    }

    // Create new request
    const requestId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(friendRequests).values({
      id: requestId,
      senderId,
      receiverId: target.id,
      status: 'pending',
      createdAt: now,
    });

    // Build response with sender profile
    const [senderProfile] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, senderId))
      .limit(1);

    const request = {
      id: requestId,
      senderId,
      receiverId: target.id,
      status: 'pending' as const,
      createdAt: now,
      sender: senderProfile,
      receiver: target,
    };

    // Notify receiver via socket
    try {
      const io = getIO();
      io.to(`user:${target.id}`).emit('friend:request-received', { request });
    } catch {}

    res.status(201).json({ request });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ message: 'Failed to send friend request' });
  }
});

// GET /friends/requests/incoming
router.get('/friends/requests/incoming', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const requests = await db
      .select({
        id: friendRequests.id,
        senderId: friendRequests.senderId,
        receiverId: friendRequests.receiverId,
        status: friendRequests.status,
        createdAt: friendRequests.createdAt,
        sender: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          status: users.status,
        },
      })
      .from(friendRequests)
      .innerJoin(users, eq(friendRequests.senderId, users.id))
      .where(and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, 'pending')));

    res.json(requests);
  } catch (error) {
    console.error('Get incoming requests error:', error);
    res.status(500).json({ message: 'Failed to get friend requests' });
  }
});

// GET /friends/requests/outgoing
router.get('/friends/requests/outgoing', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const requests = await db
      .select({
        id: friendRequests.id,
        senderId: friendRequests.senderId,
        receiverId: friendRequests.receiverId,
        status: friendRequests.status,
        createdAt: friendRequests.createdAt,
        receiver: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          status: users.status,
        },
      })
      .from(friendRequests)
      .innerJoin(users, eq(friendRequests.receiverId, users.id))
      .where(and(eq(friendRequests.senderId, userId), eq(friendRequests.status, 'pending')));

    res.json(requests);
  } catch (error) {
    console.error('Get outgoing requests error:', error);
    res.status(500).json({ message: 'Failed to get friend requests' });
  }
});

// POST /friends/request/:requestId/accept
router.post('/friends/request/:requestId/accept', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { requestId } = req.params;

    const [request] = await db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.id, requestId))
      .limit(1);

    if (!request) {
      res.status(404).json({ message: 'Friend request not found' });
      return;
    }

    if (request.receiverId !== userId) {
      res.status(403).json({ message: 'You can only accept requests sent to you' });
      return;
    }

    if (request.status !== 'pending') {
      res.status(400).json({ message: 'This request has already been handled' });
      return;
    }

    const now = new Date().toISOString();

    // Update request status
    await db.update(friendRequests)
      .set({ status: 'accepted' })
      .where(eq(friendRequests.id, requestId));

    // Create bidirectional friendship
    await db.insert(friendships).values([
      { userId, friendId: request.senderId, createdAt: now },
      { userId: request.senderId, friendId: userId, createdAt: now },
    ]);

    // Get profiles for both users
    const [userProfile] = await db
      .select({
        id: users.id, username: users.username, displayName: users.displayName,
        avatarUrl: users.avatarUrl, status: users.status,
      })
      .from(users).where(eq(users.id, userId)).limit(1);

    const [senderProfile] = await db
      .select({
        id: users.id, username: users.username, displayName: users.displayName,
        avatarUrl: users.avatarUrl, status: users.status,
      })
      .from(users).where(eq(users.id, request.senderId)).limit(1);

    // Notify the original sender that their request was accepted
    try {
      const io = getIO();
      io.to(`user:${request.senderId}`).emit('friend:request-accepted', {
        friendship: {
          userId: request.senderId,
          friendId: userId,
          createdAt: now,
          friend: userProfile,
        },
      });
    } catch {}

    res.json({
      userId,
      friendId: request.senderId,
      createdAt: now,
      friend: senderProfile,
    });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ message: 'Failed to accept friend request' });
  }
});

// POST /friends/request/:requestId/reject
router.post('/friends/request/:requestId/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { requestId } = req.params;

    const [request] = await db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.id, requestId))
      .limit(1);

    if (!request) {
      res.status(404).json({ message: 'Friend request not found' });
      return;
    }

    if (request.receiverId !== userId) {
      res.status(403).json({ message: 'You can only reject requests sent to you' });
      return;
    }

    if (request.status !== 'pending') {
      res.status(400).json({ message: 'This request has already been handled' });
      return;
    }

    await db.update(friendRequests)
      .set({ status: 'rejected' })
      .where(eq(friendRequests.id, requestId));

    res.json({ success: true });
  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ message: 'Failed to reject friend request' });
  }
});

// DELETE /friends/:friendId - Remove a friend
router.delete('/friends/:friendId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { friendId } = req.params;

    // Delete both directions
    await db.delete(friendships).where(
      and(eq(friendships.userId, userId), eq(friendships.friendId, friendId))
    );
    await db.delete(friendships).where(
      and(eq(friendships.userId, friendId), eq(friendships.friendId, userId))
    );

    // Notify the removed friend
    try {
      const io = getIO();
      io.to(`user:${friendId}`).emit('friend:removed', { userId });
    } catch {}

    res.json({ success: true });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ message: 'Failed to remove friend' });
  }
});

export default router;
