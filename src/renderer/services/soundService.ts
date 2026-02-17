let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

function playTone(frequencies: number[], durationMs: number, volume = 0.15): void {
  try {
    const ctx = getAudioContext()
    const stepDuration = durationMs / frequencies.length / 1000

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.value = volume
      gain.gain.setValueAtTime(volume, ctx.currentTime + i * stepDuration)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (i + 1) * stepDuration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * stepDuration)
      osc.stop(ctx.currentTime + (i + 1) * stepDuration)
    })
  } catch {
    // Audio may not be available
  }
}

export function playMuteSound(): void {
  playTone([480, 320], 120)
}

export function playUnmuteSound(): void {
  playTone([320, 480], 120)
}

export function playDeafenSound(): void {
  playTone([400, 300, 200], 180)
}

export function playUndeafenSound(): void {
  playTone([200, 300, 400], 180)
}

// Ringtone state for looping
let ringtoneInterval: ReturnType<typeof setInterval> | null = null
let callingInterval: ReturnType<typeof setInterval> | null = null

function playRingtoneOnce(): void {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    // Classic phone ring pattern: two tones alternating
    const frequencies = [440, 480] // Standard phone ring frequencies
    const duration = 0.1

    for (let i = 0; i < 6; i++) {
      frequencies.forEach((freq, j) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.value = 0.12
        osc.connect(gain)
        gain.connect(ctx.destination)

        const startTime = now + i * 0.15
        gain.gain.setValueAtTime(0.12, startTime)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

        osc.start(startTime)
        osc.stop(startTime + duration)
      })
    }
  } catch {
    // Audio may not be available
  }
}

function playCallingToneOnce(): void {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    // Ringback tone: single tone
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 440
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(ctx.destination)

    gain.gain.setValueAtTime(0.08, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)

    osc.start(now)
    osc.stop(now + 0.8)
  } catch {
    // Audio may not be available
  }
}

export function startRingtone(): void {
  stopRingtone()
  playRingtoneOnce()
  ringtoneInterval = setInterval(playRingtoneOnce, 2000)
}

export function stopRingtone(): void {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval)
    ringtoneInterval = null
  }
}

export function startCallingTone(): void {
  stopCallingTone()
  playCallingToneOnce()
  callingInterval = setInterval(playCallingToneOnce, 3000)
}

export function stopCallingTone(): void {
  if (callingInterval) {
    clearInterval(callingInterval)
    callingInterval = null
  }
}

export function playCallConnectedSound(): void {
  playTone([300, 400, 500], 200, 0.1)
}

export function playCallEndedSound(): void {
  playTone([400, 300, 200], 300, 0.1)
}

export function playUserJoinedSound(): void {
  playTone([350, 450], 150, 0.08)
}

export function playUserLeftSound(): void {
  playTone([450, 350], 150, 0.08)
}

export function playMessageReceivedSound(): void {
  playTone([523, 659], 120, 0.06)
}
