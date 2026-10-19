// Ogohlantirish ovozi (WebAudio — fayl kerak emas). DANGER balandroq.
let ctx: AudioContext | null = null;

export function beep(danger: boolean): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = danger ? 880 : 560;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(danger ? 0.3 : 0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (danger ? 0.5 : 0.25));
    osc.start(now);
    osc.stop(now + (danger ? 0.5 : 0.25));
    if (danger) {
      // ikkinchi "bip"
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.frequency.value = 880;
      g2.gain.setValueAtTime(0.0001, now + 0.25);
      g2.gain.exponentialRampToValueAtTime(0.3, now + 0.27);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      osc2.start(now + 0.25);
      osc2.stop(now + 0.6);
    }
  } catch {
    // audio bloklangan bo'lishi mumkin
  }
}
