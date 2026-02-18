import { Device } from 'mediasoup-client'
import type { Transport, Producer, Consumer, RtpCapabilities } from 'mediasoup-client/lib/types'
import { getSocket } from './socket'
import { useAuthStore } from '../stores/authStore'
import { useVoiceStore } from '../stores/voiceStore'
import { useCallStore } from '../stores/callStore'
import { useSettingsStore } from '../stores/settingsStore'
import { playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound, playCallConnectedSound, playCallEndedSound } from './soundService'
import { cleanupGestureListener } from '../components/voice/AudioRenderer'
import {
  initVoiceE2EE,
  cleanupVoiceE2EE,
  rotateVoiceKey,
  attachEncryptTransform,
  attachDecryptTransform,
  isInsertableStreamsSupported,
  waitForPeerKey,
  requestPeerKey,
} from './e2ee/voiceE2EE'

// ─── State ──────────────────────────────────────────────────────────────────

let device: Device | null = null
let sendTransport: Transport | null = null
let recvTransport: Transport | null = null
let audioProducer: Producer | null = null
let videoProducer: Producer | null = null
let screenProducer: Producer | null = null
let screenAudioProducer: Producer | null = null
const consumers = new Map<string, Consumer>()

// Reconnection state
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5
let reconnectTimeout: NodeJS.Timeout | null = null

// Adaptive bitrate state
let statsMonitorInterval: NodeJS.Timeout | null = null
let lastPacketLoss = 0

// Join/leave lock to prevent race conditions
let joinPromise: Promise<void> | null = null

// Buffer for producers received during the connecting phase (before isConnected).
// In DM calls both sides join nearly simultaneously, so voice:newProducer can
// arrive before performDMJoin/performJoin finishes. Without buffering these are
// silently dropped and the peer's audio is never consumed.
const pendingProducers: Array<{ producerId: string; userId: string }> = []

/**
 * Queue a producer to be consumed once the connection is fully established.
 * Called from the socket handler when voice:newProducer arrives during isConnecting.
 */
export function queuePendingProducer(producerId: string, userId: string): void {
  pendingProducers.push({ producerId, userId })
  console.log(`[Voice] Queued pending producer ${producerId} from ${userId} (still connecting)`)
}

/**
 * Consume all producers that were queued while we were still connecting.
 */
async function drainPendingProducers(): Promise<void> {
  if (pendingProducers.length === 0) return
  console.log(`[Voice] Draining ${pendingProducers.length} pending producer(s)`)
  while (pendingProducers.length > 0) {
    const { producerId, userId } = pendingProducers.shift()!
    await consumeProducer(producerId, userId)
  }
}

// Flag to prevent cleanup during join operation
let isJoining = false

// Audio level monitoring for speaking indicator
let audioContext: AudioContext | null = null
let analyserNode: AnalyserNode | null = null
let audioLevelInterval: NodeJS.Timeout | null = null
let isSpeaking = false

// ICE servers for WebRTC
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
]

// Add TURN servers if configured
const turnUser = import.meta.env.VITE_TURN_USERNAME
const turnCred = import.meta.env.VITE_TURN_CREDENTIAL
if (turnUser && turnCred) {
  iceServers.push(
    { urls: 'turn:a.relay.metered.ca:80', username: turnUser, credential: turnCred } as any,
    { urls: 'turn:a.relay.metered.ca:443?transport=tcp', username: turnUser, credential: turnCred } as any,
  )
} else {
  // Fallback to free public TURN servers (OpenRelay)
  console.log('[Voice] No TURN credentials configured, using free public TURN servers')
  iceServers.push(
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' } as any,
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' } as any,
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' } as any,
  )
}

console.log('[Voice] ICE servers configured:', iceServers.length, 'servers')

// ─── Helpers ────────────────────────────────────────────────────────────────

function emit<T = any>(event: string, data?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = getSocket()
    if (!socket) {
      reject(new Error('Socket not connected'))
      return
    }
    socket.emit(event, data, (response: any) => {
      if (response?.error) {
        reject(new Error(response.error))
      } else {
        resolve(response as T)
      }
    })
  })
}

function getAudioConstraints(): MediaTrackConstraints {
  const settings = useSettingsStore.getState().audio

  const constraints: MediaTrackConstraints = {
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: settings.autoGainControl,
  }

  // Add device ID if specified
  if (settings.inputDeviceId) {
    constraints.deviceId = { exact: settings.inputDeviceId }
  }

  return constraints
}

/**
 * Start monitoring audio level to show speaking indicator
 */
