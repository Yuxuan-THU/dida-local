let audioContext: AudioContext | null = null;

export function playChime(kind: 'complete' | 'check' = 'complete') {
  try {
    audioContext ||= new AudioContext();
    const ctx = audioContext;
    if (ctx.state === 'suspended') ctx.resume();
    const notes = kind === 'complete' ? [523.25, 659.25, 783.99, 1046.5] : [660, 880];
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + index * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1);
    });
  } catch {
    // Audio is a nice-to-have; never block the timer.
  }
}

export function formatTimer(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}