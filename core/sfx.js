/* core/sfx.js */
import { lsGet, lsSet } from './storage.js';

export const SFX = (function () {
  let ctx = null;
  // ⭐ S7：不能在模块顶层读存储 —— main.js 里 initStorage() 此时还没跑，_memCache 为空，
  //    每次冷启动都会把开关判成 false（声音永远静音）。改为实时读，设置页一改立刻生效。
  function isEnabled() {
    try { return lsGet('grade3_sound_on') === '1'; } catch (e) { return false; }
  }

  function init() {
    if (ctx) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type, vol) {
    if (!isEnabled()) return;
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
    isEnabled,
    setEnabled(v) {
      const on = !!v;
      try { lsSet('grade3_sound_on', on ? '1' : '0'); } catch (e) {}
      if (on) init();
    },
    correct() { tone(880, 0.12, 'sine', 0.10); setTimeout(() => tone(1320, 0.10, 'sine', 0.08), 70); },
    wrong()   { tone(220, 0.18, 'triangle', 0.10); },
    finish()  { tone(660, 0.10, 'sine', 0.10); setTimeout(() => tone(880, 0.10, 'sine', 0.10), 100); setTimeout(() => tone(1100, 0.16, 'sine', 0.10), 200); },
    streak()  { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.10, 'sine', 0.10), i * 80)); }
  };
})();