function startAudioLevelMonitoring(stream: MediaStream): void {
  try {
    // Create audio context and analyser
    audioContext = new AudioContext()
    analyserNode = audioContext.createAnalyser()
    analyserNode.fftSize = 256

    const source = audioContext.createMediaStreamSource(stream)
    source.connect(analyserNode)

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount)
    const voiceStore = useVoiceStore.getState()
    const authStore = useAuthStore.getState()
    const userId = authStore.user?.id

    if (!userId) return

    // Check audio level every 100ms
    audioLevelInterval = setInterval(() => {
      if (!analyserNode) return

      analyserNode.getByteFrequencyData(dataArray)
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
      const normalizedLevel = (average / 255) * 100

      // Get voice activation settings
      const settings = useSettingsStore.getState().audio
      const threshold = settings.voiceActivationEnabled ? settings.voiceActivationThreshold : 20

      const shouldBeActive = normalizedLevel > threshold && !voiceStore.isMuted

      if (shouldBeActive && !isSpeaking) {
        isSpeaking = true
        voiceStore.setActiveSpeaker(userId)
      } else if (!shouldBeActive && isSpeaking) {
        isSpeaking = false
        voiceStore.setActiveSpeaker(null)
      }
    }, 100)
  } catch (err) {
    console.error('[Voice] Failed to start audio level monitoring:', err)
  }
}

/**
 * Stop monitoring audio level
 */
function stopAudioLevelMonitoring(): void {
  if (audioLevelInterval) {
    clearInterval(audioLevelInterval)
    audioLevelInterval = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  analyserNode = null
  isSpeaking = false
  useVoiceStore.getState().setActiveSpeaker(null)
}

/**
 * Handle transport reconnection with exponential backoff
 */
async function handleTransportReconnection(transportType: 'send' | 'recv'): Promise<void> {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[Voice] Max reconnection attempts reached')
    // Notify user
    const voiceStore = useVoiceStore.getState()
    if (voiceStore.currentChannelId) {
      console.log('[Voice] Disconnecting due to connection failure')
    }
    return
  }

  reconnectAttempts++
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 16000) // 1s, 2s, 4s, 8s, 16s

  console.log(`[Voice] Attempting to reconnect ${transportType} transport (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms`)

  reconnectTimeout = setTimeout(async () => {
    try {
      const voiceStore = useVoiceStore.getState()
      const channelId = voiceStore.currentChannelId
      const serverId = voiceStore.currentServerId
      if (!channelId || !serverId) {
        console.log('[Voice] No longer in voice channel, aborting reconnection')
        return
      }

      // Try to rejoin the voice channel
      console.log('[Voice] Reconnecting to voice channel:', channelId)
      await joinVoiceChannel(channelId, serverId)

      // Reset reconnect attempts on success
      reconnectAttempts = 0
      console.log('[Voice] Reconnection successful')
    } catch (error) {
      console.error('[Voice] Reconnection failed:', error)
      // Try again
      await handleTransportReconnection(transportType)
    }
  }, delay)
}

/**
 * Setup connection state monitoring for transports
 */
function setupTransportMonitoring(transport: Transport, type: 'send' | 'recv'): void {
  transport.on('connectionstatechange', (state) => {
    console.log(`[Voice] ${type} transport connection state:`, state)

    if (state === 'failed' || state === 'disconnected') {
      console.warn(`[Voice] ${type} transport ${state}, attempting reconnection`)
      handleTransportReconnection(type)
    } else if (state === 'connected') {
      // Reset reconnection attempts on successful connection
      reconnectAttempts = 0
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
      }
    }
  })
}

/**
 * Monitor connection stats and adapt video bitrate based on network conditions
 * TODO: Enhance with more sophisticated adaptation algorithms
 */
async function monitorConnectionStats(): Promise<void> {
  if (!sendTransport || !videoProducer) return

  try {
    const stats = await sendTransport.getStats()

    // Find outbound-rtp stats
    for (const [, stat] of stats) {
      if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
        const packetsLost = stat.packetsLost || 0
        const packetsSent = stat.packetsSent || 1
        const packetLossRate = (packetsLost / packetsSent) * 100

        // Simple adaptive logic:
        // - If packet loss > 5%, reduce bitrate
        // - If packet loss < 1% for sustained period, increase bitrate
        if (packetLossRate > 5 && lastPacketLoss > 5) {
          console.log(`[Voice] High packet loss detected (${packetLossRate.toFixed(2)}%), reducing bitrate`)
          // TODO: Implement bitrate reduction via setMaxSpatialLayer or encodings update
        } else if (packetLossRate < 1 && lastPacketLoss < 1) {
          console.log(`[Voice] Good network conditions (${packetLossRate.toFixed(2)}% loss), can increase bitrate`)
          // TODO: Implement bitrate increase
        }

        lastPacketLoss = packetLossRate
        break
      }
    }
  } catch (err) {
    console.error('[Voice] Failed to get connection stats:', err)
  }
}

function startStatsMonitoring(): void {
  if (statsMonitorInterval) return

  // Monitor stats every 5 seconds
  statsMonitorInterval = setInterval(() => {
    monitorConnectionStats()
  }, 5000)
}

function stopStatsMonitoring(): void {
  if (statsMonitorInterval) {
    clearInterval(statsMonitorInterval)
    statsMonitorInterval = null
  }
  lastPacketLoss = 0
}

// ─── Join / Leave ───────────────────────────────────────────────────────────

