/* core/lesson/step-machine.js
   底座 ③：useStepMachine()。m13 的四步法 / m9 的竖式步骤共用同一套状态机。

   关键设计（针对报告 M8）：**没有可变的 index**。
   「当前在做第几步」是由「哪些步骤已完成」派生出来的，因此：
   - 不可能跳步（未完成前一步，后一步永远是 locked）
   - 不可能出现「index 停在 0 但第 1 步已完成」这种状态与真相不一致
   - 不需要写 dataset.status，也不需要手动 sync

   Vue 化后：
     const m = defineMachine({ steps: [1,2,3,4], canComplete: (i) => filled.value[i] })
     <StepCard v-for="(s,i) in m.steps" :status="statusOf(i)" />
*/

export function defineMachine({ id = 'machine', steps, canComplete } = {}) {
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('[machine] steps 不能为空');
  if (canComplete != null && typeof canComplete !== 'function') throw new Error('[machine] canComplete 必须是函数');
  return Object.freeze({ id, steps: [...steps], canComplete });
}

/**
 * @param {ReturnType<typeof defineMachine>} machine
 * @param {{ canComplete?: (step:any, i:number) => boolean }} [override]
 */
export function createStepMachine(machine, override = {}) {
  const { steps } = machine;
  const canCompleteFn = override.canComplete || machine.canComplete || (() => false);

  const stepAt = (i) => steps[i];
  const isDone = (i) => i >= 0 && i < steps.length && !!canCompleteFn(stepAt(i), i);

  /** 当前应在做的步骤 = 第一个未完成的；全部完成时停在最后一步 */
  function activeIndex() {
    for (let i = 0; i < steps.length; i++) if (!isDone(i)) return i;
    return steps.length - 1;
  }

  /** 'done' | 'doing' | 'locked' —— 只能顺序解锁 */
  function statusOf(i) {
    if (i < 0 || i >= steps.length) return 'locked';
    if (isDone(i)) return 'done';
    return i === activeIndex() ? 'doing' : 'locked';
  }

  return {
    get steps() { return steps; },
    get total() { return steps.length; },
    get activeIndex() { return activeIndex(); },
    get current() { return stepAt(activeIndex()); },
    get isAllDone() { return steps.every((_, i) => isDone(i)); },
    /** 已完成步数 / 总步数（0..1） */
    get progress() { return steps.filter((_, i) => isDone(i)).length / steps.length; },
    statusOf,
    isDone,
    stepAt,
    /** 是否可以进入第 i 步（= 它已完成，或它就是当前步） */
    canEnter: (i) => isDone(i) || i === activeIndex(),
  };
}
