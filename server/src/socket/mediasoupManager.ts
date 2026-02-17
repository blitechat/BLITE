import * as mediasoup from 'mediasoup';
import {
  MEDIASOUP_LISTEN_IP,
  MEDIASOUP_ANNOUNCED_IP,
  MEDIASOUP_RTC_MIN_PORT,
  MEDIASOUP_RTC_MAX_PORT,
  MEDIASOUP_NUM_WORKERS,
  MEDIASOUP_USE_TCP_ONLY,
  MEDIASOUP_TCP_PORT,
} from '../config';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Peer {
  userId: string;
  socketId: string;
  displayName: string;
  sendTransport: mediasoup.types.WebRtcTransport | null;
  recvTransport: mediasoup.types.WebRtcTransport | null;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
}

export interface Room {
  channelId: string;
  serverId: string;
  router: mediasoup.types.Router;
  peers: Map<string, Peer>;
  audioLevelObserver: mediasoup.types.AudioLevelObserver | null;
}

export interface PeerSummary {
  userId: string;
  displayName: string;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
}

// ─── State ──────────────────────────────────────────────────────────────────

const workers: mediasoup.types.Worker[] = [];
let workerIndex = 0;

// Debug: log module identity to detect dual-instance issues
const MODULE_ID = Math.random().toString(36).slice(2, 8);
console.log(`[mediasoup] Module loaded, instance ID: ${MODULE_ID}`);
const rooms = new Map<string, Room>();

// Track which room each user is in: userId -> channelId
const userRoomMap = new Map<string, string>();

// ─── Media Codecs ───────────────────────────────────────────────────────────

const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: {
      'profile-id': 2,
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
];

// ─── Worker Management ──────────────────────────────────────────────────────

// Track router count per worker for load balancing
const workerRouterCounts = new Map<mediasoup.types.Worker, number>();

function getNextWorker(): mediasoup.types.Worker {
  if (workers.length === 0) {
    throw new Error(`No mediasoup workers available (module=${MODULE_ID}, workers.length=0). Workers may not be initialized or all workers have died.`);
  }

  // Use least-loaded worker selection instead of round-robin
  let leastLoadedWorker = workers[0];
  let minLoad = workerRouterCounts.get(leastLoadedWorker) || 0;

  for (const worker of workers) {
    const load = workerRouterCounts.get(worker) || 0;
    if (load < minLoad) {
      minLoad = load;
      leastLoadedWorker = worker;
    }
  }

  return leastLoadedWorker;
}

function incrementWorkerLoad(worker: mediasoup.types.Worker): void {
  const currentLoad = workerRouterCounts.get(worker) || 0;
  workerRouterCounts.set(worker, currentLoad + 1);
}

function decrementWorkerLoad(worker: mediasoup.types.Worker): void {
  const currentLoad = workerRouterCounts.get(worker) || 0;
  workerRouterCounts.set(worker, Math.max(0, currentLoad - 1));
}

export async function initializeWorkers(): Promise<void> {
  if (!MEDIASOUP_ANNOUNCED_IP) {
    console.warn('[mediasoup] WARNING: MEDIASOUP_ANNOUNCED_IP is not set!');
    console.warn('[mediasoup] Voice/video will NOT work in production without a public IP.');
    console.warn('[mediasoup] Set MEDIASOUP_ANNOUNCED_IP to your server\'s public IP or hostname.');
  }
  if (MEDIASOUP_USE_TCP_ONLY) {
    console.log(`[mediasoup] TCP-only mode enabled on port ${MEDIASOUP_TCP_PORT}`);
  }

  const numWorkers = MEDIASOUP_NUM_WORKERS;
  console.log(`[mediasoup] Creating ${numWorkers} worker(s)... (module=${MODULE_ID})`);

  for (let i = 0; i < numWorkers; i++) {
    await createWorker();
  }
}