export async function joinVoiceChannel(channelId: string, serverId: string): Promise<void> {
  // Wait for any pending join/leave operation to complete (prevents race condition)
  if (joinPromise) {
    console.log('[Voice] Waiting for pending operation to complete')
    await joinPromise
  }

  const store = useVoiceStore.getState()

  console.log('[Voice] Joining channel:', channelId, 'server:', serverId)

  // Don't double-join while connecting
  if (store.isConnecting) {
    console.log('[Voice] Already connecting, skipping')
    return
  }

  // If already in this channel, leave
  if (store.currentChannelId === channelId && store.isConnected) {
    console.log('[Voice] Already in this channel, leaving')
    await leaveVoiceChannel()
    return
  }

  // If in a different channel, leave first
  if (store.currentChannelId && store.isConnected) {
    console.log('[Voice] In different channel, leaving first')
    await leaveVoiceChannel()
  }

  // Create join promise and execute join operation
  joinPromise = performJoin(channelId, serverId)

  try {
    await joinPromise
  } finally {
    joinPromise = null
  }
}

async function performJoin(channelId: string, serverId: string): Promise<void> {
  const store = useVoiceStore.getState()
  store.setConnecting(channelId, serverId)
  isJoining = true

  try {
    // 1. Join voice channel and get router capabilities
    console.log('[Voice] Sending voice:join request')
    const joinResponse = await emit<{
      routerRtpCapabilities: RtpCapabilities
      peers: Array<{
        userId: string
        displayName: string
        isMuted: boolean
        isDeafened: boolean
        isCameraOn: boolean
        isScreenSharing: boolean
        producers: Array<{ producerId: string; kind: string; appData: Record<string, unknown> }>
      }>
      channelId: string
    }>('voice:join', { channelId, serverId })

    console.log('[Voice] Joined successfully, peers:', joinResponse.peers.length)

    // 2. Create mediasoup Device and load capabilities
    device = new Device()
    await device.load({ routerRtpCapabilities: joinResponse.routerRtpCapabilities })
    console.log('[Voice] Device loaded')

    // Check if cleanup was called during async operation
    if (!device) {
      throw new Error('Voice connection was interrupted - please try again')
    }

    // 3. Create send transport
    console.log('[Voice] Creating send transport...')
    const sendTransportData = await emit<{
      id: string
      iceParameters: any
      iceCandidates: any[]
      dtlsParameters: any
    }>('voice:createTransport', { direction: 'send' })
    console.log('[Voice] Send transport created:', sendTransportData.id)

    // Check again after async operation
    if (!device) {
      throw new Error('Voice connection was interrupted - please try again')
    }

    // Enable encodedInsertableStreams on the PeerConnection so that
    // createEncodedStreams() can be called on senders/receivers for E2EE
    const e2eeSettings = isInsertableStreamsSupported()
      ? { encodedInsertableStreams: true }
      : {}

    sendTransport = device.createSendTransport({
      id: sendTransportData.id,
      iceParameters: sendTransportData.iceParameters,
      iceCandidates: sendTransportData.iceCandidates,
      dtlsParameters: sendTransportData.dtlsParameters,
      iceServers,
      additionalSettings: e2eeSettings,
    } as any)

    sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      console.log('[Voice] Send transport connecting...')
      try {
        await emit('voice:connectTransport', { direction: 'send', dtlsParameters })
        console.log('[Voice] Send transport connected')
        callback()
      } catch (err) {
        console.error('[Voice] Send transport connection failed:', err)
        errback(err as Error)
      }
    })

    sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      console.log('[Voice] Producing:', kind, 'source:', appData?.source)
      try {
        const response = await emit<{ producerId: string }>('voice:produce', {
          kind,
          rtpParameters,
          appData,
        })
        console.log('[Voice] Producer created:', response.producerId)
        callback({ id: response.producerId })
      } catch (err) {
        console.error('[Voice] Failed to produce:', err)
        errback(err as Error)
      }
    })

    // Setup connection monitoring for reconnection
    setupTransportMonitoring(sendTransport, 'send')

    // 4. Create recv transport
    console.log('[Voice] Creating recv transport...')
    const recvTransportData = await emit<{
      id: string
      iceParameters: any
      iceCandidates: any[]
      dtlsParameters: any
    }>('voice:createTransport', { direction: 'recv' })
    console.log('[Voice] Recv transport created:', recvTransportData.id)

    recvTransport = device.createRecvTransport({
      id: recvTransportData.id,
      iceParameters: recvTransportData.iceParameters,
      iceCandidates: recvTransportData.iceCandidates,
      dtlsParameters: recvTransportData.dtlsParameters,
      iceServers,
      additionalSettings: e2eeSettings,
    } as any)

    recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      console.log('[Voice] Recv transport connecting...')
      try {
        await emit('voice:connectTransport', { direction: 'recv', dtlsParameters })
        console.log('[Voice] Recv transport connected')
        callback()
      } catch (err) {
        console.error('[Voice] Recv transport connection failed:', err)
        errback(err as Error)
      }
    })

    // Setup connection monitoring for reconnection
    setupTransportMonitoring(recvTransport, 'recv')

    // 5. Start audio producer
    console.log('[Voice] Getting microphone access...')
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: getAudioConstraints(),
      })
      console.log('[Voice] Got microphone access')

      const audioTrack = audioStream.getAudioTracks()[0]
      console.log('[Voice] Creating audio producer...')
      audioProducer = await sendTransport.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: false,
          opusDtx: true,
        },
        appData: { source: 'mic' },
      })
      console.log('[Voice] Audio producer created:', audioProducer.id)
      attachEncryptTransform(audioProducer)

      store.setLocalAudioStream(audioStream)
      store.setAudioProducerId(audioProducer.id)

      // Start monitoring audio level for speaking indicator
      startAudioLevelMonitoring(audioStream)

      audioProducer.on('transportclose', () => {
        audioProducer = null
        store.setAudioProducerId(null)
        stopAudioLevelMonitoring()
      })
    } catch (err) {
      console.warn('Could not get audio:', err)
    }

    // 6. Initialize voice E2EE and wait for it to complete before consuming peers
    // This ensures we have our key ready and can request peers' keys
    try {
      await initVoiceE2EE(channelId)
      console.log('[Voice] E2EE initialized')
      // Give a moment for key exchange to propagate before consuming peers
      // This helps ensure peers have time to exchange ephemeral keys
      if (joinResponse.peers.length > 0) {
        console.log('[Voice] Waiting briefly for E2EE key exchange...')
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      console.log('[Voice] Proceeding to consume peers')
    } catch (err) {
      console.error('[Voice] E2EE init failed, continuing without E2EE:', err)
      // Continue without E2EE - audio/video still works
    }

    // 7. Add existing peers to store
    for (const peer of joinResponse.peers) {
      store.addPeer(peer.userId, peer.displayName)
      store.updatePeerState(peer.userId, {
        isMuted: peer.isMuted,
        isDeafened: peer.isDeafened,
        isCameraOn: peer.isCameraOn,
        isScreenSharing: peer.isScreenSharing,
      })

      // Consume existing producers
      for (const producer of peer.producers) {
        await consumeProducer(producer.producerId, peer.userId)
      }
    }

    isJoining = false
    store.setConnected()

    // Wait briefly for E2EE key exchange before draining pending producers
    if (pendingProducers.length > 0) {
      console.log('[Voice] Waiting for E2EE key exchange before draining pending producers...')
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Drain any producers that arrived during the connecting phase
    await drainPendingProducers()

    playCallConnectedSound()
  } catch (err: any) {
    console.error('Failed to join voice channel:', err)
    isJoining = false
    store.setConnectionError(err.message || 'Failed to join voice channel')
    cleanup()
  }
}

