// Single AudioContext instance, lazily initialised
let audioCtx: AudioContext | null = null;

// Module-level flag — updated by setSoundEnabled() on startup and when user toggles
let soundEnabled = true;

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

function getCtx(): AudioContext | null {
  if (!audioCtx) {
    if (typeof AudioContext === 'undefined') return null;
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Resume the AudioContext if suspended. Call on the first user gesture in a
 * learning session. On iOS Safari and Chrome the context starts suspended until
 * a user gesture triggers resume().
 */
export function initAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

/** Resume ctx if needed — safe to call from any click handler. */
function resumeIfSuspended(ctx: AudioContext): void {
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

/**
 * Bright, rising "ding" — correct answer feedback (~0.3s)
 */
export function playCorrect(): void {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  resumeIfSuspended(ctx);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.linearRampToValueAtTime(1760, now + 0.15);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
  gain.gain.setValueAtTime(0.3, now + 0.11);
  gain.gain.linearRampToValueAtTime(0, now + 0.31);

  osc.start(now);
  osc.stop(now + 0.31);
}

/**
 * Soft, descending tone — incorrect answer feedback (~0.3s)
 */
export function playIncorrect(): void {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  resumeIfSuspended(ctx);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(330, now);
  osc.frequency.linearRampToValueAtTime(220, now + 0.2);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
  gain.gain.setValueAtTime(0.25, now + 0.11);
  gain.gain.linearRampToValueAtTime(0, now + 0.31);

  osc.start(now);
  osc.stop(now + 0.31);
}

/**
 * Celebratory ascending arpeggio (C5-E5-G5) — session complete (~0.7s)
 */
export function playComplete(): void {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  resumeIfSuspended(ctx);

  const notes = [
    { freq: 523, start: 0.0, duration: 0.2 },   // C5
    { freq: 659, start: 0.15, duration: 0.2 },  // E5
    { freq: 784, start: 0.3, duration: 0.4 },   // G5
  ];

  const now = ctx.currentTime;
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.freq, now + note.start);

    const t0 = now + note.start;
    const t1 = t0 + note.duration;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.3, t0 + 0.01);
    gain.gain.setValueAtTime(0.3, t1 - 0.05);
    gain.gain.linearRampToValueAtTime(0, t1);

    osc.start(t0);
    osc.stop(t1);
  }
}