async function createWorker(): Promise<mediasoup.types.Worker> {
  const worker = await mediasoup.createWorker({
    rtcMinPort: MEDIASOUP_RTC_MIN_PORT,
    rtcMaxPort: MEDIASOUP_RTC_MAX_PORT,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  });

  worker.on('died', async (error) => {
    console.error(`[mediasoup] Worker ${worker.pid} died:`, error);

    // Remove dead worker
    const idx = workers.indexOf(worker);
    if (idx !== -1) {
      workers.splice(idx, 1);
      console.log(`[mediasoup] Removed dead worker. ${workers.length} workers remaining`);
    }

    // Auto-recover: create a replacement worker
    try {
      console.log('[mediasoup] Creating replacement worker...');
      await createWorker();
      console.log('[mediasoup] Replacement worker created successfully');
    } catch (err) {
      console.error('[mediasoup] Failed to create replacement worker:', err);
    }
  });

  workers.push(worker);
  console.log(`[mediasoup] Worker ${worker.pid} created (${workers.length}/${MEDIASOUP_NUM_WORKERS})`);

  return worker;
}

export async function shutdownWorkers(): Promise<void> {
  console.log('[mediasoup] Shutting down workers...');

  for (const worker of workers) {
    try {
      worker.close();
      console.log(`[mediasoup] Worker ${worker.pid} closed`);
    } catch (err) {
      console.error(`[mediasoup] Error closing worker ${worker.pid}:`, err);
    }
  }

  workers.length = 0;
  console.log('[mediasoup] All workers shut down');
}

// ─── Room Management ────────────────────────────────────────────────────────

export async function getOrCreateRoom(channelId: string, serverId: string): Promise<Room> {
  let room = rooms.get(channelId);
  if (room) return room;

  const worker = getNextWorker();
  const router = await worker.createRouter({ mediaCodecs });

  // Increment worker load for load balancing
  incrementWorkerLoad(worker);

  let audioLevelObserver: mediasoup.types.AudioLevelObserver | null = null;
  try {
    // Optimized settings for lower latency active speaker detection
    audioLevelObserver = await router.createAudioLevelObserver({
      maxEntries: 3,      // Track top 3 speakers instead of 1
      threshold: -60,     // Less sensitive threshold to reduce false positives (-80dB → -60dB)
      interval: 100,      // Faster update interval for lower latency (300ms → 100ms)
    });
  } catch (e) {
    console.warn('[mediasoup] Could not create AudioLevelObserver:', e);
  }

  room = {
    channelId,
    serverId,
    router,
    peers: new Map(),
    audioLevelObserver,
  };

  // Store worker reference for cleanup
  (room as any).worker = worker;

  rooms.set(channelId, room);
  console.log(`[mediasoup] Room created for channel ${channelId} on worker with load ${workerRouterCounts.get(worker)}`);
  return room;
}

export function getRoom(channelId: string): Room | undefined {
  return rooms.get(channelId);
}

function cleanupRoom(channelId: string): void {
  const room = rooms.get(channelId);
  if (!room) return;

  if (room.peers.size === 0) {
    room.router.close();

    // Decrement worker load for load balancing
    const worker = (room as any).worker;
    if (worker) {
      decrementWorkerLoad(worker);
      console.log(`[mediasoup] Room cleaned up for channel ${channelId}, worker load now ${workerRouterCounts.get(worker)}`);
    }

    rooms.delete(channelId);
  }
}

// ─── Peer Management ────────────────────────────────────────────────────────

export function addPeer(room: Room, userId: string, socketId: string, displayName: string): Peer {
  // Remove from previous room if any
  const previousChannelId = userRoomMap.get(userId);
  if (previousChannelId && previousChannelId !== room.channelId) {
    removePeer(previousChannelId, userId);
  }

  const peer: Peer = {
    userId,
    socketId,
    displayName,
    sendTransport: null,
    recvTransport: null,
    producers: new Map(),
    consumers: new Map(),
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
  };

  room.peers.set(userId, peer);
  userRoomMap.set(userId, room.channelId);
  return peer;
}

export function removePeer(channelId: string, userId: string): Room | undefined {
  const room = rooms.get(channelId);
  if (!room) return undefined;

  const peer = room.peers.get(userId);
  if (!peer) return room;

  // Close all consumers
  for (const consumer of peer.consumers.values()) {
    consumer.close();
  }

  // Close all producers
  for (const producer of peer.producers.values()) {
    producer.close();
  }

  // Close transports
  if (peer.sendTransport) peer.sendTransport.close();
  if (peer.recvTransport) peer.recvTransport.close();

  room.peers.delete(userId);
  userRoomMap.delete(userId);

  // Cleanup empty room
  cleanupRoom(channelId);

  return room;
}