export async function leaveVoiceChannel(): Promise<void> {
  const voiceStore = useVoiceStore.getState()
  const wasDMCall = voiceStore.currentServerId === 'dm'

  // Play disconnect sound before cleanup
  playCallEndedSound()

  // Immediately cleanup locally for instant UI feedback
  cleanup()
  voiceStore.setDisconnected()

  // Clear call state if this was a DM call
  if (wasDMCall) {
    useCallStore.getState().clearCall()
  }

  // Notify server in background (fire and forget)
  try {
    emit('voice:leave').catch(() => {
      // Ignore errors - we've already cleaned up locally
    })
  } catch {
    // ignore
  }
}

export function cleanup(): void {
  console.log('[Voice] Cleanup started')

  // Clean up voice E2EE state
  cleanupVoiceE2EE()

  // Clear reconnection state
  reconnectAttempts = 0
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }

  // Stop adaptive bitrate monitoring
  stopStatsMonitoring()

  // Clean up audio gesture listeners
  cleanupGestureListener()

  // Close all consumers
  for (const consumer of consumers.values()) {
    consumer.close()
  }
  consumers.clear()

  // Stop audio level monitoring
  stopAudioLevelMonitoring()

  // Close producers
  if (audioProducer) {
    audioProducer.close()
    audioProducer = null
  }
  if (videoProducer) {
    videoProducer.close()
    videoProducer = null
  }
  if (screenProducer) {
    screenProducer.close()
    screenProducer = null
  }
  if (screenAudioProducer) {
    screenAudioProducer.close()
    screenAudioProducer = null
  }

  // Stop local media tracks
  const store = useVoiceStore.getState()
  store.localAudioStream?.getTracks().forEach((t) => t.stop())
  store.localVideoStream?.getTracks().forEach((t) => t.stop())
  store.localScreenStream?.getTracks().forEach((t) => t.stop())

  // Close transports
  if (sendTransport) {
    sendTransport.close()
    sendTransport = null
  }
  if (recvTransport) {
    recvTransport.close()
    recvTransport = null
  }

  device = null

  // CRITICAL FIX: Reset voice store state to prevent blocking future calls
  store.setDisconnected()
  console.log('[Voice] Cleanup completed - store reset to disconnected')
}

// ─── Media Producers ────────────────────────────────────────────────────────

