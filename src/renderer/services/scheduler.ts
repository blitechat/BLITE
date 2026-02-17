import { sendMessage } from './socket'

const STORAGE_KEY = 'blite_scheduled_msgs'

export interface ScheduledMessage {
  id: string
  channelId: string
  content: string
  scheduledAt: string // ISO string
  isDM: boolean
  // Encrypted fields will be computed at send time
}

export function getScheduledMessages(): ScheduledMessage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function saveScheduledMessage(msg: ScheduledMessage): void {
  const messages = getScheduledMessages()
  messages.push(msg)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
}

export function removeScheduledMessage(id: string): void {
  const messages = getScheduledMessages().filter((m) => m.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
}

let intervalId: ReturnType<typeof setInterval> | null = null

export function initScheduler(
  encryptAndSend: (channelId: string, content: string, isDM: boolean) => Promise<void>
): void {
  if (intervalId) return

  intervalId = setInterval(async () => {
    const messages = getScheduledMessages()
    const now = new Date().toISOString()
    const due = messages.filter((m) => m.scheduledAt <= now)

    for (const msg of due) {
      try {
        await encryptAndSend(msg.channelId, msg.content, msg.isDM)
        removeScheduledMessage(msg.id)
      } catch (err) {
        console.error('[Scheduler] Failed to send scheduled message:', err)
      }
    }
  }, 10000) // Check every 10 seconds
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