export function getUserRoom(userId: string): string | undefined {
  return userRoomMap.get(userId);
}

// ─── Transport Management ───────────────────────────────────────────────────

export async function createWebRtcTransport(
  room: Room,
  userId: string,
  direction: 'send' | 'recv'
): Promise<mediasoup.types.WebRtcTransport> {
  const peer = room.peers.get(userId);
  if (!peer) throw new Error('Peer not found');

  const announcedAddress = MEDIASOUP_ANNOUNCED_IP || undefined;

  let transportOptions: mediasoup.types.WebRtcTransportOptions;

  if (MEDIASOUP_USE_TCP_ONLY) {
    // TCP-only mode for restricted deployments
    transportOptions = {
      listenInfos: [
        {
          protocol: 'tcp' as const,
          ip: MEDIASOUP_LISTEN_IP,
          announcedAddress,
          port: MEDIASOUP_TCP_PORT,
        },
      ],
      enableUdp: false,
      enableTcp: true,
      preferUdp: false,
    };
  } else {
    // Local development: UDP + TCP
    transportOptions = {
      listenInfos: [
        {
          protocol: 'udp' as const,
          ip: MEDIASOUP_LISTEN_IP,
          announcedAddress,
        },
        {
          protocol: 'tcp' as const,
          ip: MEDIASOUP_LISTEN_IP,
          announcedAddress,
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    };
  }

  const transport = await room.router.createWebRtcTransport(transportOptions);

  // Set max incoming bitrate (increased from 3Mbps to 5Mbps for better quality)
  try {
    await transport.setMaxIncomingBitrate(5000000);
  } catch {
    // ignore
  }

  if (direction === 'send') {
    peer.sendTransport = transport;
  } else {
    peer.recvTransport = transport;
  }

  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'failed' || dtlsState === 'closed') {
      console.warn(`[mediasoup] Transport dtls state ${dtlsState} for ${userId}`);
      transport.close();
    }
  });

  return transport;
}

export async function connectTransport(
  room: Room,
  userId: string,
  direction: 'send' | 'recv',
  dtlsParameters: mediasoup.types.DtlsParameters
): Promise<void> {
  const peer = room.peers.get(userId);
  if (!peer) throw new Error('Peer not found');

  const transport = direction === 'send' ? peer.sendTransport : peer.recvTransport;
  if (!transport) throw new Error('Transport not found');

  await transport.connect({ dtlsParameters });
}

// ─── Producer Management ────────────────────────────────────────────────────

export async function createProducer(
  room: Room,
  userId: string,
  kind: mediasoup.types.MediaKind,
  rtpParameters: mediasoup.types.RtpParameters,
  appData: Record<string, unknown>
): Promise<mediasoup.types.Producer> {
  const peer = room.peers.get(userId);
  if (!peer) throw new Error('Peer not found');
  if (!peer.sendTransport) throw new Error('Send transport not found');

  const producer = await peer.sendTransport.produce({
    kind,
    rtpParameters,
    appData,
  });

  peer.producers.set(producer.id, producer);

  // Update peer state based on producer type
  const source = appData.source as string;
  if (source === 'camera') {
    peer.isCameraOn = true;
  } else if (source === 'screen') {
    peer.isScreenSharing = true;
  }

  // Add producer to audio level observer if it's a mic audio source (not screen-audio)
  if (kind === 'audio' && source === 'mic' && room.audioLevelObserver) {
    try {
      await room.audioLevelObserver.addProducer({ producerId: producer.id });
    } catch {
      // ignore
    }
  }

  producer.on('transportclose', () => {
    peer.producers.delete(producer.id);
  });

  return producer;
}

export async function pauseProducer(
  room: Room,
  userId: string,
  producerId: string
): Promise<void> {
  const peer = room.peers.get(userId);
  if (!peer) throw new Error('Peer not found');

  const producer = peer.producers.get(producerId);
  if (!producer) throw new Error('Producer not found');

  await producer.pause();
}