export async function startCamera(): Promise<void> {
  if (!sendTransport || !device) return
  const store = useVoiceStore.getState()

  try {
    const videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    })

    const videoTrack = videoStream.getVideoTracks()[0]
    videoTrack.contentHint = 'motion'

    // Simulcast encoding layers
    const encodings = [
      { maxBitrate: 100000, scaleResolutionDownBy: 4 },
      { maxBitrate: 400000, scaleResolutionDownBy: 2 },
      { maxBitrate: 1200000, scaleResolutionDownBy: 1 },
    ]

    videoProducer = await sendTransport.produce({
      track: videoTrack,
      encodings,
      codecOptions: { videoGoogleStartBitrate: 1000 },
      appData: { source: 'camera' },
    })
    attachEncryptTransform(videoProducer)

    store.setLocalVideoStream(videoStream)
    store.setVideoProducerId(videoProducer.id)
    store.setCameraOn(true)

    // Start adaptive bitrate monitoring
    startStatsMonitoring()

    videoProducer.on('transportclose', () => {
      videoProducer = null
      store.setVideoProducerId(null)
      store.setCameraOn(false)
      stopStatsMonitoring()
    })
  } catch (err) {
    console.error('Failed to start camera:', err)
  }
}

export async function stopCamera(): Promise<void> {
  const store = useVoiceStore.getState()

  if (videoProducer) {
    const producerId = videoProducer.id
    videoProducer.close()
    videoProducer = null

    try {
      await emit('voice:closeProducer', { producerId })
    } catch {
      // ignore
    }
  }

  store.localVideoStream?.getTracks().forEach((t) => t.stop())
  store.setLocalVideoStream(null)
  store.setVideoProducerId(null)
  store.setCameraOn(false)
}

export async function startScreenShare(electronSourceId?: string, includeAudio: boolean = false): Promise<void> {
  if (!sendTransport || !device) return
  const store = useVoiceStore.getState()

  try {
    let screenStream: MediaStream

    if (electronSourceId) {
      // Electron: use getUserMedia with chromeMediaSource constraint
      const constraints: any = {
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: electronSourceId,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30,
          },
        },
      }
      if (includeAudio) {
        constraints.audio = {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: electronSourceId,
          },
        }
      } else {
        constraints.audio = false
      }
      screenStream = await navigator.mediaDevices.getUserMedia(constraints)
    } else {
      // Web browser: use standard getDisplayMedia
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: includeAudio,
      })
    }

    const screenTrack = screenStream.getVideoTracks()[0]
    screenTrack.contentHint = 'detail'

    screenProducer = await sendTransport.produce({
      track: screenTrack,
      encodings: [
        { maxBitrate: 500000, scaleResolutionDownBy: 2 },
        { maxBitrate: 2500000, scaleResolutionDownBy: 1 },
      ],
      codecOptions: { videoGoogleStartBitrate: 1000 },
      appData: { source: 'screen' },
    })
    attachEncryptTransform(screenProducer)

    // If we have an audio track from screen capture, produce it separately
    const screenAudioTrack = screenStream.getAudioTracks()[0]
    if (screenAudioTrack) {
      screenAudioProducer = await sendTransport.produce({
        track: screenAudioTrack,
        codecOptions: {
          opusStereo: true,
          opusDtx: true,
        },
        appData: { source: 'screen-audio' },
      })
      attachEncryptTransform(screenAudioProducer)

      screenAudioProducer.on('transportclose', () => {
        screenAudioProducer = null
      })
    }

    store.setLocalScreenStream(screenStream)
    store.setScreenProducerId(screenProducer.id)
    store.setScreenSharing(true)

    // Handle user stopping screen share via browser UI
    screenTrack.onended = () => {
      stopScreenShare()
    }

    screenProducer.on('transportclose', () => {
      screenProducer = null
      store.setScreenProducerId(null)
      store.setScreenSharing(false)
    })
  } catch (err) {
    console.error('Failed to start screen share:', err)
  }
}

export async function stopScreenShare(): Promise<void> {
  const store = useVoiceStore.getState()

  if (screenAudioProducer) {
    const producerId = screenAudioProducer.id
    screenAudioProducer.close()
    screenAudioProducer = null

    try {
      await emit('voice:closeProducer', { producerId })
    } catch {
      // ignore
    }
  }

  if (screenProducer) {
    const producerId = screenProducer.id
    screenProducer.close()
    screenProducer = null

    try {
      await emit('voice:closeProducer', { producerId })
    } catch {
      // ignore
    }
  }

  store.localScreenStream?.getTracks().forEach((t) => t.stop())
  store.setLocalScreenStream(null)
  store.setScreenProducerId(null)
  store.setScreenSharing(false)
}

// ─── Mute / Deafen ──────────────────────────────────────────────────────────

export async function toggleMute(): Promise<void> {
  const store = useVoiceStore.getState()
  const newMuted = !store.isMuted

  if (audioProducer) {
    if (newMuted) {
      await audioProducer.pause()
    } else {
      await audioProducer.resume()
    }
  }

  store.setMuted(newMuted)
  if (newMuted) playMuteSound()
  else playUnmuteSound()

  try {
    await emit('voice:toggleMute', { muted: newMuted })
  } catch {
    // ignore
  }
}

