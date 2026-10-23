/* core/ui/celebrate.js */
export const COMBO = { count: 0, lastAt: 0 };

export function burstStars(x, y, n = 5) {
  const emojis = ['⭐', '✨', '🌟', '💫', '🎉'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'star-burst';
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const ang = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 60;
    el.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    el.style.setProperty('--dx2', (Math.cos(ang) * dist * 1.8) + 'px');
    el.style.left = (x - 12) + 'px';
    el.style.top = (y - 12) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
}

export function burstConfetti(n = 60) {
  const colors = ['#fbbf24', '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = (Math.random() * 100) + 'vw';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = (2 + Math.random() * 1.5) + 's';
    el.style.animationDelay = (Math.random() * 0.4) + 's';
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

export function showComboBanner(text) {
  const el = document.createElement('div');
  el.className = 'combo-banner';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

export function onCorrect(x, y) {
  const now = Date.now();
  if (now - COMBO.lastAt < 180000) COMBO.count++;
  else COMBO.count = 1;
  COMBO.lastAt = now;

  burstStars(x, y, 5);

  if (COMBO.count === 5) { burstConfetti(80); showComboBanner('🔥 连对 5 题！'); }
  else if (COMBO.count === 10) { burstConfetti(120); showComboBanner('🏆 连对 10 题！太厉害了'); }
  else if (COMBO.count > 10 && COMBO.count % 5 === 0) { burstConfetti(60); showComboBanner(`🌟 连对 ${COMBO.count} 题！`); }
}