export async function resumeProducer(
  room: Room,
  userId: string,
  producerId: string
): Promise<void> {
  const peer = room.peers.get(userId);
  if (!peer) throw new Error('Peer not found');

  const producer = peer.producers.get(producerId);
  if (!producer) throw new Error('Producer not found');

  await producer.resume();
}

export function closeProducer(
  room: Room,
  userId: string,
  producerId: string
): string | undefined {
  const peer = room.peers.get(userId);
  if (!peer) return undefined;

  const producer = peer.producers.get(producerId);
  if (!producer) return undefined;

  const source = producer.appData.source as string;

  // Update peer state
  if (source === 'camera') {
    peer.isCameraOn = false;
  } else if (source === 'screen') {
    peer.isScreenSharing = false;
  }

  producer.close();
  peer.producers.delete(producerId);

  return source;
}

// ─── Consumer Management ────────────────────────────────────────────────────

export async function createConsumer(
  room: Room,
  consumerUserId: string,
  producerUserId: string,
  producerId: string,
  rtpCapabilities: mediasoup.types.RtpCapabilities
): Promise<mediasoup.types.Consumer | null> {
  const consumerPeer = room.peers.get(consumerUserId);
  if (!consumerPeer) return null;
  if (!consumerPeer.recvTransport) return null;

  // Check if the router can consume this producer
  if (!room.router.canConsume({ producerId, rtpCapabilities })) {
    console.warn(`[mediasoup] Cannot consume producer ${producerId}`);
    return null;
  }

  const producerPeer = room.peers.get(producerUserId);

  const consumer = await consumerPeer.recvTransport.consume({
    producerId,
    rtpCapabilities,
    paused: true, // Start paused, client will resume after setup
    appData: {
      producerUserId,
      source: producerPeer?.producers.get(producerId)?.appData.source || 'unknown',
    },
  });

  consumerPeer.consumers.set(consumer.id, consumer);

  consumer.on('transportclose', () => {
    consumerPeer.consumers.delete(consumer.id);
  });

  consumer.on('producerclose', () => {
    consumerPeer.consumers.delete(consumer.id);
  });

  return consumer;
}

export async function resumeConsumer(
  room: Room,
  userId: string,
  consumerId: string
): Promise<void> {
  const peer = room.peers.get(userId);
  if (!peer) throw new Error('Peer not found');

  const consumer = peer.consumers.get(consumerId);
  if (!consumer) throw new Error('Consumer not found');

  await consumer.resume();
}

// ─── Query Helpers ──────────────────────────────────────────────────────────

export function getRoomPeers(channelId: string): PeerSummary[] {
  const room = rooms.get(channelId);
  if (!room) return [];

  const summaries: PeerSummary[] = [];
  for (const peer of room.peers.values()) {
    summaries.push({
      userId: peer.userId,
      displayName: peer.displayName,
      isMuted: peer.isMuted,
      isDeafened: peer.isDeafened,
      isCameraOn: peer.isCameraOn,
      isScreenSharing: peer.isScreenSharing,
    });
  }
  return summaries;
}

export function getRoomRouterCapabilities(channelId: string): mediasoup.types.RtpCapabilities | null {
  const room = rooms.get(channelId);
  if (!room) return null;
  return room.router.rtpCapabilities;
}

export function getPeerProducers(channelId: string, userId: string): Array<{
  producerId: string;
  kind: mediasoup.types.MediaKind;
  appData: Record<string, unknown>;
}> {
  const room = rooms.get(channelId);
  if (!room) return [];

  const peer = room.peers.get(userId);
  if (!peer) return [];

  const result: Array<{
    producerId: string;
    kind: mediasoup.types.MediaKind;
    appData: Record<string, unknown>;
  }> = [];

  for (const producer of peer.producers.values()) {
    result.push({
      producerId: producer.id,
      kind: producer.kind,
      appData: producer.appData as Record<string, unknown>,
    });
  }
  return result;
}

// Get all rooms for a server (for channel occupancy updates)
export function getServerRoomOccupancy(serverId: string): Record<string, PeerSummary[]> {
  const occupancy: Record<string, PeerSummary[]> = {};
  for (const [channelId, room] of rooms) {
    if (room.serverId === serverId && room.peers.size > 0) {
      occupancy[channelId] = getRoomPeers(channelId);
    }
  }
  return occupancy;
}