export async function toggleDeafen(): Promise<void> {
  const store = useVoiceStore.getState()
  const newDeafened = !store.isDeafened

  // Pause/resume all consumers
  for (const consumer of consumers.values()) {
    if (consumer.kind === 'audio') {
      if (newDeafened) {
        await consumer.pause()
      } else {
        await consumer.resume()
      }
    }
  }

  store.setDeafened(newDeafened)
  if (newDeafened) playDeafenSound()
  else playUndeafenSound()

  // Auto-mute when deafening
  if (newDeafened && !store.isMuted) {
    if (audioProducer) {
      await audioProducer.pause()
    }
    store.setMuted(true)
  }

  try {
    await emit('voice:toggleDeafen', { deafened: newDeafened })
  } catch {
    // ignore
  }
}

// ─── Consumer Management ────────────────────────────────────────────────────

export async function consumeProducer(producerId: string, producerUserId: string): Promise<void> {
  console.log('[Voice] Consuming producer:', producerId, 'from user:', producerUserId)
  if (!device || !recvTransport) {
    console.log('[Voice] Cannot consume: device or recvTransport not ready')
    return
  }
  const store = useVoiceStore.getState()
  const channelId = store.currentChannelId

  if (!channelId) {
    console.warn('[Voice] Cannot consume: no current channel')
    return
  }

  try {
    // Wait for peer's E2EE key before consuming (with timeout)
    // This prevents the race condition where we set up decrypt transforms before keys arrive
    if (isInsertableStreamsSupported()) {
      console.log(`[Voice] Waiting for E2EE key from user ${producerUserId}...`)
      const hasKey = await waitForPeerKey(producerUserId, 5000)

      if (!hasKey) {
        console.warn(`[Voice] Peer key not received within 5s, requesting explicitly...`)
        await requestPeerKey(channelId, producerUserId)

        // Wait longer after requesting - network might be slow
        const hasKeyAfterRequest = await waitForPeerKey(producerUserId, 5000)
        if (!hasKeyAfterRequest) {
          console.warn(`[Voice] ⚠ Still no key from ${producerUserId} after 10s total, will drop encrypted frames until key arrives`)
          // Try one more request in case the first was lost
          await requestPeerKey(channelId, producerUserId)
        }
      }
    }

    console.log('[Voice] Sending voice:consume request...')
    const response = await emit<{
      id: string
      producerId: string
      kind: 'audio' | 'video'
      rtpParameters: any
      appData: Record<string, unknown>
    }>('voice:consume', {
      producerId,
      rtpCapabilities: device.rtpCapabilities,
    })

    console.log('[Voice] Got consume response, kind:', response.kind, 'creating consumer...')

    const consumer = await recvTransport.consume({
      id: response.id,
      producerId: response.producerId,
      kind: response.kind,
      rtpParameters: response.rtpParameters,
      appData: response.appData,
    })
    attachDecryptTransform(consumer, producerUserId, channelId)

    consumers.set(consumer.id, consumer)
    console.log('[Voice] Consumer created locally:', consumer.id)

    // Ensure the peer exists in the store (might arrive before voice:user-joined event)
    if (!store.peers[producerUserId]) {
      console.log('[Voice] Adding peer to store:', producerUserId)
      store.addPeer(producerUserId, 'Unknown')
    }

    // Enable track BEFORE resuming on server to prevent frame drops
    consumer.track.enabled = true
    console.log('[Voice] Consumer track enabled:', consumer.track.enabled, 'readyState:', consumer.track.readyState)

    // Create a MediaStream from the consumer track BEFORE resuming
    const stream = new MediaStream([consumer.track])
    console.log('[Voice] Stream created for consumer, tracks:', stream.getTracks().length)

    // Resume consumer on server (now that track is enabled locally and stream is created)
    console.log('[Voice] Resuming consumer on server...')
    await emit('voice:resumeConsumer', { consumerId: consumer.id })
    console.log('[Voice] Consumer resumed:', consumer.id, 'kind:', response.kind)

    // Verify stream tracks are active
    stream.getTracks().forEach((track, i) => {
      console.log(`[Voice] Stream track ${i}: kind=${track.kind}, enabled=${track.enabled}, readyState=${track.readyState}, muted=${track.muted}, label=${track.label}`)
      // Force enable the track
      track.enabled = true
    })

    // Determine stream type from appData
    const source = response.appData?.source as string
    console.log('[Voice] Setting peer stream type:', source || response.kind, 'for user:', producerUserId)
    if (source === 'screen-audio') {
      store.setPeerStream(producerUserId, 'screen-audio', stream)
    } else if (response.kind === 'audio') {
      store.setPeerStream(producerUserId, 'audio', stream)
    } else if (source === 'screen') {
      store.setPeerStream(producerUserId, 'screen', stream)
    } else {
      store.setPeerStream(producerUserId, 'video', stream)
    }
    console.log('[Voice] Peer stream set successfully')

    store.addPeerConsumerId(producerUserId, consumer.id)

    consumer.on('transportclose', () => {
      consumers.delete(consumer.id)
      store.removePeerConsumerId(producerUserId, consumer.id)
    })

    consumer.on('producerclose', () => {
      consumers.delete(consumer.id)
      store.removePeerConsumerId(producerUserId, consumer.id)
      // Clear the stream
      if (source === 'screen-audio') {
        store.setPeerStream(producerUserId, 'screen-audio', null)
      } else if (response.kind === 'audio') {
        store.setPeerStream(producerUserId, 'audio', null)
      } else if (source === 'screen') {
        store.setPeerStream(producerUserId, 'screen', null)
      } else {
        store.setPeerStream(producerUserId, 'video', null)
      }
    })
  } catch (err) {
    console.error('Failed to consume producer:', err)
  }
}

