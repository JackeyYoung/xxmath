/* core/sfx.js */
import { lsGet, lsSet } from './storage.js';

export const SFX = (function () {
  let ctx = null;
  let enabled = false;
  try { enabled = lsGet('grade3_sound_on') === '1'; } catch (e) {}

  function init() {
    if (ctx) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type, vol) {
    if (!enabled) return;
    init();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  return {
    isEnabled: () => enabled,
    setEnabled(v) {
      enabled = !!v;
      try { lsSet('grade3_sound_on', enabled ? '1' : '0'); } catch (e) {}
      if (enabled) init();
    },
    correct() { tone(880, 0.12, 'sine', 0.10); setTimeout(() => tone(1320, 0.10, 'sine', 0.08), 70); },
    wrong()   { tone(220, 0.18, 'triangle', 0.10); },
    finish()  { tone(660, 0.10, 'sine', 0.10); setTimeout(() => tone(880, 0.10, 'sine', 0.10), 100); setTimeout(() => tone(1100, 0.16, 'sine', 0.10), 200); },
    streak()  { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.10, 'sine', 0.10), i * 80)); }
  };
})();