/* core/ui/global-observer.js
   UI 事件订阅中心
   取代：hookSfx / hookCorrectCelebration / hookFeedbackToThumbBar
*/
import { onUI } from './bus-ui.js';
import { onCorrect } from './celebrate.js';
import { SFX } from '../sfx.js';


let correctCount = 0;
let errorCount = 0;

export function installUIListeners() {
  // 监听答对
  onUI('CORRECT', ({ x, y } = {}) => {
    if (SFX.isEnabled()) SFX.correct();
    // ⭐ 修复：13 个模块里只有 m1/m9 发 CORRECT，且都不带坐标 → 撒花/连对横幅永远不触发。
    //    没有坐标时退化到视口中上部，至少让庆祝动效生效。
    const cx = typeof x === 'number' ? x : window.innerWidth / 2;
    const cy = typeof y === 'number' ? y : window.innerHeight / 3;
    onCorrect(cx, cy);
    correctCount++; errorCount = 0;
  });

  // 监听答错（旧版 Koji 连错气泡已下线：全站唯一入口 = Aji 悬浮球）
  onUI('WRONG', () => {
    if (SFX.isEnabled()) SFX.wrong();
    errorCount++; correctCount = 0;
  });

  // 监听拇指条
  onUI('THUMB', async ({ text, ok, onNext }) => {
    const { showThumbBar } = await import('../../app/shell.js');
    showThumbBar({ text, ok, onNext });
  });
}