// Called when a producer is closed remotely
export function handleProducerClosed(producerId: string, producerUserId: string): void {
  // Find and close the consumer for this producer
  for (const [consumerId, consumer] of consumers) {
    if (consumer.producerId === producerId) {
      consumer.close()
      consumers.delete(consumerId)
      useVoiceStore.getState().removePeerConsumerId(producerUserId, consumerId)
      break
    }
  }
}

// Close all consumers for a specific peer (called when peer leaves)
export function closePeerConsumers(userId: string): void {
  const store = useVoiceStore.getState()
  const peer = store.peers[userId]

  if (!peer) return

  // Close all consumers associated with this peer
  for (const consumerId of peer.consumerIds) {
    const consumer = consumers.get(consumerId)
    if (consumer) {
      console.log('[Voice] Closing consumer:', consumerId, 'for peer:', userId)
      consumer.close()
      consumers.delete(consumerId)
    }
  }
}

// ─── DM Calls ────────────────────────────────────────────────────────────────

export async function startDMCall(dmId: string, targetUserId: string, withVideo: boolean = false): Promise<void> {
  // Wait for any pending join/leave operation to complete (prevents race condition)
  if (joinPromise) {
    console.log('[Voice] Waiting for pending operation to complete')
    await joinPromise
  }

  const store = useVoiceStore.getState()

  console.log('[Voice] ==========================================')
  console.log('[Voice] Starting DM call to:', targetUserId)
  console.log('[Voice] DM ID:', dmId)
  console.log('[Voice] With video:', withVideo)
  console.log('[Voice] Current state - connected:', store.isConnected, 'connecting:', store.isConnecting)
  console.log('[Voice] Current channelId:', store.currentChannelId, 'serverId:', store.currentServerId)
  console.log('[Voice] ==========================================')

  // Don't double-join while connecting
  if (store.isConnecting) {
    console.log('[Voice] Already connecting to DM call, skipping')
    return
  }

  // If already in this DM call, skip
  if (store.currentChannelId === dmId && store.currentServerId === 'dm' && store.isConnected) {
    console.log('[Voice] Already in this DM call, skipping')
    return
  }

  // If in a different channel, leave first
  if (store.currentChannelId && store.isConnected) {
    console.log('[Voice] In different channel, leaving first')
    await leaveVoiceChannel()
  }

  // Create join promise and execute join operation
  joinPromise = performDMJoin(dmId, targetUserId, withVideo)

  try {
    await joinPromise
  } finally {
    joinPromise = null
  }
}

