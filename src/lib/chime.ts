let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
}

export function chime(): void {
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  gain.connect(ctx.destination);
  for (const [freq, at] of [
    [523.25, 0],
    [659.25, 0.14],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + at);
    osc.connect(gain);
    osc.start(now + at);
    osc.stop(now + at + 0.28);
  }
}