async function performDMJoin(dmId: string, targetUserId: string, withVideo: boolean): Promise<void> {
  const store = useVoiceStore.getState()
  console.log('[Voice] Setting connecting state...')
  store.setConnecting(dmId, 'dm')
  isJoining = true

  try {
    // Join DM voice channel (uses dmId as the channel identifier, 'dm' as serverId)
    console.log('[Voice] Sending voice:join for DM call')
    const joinResponse = await emit<{
      routerRtpCapabilities: RtpCapabilities
      peers: Array<{
        userId: string
        displayName: string
        isMuted: boolean
        isDeafened: boolean
        isCameraOn: boolean
        isScreenSharing: boolean
        producers: Array<{ producerId: string; kind: string; appData: Record<string, unknown> }>
      }>
      channelId: string
    }>('voice:join', { channelId: dmId, serverId: 'dm' })

    // Create mediasoup Device and load capabilities
    device = new Device()
    await device.load({ routerRtpCapabilities: joinResponse.routerRtpCapabilities })

    // Check if cleanup was called during async operation
    if (!device) {
      throw new Error('Voice connection was interrupted - please try again')
    }

    // Create send transport
    const sendTransportData = await emit<{
      id: string
      iceParameters: any
      iceCandidates: any[]
      dtlsParameters: any
    }>('voice:createTransport', { direction: 'send' })

    // Check again after async operation
    if (!device) {
      throw new Error('Voice connection was interrupted - please try again')
    }

    // Enable encodedInsertableStreams for E2EE on DM call transports
    const dmE2eeSettings = isInsertableStreamsSupported()
      ? { encodedInsertableStreams: true }
      : {}

    sendTransport = device.createSendTransport({
      id: sendTransportData.id,
      iceParameters: sendTransportData.iceParameters,
      iceCandidates: sendTransportData.iceCandidates,
      dtlsParameters: sendTransportData.dtlsParameters,
      iceServers,
      additionalSettings: dmE2eeSettings,
    } as any)

    sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await emit('voice:connectTransport', { direction: 'send', dtlsParameters })
        callback()
      } catch (err) {
        errback(err as Error)
      }
    })

    sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const response = await emit<{ producerId: string }>('voice:produce', {
          kind,
          rtpParameters,
          appData,
        })
        callback({ id: response.producerId })
      } catch (err) {
        errback(err as Error)
      }
    })

    // Setup connection monitoring
    setupTransportMonitoring(sendTransport, 'send')

    // Create recv transport
    const recvTransportData = await emit<{
      id: string
      iceParameters: any
      iceCandidates: any[]
      dtlsParameters: any
    }>('voice:createTransport', { direction: 'recv' })

    recvTransport = device.createRecvTransport({
      id: recvTransportData.id,
      iceParameters: recvTransportData.iceParameters,
      iceCandidates: recvTransportData.iceCandidates,
      dtlsParameters: recvTransportData.dtlsParameters,
      iceServers,
      additionalSettings: dmE2eeSettings,
    } as any)

    recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await emit('voice:connectTransport', { direction: 'recv', dtlsParameters })
        callback()
      } catch (err) {
        errback(err as Error)
      }
    })

    // Setup connection monitoring
    setupTransportMonitoring(recvTransport, 'recv')

    // Start audio
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: getAudioConstraints(),
      })

      store.setLocalAudioStream(audioStream)
      const audioTrack = audioStream.getAudioTracks()[0]

      audioProducer = await sendTransport.produce({
        track: audioTrack,
        codecOptions: { opusStereo: false, opusDtx: true },
        appData: { source: 'mic' },
      })
      attachEncryptTransform(audioProducer)

      store.setAudioProducerId(audioProducer.id)

      // Start monitoring audio level for speaking indicator
      startAudioLevelMonitoring(audioStream)

      audioProducer.on('transportclose', () => {
        audioProducer = null
        store.setAudioProducerId(null)
        stopAudioLevelMonitoring()
      })
    } catch (err) {
      console.warn('Could not get audio:', err)
    }

    // Start video if requested
    if (withVideo) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        })

        store.setLocalVideoStream(videoStream)
        const videoTrack = videoStream.getVideoTracks()[0]

        videoProducer = await sendTransport.produce({
          track: videoTrack,
          encodings: [
            { maxBitrate: 100000, scaleResolutionDownBy: 4 },
            { maxBitrate: 300000, scaleResolutionDownBy: 2 },
            { maxBitrate: 900000, scaleResolutionDownBy: 1 },
          ],
          codecOptions: { videoGoogleStartBitrate: 1000 },
          appData: { source: 'camera' },
        })
        attachEncryptTransform(videoProducer)

        store.setVideoProducerId(videoProducer.id)
        store.setCameraOn(true)

        videoProducer.on('transportclose', () => {
          videoProducer = null
          store.setVideoProducerId(null)
          store.setCameraOn(false)
        })
      } catch (err) {
        console.warn('Could not get video:', err)
      }
    }

    // Initialize voice E2EE and wait for completion before consuming peers
    try {
      await initVoiceE2EE(dmId)
      console.log('[Voice] DM call E2EE initialized')
      // Give a moment for key exchange to propagate before consuming peers
      if (joinResponse.peers.length > 0) {
        console.log('[Voice] Waiting briefly for E2EE key exchange...')
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (err) {
      console.error('[Voice] DM call E2EE init failed, continuing without E2EE:', err)
      // Audio/video still works without E2EE
    }

    // Add existing peers to store
    for (const peer of joinResponse.peers) {
      store.addPeer(peer.userId, peer.displayName)
      store.updatePeerState(peer.userId, {
        isMuted: peer.isMuted,
        isDeafened: peer.isDeafened,
        isCameraOn: peer.isCameraOn,
        isScreenSharing: peer.isScreenSharing,
      })

      // Consume existing producers
      for (const producer of peer.producers) {
        await consumeProducer(producer.producerId, peer.userId)
      }
    }

    isJoining = false
    store.setConnected()

    // Wait briefly for E2EE key exchange before draining pending producers (critical for DM calls)
    if (pendingProducers.length > 0) {
      console.log('[Voice] Waiting for E2EE key exchange before draining pending producers...')
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Drain any producers that arrived during the connecting phase (critical for DM calls)
    await drainPendingProducers()

    playCallConnectedSound()
    console.log('[Voice] ✓ DM call connected successfully')
  } catch (err: any) {
    console.error('[Voice] ✗ Failed to start DM call:', err)
    isJoining = false
    store.setConnectionError(err.message || 'Failed to start call')
    cleanup()
    throw err // Re-throw so the calling code can handle it
  }
}

// ─── Getters ────────────────────────────────────────────────────────────────

export function isInVoice(): boolean {
  return useVoiceStore.getState().isConnected
}

export function getCurrentChannelId(): string | null {
  return useVoiceStore.getState().currentChannelId
}
