/* app/templates.js
   所有模块的 HTML 模板统一管理，注入到隐藏容器中
*/

export function injectTemplates() {
  // 如果已经注入过，直接返回，避免重复
  if (document.getElementById('app-templates')) return;

  const div = document.createElement('div');
  div.id = 'app-templates';
  div.style.display = 'none';

  div.innerHTML = `
    <!-- ① 混合运算 -->
    <template id="tpl-m1">
      <div class="card">
        <h2>① 混合运算 · 步步为营</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>先算乘除，后算加减。点击算式中的运算符，把它先算出来。</p>
        </details>
        <div class="problem-bar">
          <select id="m1Select"></select>
          <button class="btn" id="m1Load">📥 载入</button>
          <input type="text" id="m1Custom" placeholder="或输入算式，如：12 × 3 + 15">
          <button class="btn-secondary" id="m1UseCustom">使用</button>
          <label class="file-btn">📎 上传 txt<input type="file" id="m1Upload" accept=".txt" hidden></label>
          <button class="btn-secondary" id="m1Random">🎲 随机出题</button>
        </div>
        <div class="expr-box"><div class="expr" id="m1expr"></div></div>
        <div id="m1PriorityBox" class="priority-box" style="display:none;">
          <div class="priority-label">🤔 想一想：这道题应该先算哪一步？</div>
          <div class="priority-options" id="m1PriorityOptions"></div>
          <div id="m1PriorityFeedback" class="priority-feedback"></div>
        </div>
        <div class="steps-box" id="m1steps"></div>
        <div class="feedback" id="m1fb">点击算式中的运算符，把它先算出来 👆</div>
        <div class="btn-row">
          <button class="btn-secondary" id="m1reset">🔄 重来一次</button>
        </div>
      </div>
    </template>

    <!-- ② 乘法面积 -->
    <template id="tpl-m2">
      <div class="card">
        <h2>② 多位数乘一位数 · 铺地砖</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>一块一块地铺满地面，看看 12 × 3 到底是怎么算出来的。</p>
        </details>
        <div class="controls">
          <label>每行 <input type="range" id="m2a" min="11" max="25" value="12"> <span class="val" id="m2aval">12</span> 块</label>
          <label>共 <input type="range" id="m2b" min="2" max="6" value="3"> <span class="val" id="m2bval">3</span> 行</label>
        </div>
        <canvas id="m2canvas" width="720" height="420"></canvas>
        <div class="btn-row" style="justify-content:center;">
          <button class="btn" id="m2fill">🧱 铺一行</button>
          <button class="btn-secondary" id="m2split">✂️ 拆分模式</button>
          <button class="btn-secondary" id="m2clear">🔄 重来</button>
        </div>
        <div class="calc-display" id="m2calc"></div>
      </div>
    </template>

    <!-- ③ 分数披萨 -->
    <template id="tpl-m3">
      <div class="card">
        <h2>③ 分数的初步认识 · 披萨分一分</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>拖动滑块改变份数，点击披萨上的每一块来"取走"它。</p>
        </details>
        <div class="controls" style="justify-content:center;margin-bottom:22px;">
          <label>平均分成 <input type="range" id="m3denRange" min="2" max="12" value="4"> <span class="val" id="m3denval">4</span> 份</label>
        </div>
        <div class="frac-wrap">
          <canvas id="m3canvas" width="340" height="340"></canvas>
          <div class="frac-info">
            <div class="frac"><span id="m3num">0</span><span class="line"></span><span id="m3denText">4</span></div>
            <div class="frac-text" id="m3text">还没有选任何一份</div>
          </div>
        </div>
        <div class="frac-extra">
          <div class="frac-extra-tabs">
            <button class="frac-tab active" data-frac-mode="compare">⚖️ 比大小</button>
            <button class="frac-tab" data-frac-mode="add">➕ 分数加法</button>
            <button class="frac-tab" data-frac-mode="sub">➖ 分数减法</button>
            <button class="frac-tab" data-frac-mode="equiv">🟰 等值分数</button>
          </div>
          <div id="fracExtraContent" class="frac-extra-content"></div>
        </div>
        <div class="btn-row" style="justify-content:center;">
          <button class="btn-secondary" id="m3clear">🔄 清空重选</button>
        </div>
      </div>
    </template>

    <!-- ④ 长度单位 -->
    <template id="tpl-m4">
      <div class="card">
        <h2>④ 毫米、分米和千米 · 单位换算器</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>长度单位每相邻两个之间都是 10 倍关系（千米和米之间是 1000 倍）。</p>
        </details>
        <div class="ladder">
          <div class="rung"><span class="unit-name">千米</span><span class="unit-sym">km</span></div>
          <div class="arrow-row">↓ × 1000 &nbsp;&nbsp; ↑ ÷ 1000</div>
          <div class="rung"><span class="unit-name">米</span><span class="unit-sym">m</span></div>
          <div class="arrow-row">↓ × 10 &nbsp;&nbsp; ↑ ÷ 10</div>
          <div class="rung"><span class="unit-name">分米</span><span class="unit-sym">dm</span></div>
          <div class="arrow-row">↓ × 10 &nbsp;&nbsp; ↑ ÷ 10</div>
          <div class="rung"><span class="unit-name">厘米</span><span class="unit-sym">cm</span></div>
          <div class="arrow-row">↓ × 10 &nbsp;&nbsp; ↑ ÷ 10</div>
          <div class="rung"><span class="unit-name">毫米</span><span class="unit-sym">mm</span></div>
        </div>
        <div class="converter">
          <input type="text" inputmode="decimal" id="m4val" value="3" min="0" step="any">
          <select id="m4unit">
            <option value="km">千米</option><option value="m" selected>米</option>
            <option value="dm">分米</option><option value="cm">厘米</option>
            <option value="mm">毫米</option>
          </select>
          <span style="font-size:16px;font-weight:700;color:var(--muted);">= ?</span>
        </div>
        <div class="result-list" id="m4results"></div>
        <div class="quiz-box">
          <div class="quiz-q" id="m4quizq">点击下方按钮开始小测</div>
          <div class="quiz-row">
            <button class="btn" id="m4newq">🎲 出题</button>
            <input type="text" inputmode="decimal" id="m4answer" placeholder="答案" step="any">
            <button class="btn-secondary" id="m4check">✔ 检查</button>
          </div>
          <div class="feedback" id="m4fb" style="margin-top:14px;display:none;"></div>
        </div>
      </div>
    </template>

    <!-- ⑤ 面积周长 -->
    <template id="tpl-m5">
      <div class="card">
        <h2>⑤ 长方形和正方形的面积 · 围栏与地砖</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>拖动滑块改变长和宽，观察面积和周长各自怎么变化。</p>
        </details>
        <div class="controls" style="justify-content:center;">
          <label>长 <input type="range" id="m5w" min="1" max="10" value="5"> <span class="val" id="m5wval">5</span></label>
          <label>宽 <input type="range" id="m5h" min="1" max="10" value="3"> <span class="val" id="m5hval">3</span></label>
        </div>
        <div class="grid-wrap"><div class="grid" id="m5grid"></div></div>
        <div class="stats">
          <div class="stat area"><div class="label">面积（方块数）</div><div class="value" id="m5area">15</div></div>
          <div class="stat perim"><div class="label">周长（边线长）</div><div class="value" id="m5perim">16</div></div>
        </div>
        <div class="btn-row" style="justify-content:center;">
          <button class="btn" id="m5record">📝 记录数据</button>
          <button class="btn-secondary" id="m5cleartable">🗑 清空表格</button>
        </div>
        <table class="data-table" id="m5table">
          <thead><tr><th>序号</th><th>长</th><th>宽</th><th>面积 = 长 × 宽</th><th>周长 = (长+宽) × 2</th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="step-card" style="margin-top:24px;">
          <div class="step-title">
            <span class="step-num">🎯</span>逆向挑战
          </div>
          <div id="m5Challenge" style="padding:16px;background:var(--card);border-radius:12px;border:2px solid var(--border);"></div>
          <div class="btn-row" style="justify-content:center;margin-top:12px;">
            <button class="btn" id="m5NewChallenge">🎲 出新题</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ⑥ 小数认识 -->
    <template id="tpl-m6">
      <div class="card">
        <h2>⑥ 小数的初步认识 · 元角分</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>1 元 = 10 角 = 100 分。往钱包里放硬币，看看一共是多少元。</p>
        </details>
        <div class="coin-row" id="m6coins"></div>
        <div class="money-display">
          <div class="money-big" id="m6total">0.00<small>元</small></div>
          <div class="money-sub" id="m6sub">还没有放硬币</div>
        </div>
        <div class="numline" id="m6numline"></div>
        <div class="btn-row" style="justify-content:center;">
          <button class="btn-secondary" id="m6clear">🔄 清空钱包</button>
        </div>
      </div>
    </template>

    <!-- ⑦ 时分秒 -->
    <template id="tpl-m7">
      <div class="card">
        <h2>⑦ 时、分、秒 · 时钟与秒表</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>拖动分针或让秒针自动走，观察时分秒的关系。切换到秒表模式，体验正计时和倒计时。</p>
        </details>
        <div class="clock-wrap">
          <canvas id="m7canvas" width="320" height="320"></canvas>
          <div class="clock-info">
            <div class="clock-digital" id="m7digital">3:00:00</div>
            <div class="clock-chinese" id="m7chinese">三时整</div>
            <div class="btn-row" style="justify-content:center;">
              <button class="btn-secondary" id="m7toggle">⏸ 暂停</button>
              <button class="btn-secondary" id="m7sound">🔇 滴答声</button>
              <button class="btn-secondary" id="m7reset">🔄 回到 3:00</button>
            </div>
          </div>
        </div>
        <div class="stopwatch-panel">
          <div class="sw-tabs">
            <button class="sw-tab active" data-mode="clock">🕐 时钟模式</button>
            <button class="sw-tab" data-mode="up">⏱ 秒表正计时</button>
            <button class="sw-tab" data-mode="down">⏳ 秒表倒计时</button>
          </div>
          <div class="sw-display" id="swDisplay">00:00<small>.0</small></div>
          <div class="sw-controls" id="swControls">
            <button class="btn" id="swToggle">▶ 开始</button>
            <button class="btn-secondary" id="swReset">🔄 归零</button>
            <div class="sw-input-group" id="swSetup" style="display:none;">
              倒计时设置：
              <input type="text" inputmode="decimal" id="swMin" value="1" min="0" max="59"> 分
              <input type="text" inputmode="decimal" id="swSec" value="0" min="0" max="59"> 秒
            </div>
          </div>
          <div class="sw-hint" id="swHint">
            💡 时钟模式下，秒针每秒走一格；秒表模式下可精确计时到 0.1 秒。
          </div>
        </div>
        <div class="step-card" style="margin-top:24px;">
          <div class="step-title">
            <span class="step-num">🧮</span>时间推算
            <span class="step-tip">算一算经过多少时间</span>
          </div>
          <div id="m7CalcChallenge" style="padding:16px;background:var(--card);border-radius:12px;min-height:120px;"></div>
          <div class="btn-row" style="justify-content:center;margin-top:12px;">
            <button class="btn" id="m7NewCalcChallenge">🎲 出新题</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ⑧ 倍的认识 -->
    <template id="tpl-m8">
      <div class="card">
        <h2>⑧ 倍的认识 · 图形倍数</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>第一行摆几个图形，第二行摆的是它的几倍。拖动滑块，数一数、圈一圈。</p>
        </details>
        <div class="controls" style="justify-content:center; flex-wrap:wrap;">
          <label>第一行 <input type="range" id="m8base" min="1" max="5" value="3"> <span class="val" id="m8baseval">3</span> 个</label>
          <label>第二行是它的 <input type="range" id="m8times" min="1" max="20" value="3"> <span class="val" id="m8timesval">3</span> 倍</label>
        </div>
        <div class="bei-wrap">
          <div class="bei-row"><span class="bei-label">第一行：</span><div id="m8row1" style="display:flex;gap:6px;"></div></div>
          <div class="bei-row"><span class="bei-label">第二行：</span><div id="m8row2" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;"></div></div>
        </div>
        <div class="calc-display" style="padding:22px;">
          <div id="m8result"></div>
        </div>
        <details style="margin-top:26px;font-size:13px;color:var(--muted);">
          <summary style="cursor:pointer;font-weight:600;color:var(--muted);user-select:none;list-style:none;padding:6px 0;text-align:center;">
            ⚙️ 老师配置（点击展开）
          </summary>
          <div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center;align-items:center;padding:14px 16px;margin-top:8px;background:var(--bg);border-radius:10px;border:1px dashed var(--border);">
            <label style="display:flex;align-items:center;gap:8px;color:var(--muted);font-weight:600;">
              第一行上限
              <input type="text" inputmode="decimal" id="m8baseMax" min="1" max="20" value="5"
                      style="width:56px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;font-weight:700;text-align:center;font-family:inherit;outline:none;color:var(--muted);background:var(--card);">
            </label>
            <label style="display:flex;align-items:center;gap:8px;color:var(--muted);font-weight:600;">
              倍的上限
              <input type="text" inputmode="decimal" id="m8max" min="2" max="50" value="20"
                      style="width:56px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;font-weight:700;text-align:center;font-family:inherit;outline:none;color:var(--muted);background:var(--card);">
            </label>
            <span style="color:var(--muted);font-weight:500;font-size:12px;">数字越小越适合低年级</span>
          </div>
        </details>
      </div>
    </template>

    <!-- ⑨ 竖式运算 -->
    <template id="tpl-m9">
      <div class="card">
        <h2>⑨ 竖式运算 · 加减乘除</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>选择运算类型，输入数字，点击「下一步」逐步计算。每一步的得数、进位、借位都由你来填。</p>
        </details>
        <div class="controls" style="justify-content:center; align-items:center; flex-wrap:wrap;">
          <input type="text" inputmode="decimal" id="m9a" value="348" min="0" max="999"
                  style="width:100px;padding:10px;border:2px solid var(--border);border-radius:10px;font-size:18px;font-weight:700;text-align:center;font-family:ui-monospace,monospace;outline:none;">
          <select id="m9op"
                  style="padding:10px 14px;border:2px solid var(--border);border-radius:10px;font-size:18px;font-weight:700;background:var(--card);outline:none;">
            <option>+</option><option>−</option><option>×</option><option>÷</option>
          </select>
          <button class="btn-secondary" id="m9random" title="随机生成一道题">🎲 随机</button>
          <input type="text" inputmode="decimal" id="m9b" value="176" min="0" max="999"
                  style="width:100px;padding:10px;border:2px solid var(--border);border-radius:10px;font-size:18px;font-weight:700;text-align:center;font-family:ui-monospace,monospace;outline:none;">
        </div>
        <div id="m9display" style="display:flex;justify-content:center;margin:20px 0;"></div>
        <div id="m9EstimateBox" class="priority-box" style="display:none;">
          <div class="priority-label">🤔 先估一估：这道题的结果大约是多少？</div>
          <div class="priority-options" id="m9EstimateOptions"></div>
          <div id="m9EstimateFeedback" class="priority-feedback"></div>
        </div>
        <div class="btn-row" style="justify-content:center;">
          <button class="btn" id="m9step">▶ 下一步</button>
          <button class="btn-secondary" id="m9reset">🔄 重来</button>
        </div>
        <div class="feedback" id="m9fb">点击「下一步」，开始计算</div>
      </div>
    </template>

    <!-- ⑩ 年月日 -->
    <template id="tpl-m10">
      <div class="card">
        <h2>⑩ 年月日 · 日历探索</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>切换年份和月份，看看每个月的天数有什么规律。</p>
        </details>
        <div class="controls" style="justify-content:center; align-items:center;">
          <label>年份 <input type="text" inputmode="decimal" id="m10year" value="2026" min="1900" max="2100" style="width:100px;padding:8px 10px;border:2px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;text-align:center;font-family:inherit;outline:none;"></label>
          <label>月份
            <select id="m10month" style="padding:8px 12px;border:2px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;background:var(--card);outline:none;">
              <option>1</option><option>2</option><option>3</option><option>4</option>
              <option>5</option><option>6</option><option>7</option><option>8</option>
              <option>9</option><option>10</option><option>11</option><option>12</option>
            </select>
          </label>
        </div>
        <div style="text-align:center;font-size:24px;font-weight:800;color:var(--primary-d);margin-top:10px;" id="m10title">2026 年 10 月</div>
        <table class="calendar" id="m10calendar"></table>
        <div class="feedback ok" id="m10info"></div>
      </div>
    </template>

    <!-- ⑪ 位置方向 -->
    <template id="tpl-m11">
      <div class="card">
        <h2>⑪ 位置与方向 · 方阵坐标</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>点击方阵中的任意格子，看看它在第几列、第几行。</p>
        </details>
        <div id="m11grid-wrap" style="overflow-x:auto;"></div>
        <div class="calc-display"><div class="calc-final" id="m11result">还没有选位置</div></div>
      </div>
    </template>

    <!-- ⑫ 吨的认识 -->
    <template id="tpl-m12">
      <div class="card">
        <h2>⑫ 吨的认识 · 质量单位换算</h2>
        <details class="lesson-hint">
          <summary>💡 不会做？点我看提示</summary>
          <p>1 吨 = 1000 千克，1 千克 = 1000 克。</p>
        </details>
        <div class="ladder">
          <div class="rung"><span class="unit-name">吨</span><span class="unit-sym">t</span></div>
          <div class="arrow-row">↓ × 1000 &nbsp;&nbsp; ↑ ÷ 1000</div>
          <div class="rung"><span class="unit-name">千克</span><span class="unit-sym">kg</span></div>
          <div class="arrow-row">↓ × 1000 &nbsp;&nbsp; ↑ ÷ 1000</div>
          <div class="rung"><span class="unit-name">克</span><span class="unit-sym">g</span></div>
        </div>
        <div class="converter">
          <input type="text" inputmode="decimal" id="m12val" value="2" min="0" step="any">
          <select id="m12unit">
            <option value="t">吨</option><option value="kg" selected>千克</option><option value="g">克</option>
          </select>
          <span style="font-size:16px;font-weight:700;color:var(--muted);">= ?</span>
        </div>
        <div class="result-list" id="m12results"></div>
      </div>
    </template>

    <!-- ⑬ 解题思维训练 -->
    <template id="tpl-m13">
      <div class="card">
        <div class="problem-bar">
          <div class="problem-bar-current">
            <div class="problem-bar-head">
              <div class="problem-bar-head-left">
                <span class="problem-bar-icon">📝</span>
                <span class="problem-bar-label">题目</span>
              </div>
              <button class="problem-bar-change" id="problemChangeBtn">
                <span class="problem-bar-change-icon">🔄</span> 换一题
              </button>
            </div>
            <div id="problem-text" contenteditable="true"
                data-placeholder="请点「换一题」选择题目，或直接在这里输入题目…"></div>
          </div>
        </div>
        <!-- 选题抽屉：改为独立 fixed 遮罩 -->
        <!-- 选题弹层：独立 fixed 遮罩居中 -->
        <div id="problemPickerMask" class="problem-picker-mask" style="display:none;">
          <div id="problemPickerDrawer" class="problem-picker-inner">
            <div class="problem-picker-hd">
              <span>📚 选一道题</span>
              <button id="problemPickerClose" aria-label="关闭">×</button>
            </div>
            <div class="problem-picker-body">
              <div class="problem-picker-row">
                <select id="pSelect"></select>
                <button class="btn-secondary picker-random-btn" id="pRandomBtn">🎲 随机</button>
              </div>
              <button class="btn" id="pLoad">📥 载入</button>
              <div class="problem-picker-divider"><span>或</span></div>
              <input type="text" id="pCustom" placeholder="手动输入题目…">
              <button class="btn-secondary" id="pUseCustom">使用</button>
              <button class="btn-secondary ai-btn" id="pickerAiBtn" style="border-color: var(--violet-border); background: var(--violet-soft); color: var(--violet);">
                🤖 让 AI 生成一道同类题
              </button>
              <label class="file-btn">
                📎 上传 txt
                <input type="file" id="pUpload" accept=".txt" hidden>
              </label>
              <div id="pickerAiLoading" style="display: none; padding: 30px 20px; text-align: center;">
                <div class="ai-thinking" style="justify-content: center;">
                  <span class="dots"><span></span><span></span><span></span></span>
                  <div style="text-align: left;">
                    <div class="think-text">🤖 AI 正在为你出题…</div>
                    <div class="think-sub" id="pickerAiSub">正在分析当前题目的知识点</div>
                  </div>
                </div>
              </div>
              <button class="problem-picker-clear" id="pClear">🗑 清空当前题目</button>
            </div>
          </div>
        </div>
        <div class="m13-step" data-step="1">
          <div class="m13-step-hd">
            <span class="m13-step-num">1</span>
            <span class="m13-step-title">读题 · 圈一圈</span>
            <span class="m13-step-status" data-status="pending"></span>
            <span class="m13-step-arrow">▶</span>
          </div>
          <div class="m13-step-bd">
            <div class="m13-step-hint">💡 第一遍圈数字、条件、运算；第二遍圈已知、求什么、缺什么</div>
            <div class="hl-toolbar">
              <span class="hl-label">第一遍：</span>
              <button class="hl-btn" data-color="#bfdbfe">数字</button>
              <button class="hl-btn" data-color="#bbf7d0">条件</button>
              <button class="hl-btn" data-color="#fed7aa">运算关系</button>
              <button class="hl-btn" data-color="#e9d5ff">单位</button>
              <span class="hl-sep"></span>
              <span class="hl-label">第二遍：</span>
              <button class="hl-btn" data-color="#a5f3fc">已知</button>
              <button class="hl-btn" data-color="#fecaca">求什么</button>
              <button class="hl-btn" data-color="#fef08a">缺什么</button>
              <span class="hl-sep"></span>
              <button class="hl-btn hl-clear" data-color="transparent">清除</button>
            </div>
          </div>
        </div>
        <div class="m13-step" data-step="2">
          <div class="m13-step-hd">
            <span class="m13-step-num">2</span>
            <span class="m13-step-title">草稿纸 · 分区写</span>
            <span class="m13-step-status" data-status="pending"></span>
            <span class="m13-step-arrow">▶</span>
          </div>
          <div class="m13-step-bd">
            <div class="m13-step-hint">💡 两步计算禁止心算，一步一步写下来</div>
            <div class="scratch-grid">
              <div class="scratch-cell">
                <span class="scratch-label">草稿 ①</span>
                <textarea placeholder="第一步计算过程…"></textarea>
              </div>
              <div class="scratch-cell">
                <span class="scratch-label">草稿 ②</span>
                <textarea placeholder="第二步计算过程…"></textarea>
              </div>
              <div class="scratch-cell">
                <span class="scratch-label">草稿 ③</span>
                <textarea placeholder="验算 / 检查过程…"></textarea>
              </div>
              <div class="scratch-cell">
                <span class="scratch-label">草稿 ④</span>
                <textarea placeholder="备用…"></textarea>
              </div>
            </div>
          </div>
        </div>
        <div class="m13-step" data-step="3">
          <div class="m13-step-hd">
            <span class="m13-step-num">3</span>
            <span class="m13-step-title">关系式 · 代入 · 得数</span>
            <span class="m13-step-status" data-status="pending"></span>
            <span class="m13-step-arrow">▶</span>
          </div>
          <div class="m13-step-bd">
            <div class="m13-step-hint">💡 一步公式、一步代入、一步结果，几步都行</div>
            <div id="formulaSteps"></div>
            <div class="m13-step-actions">
              <button class="btn-secondary" id="addStepBtn">＋ 添加一步</button>
              <button class="btn-secondary" id="removeStepBtn">－ 删除最后一步</button>
            </div>
          </div>
        </div>
        <div class="m13-step" data-step="4">
          <div class="m13-step-hd">
            <span class="m13-step-num">4</span>
            <span class="m13-step-title">我的答案</span>
            <span class="m13-step-status" data-status="pending"></span>
            <span class="m13-step-arrow">▶</span>
          </div>
          <div class="m13-step-bd">
            <div class="check-area">
              <label>我的答案</label>
              <input type="text" id="pAnswer" placeholder="写出最终答案（含单位）">
            </div>
            <div class="takeaway">
              <h4>💡 一题一得 · 这道题教会我什么？</h4>
              <div class="takeaway-row">
                <input type="text" id="pTakeaway"
                      placeholder="例：遇到「还剩多少」，要用减法；先算一共用去多少，再减…">
                <button type="button" id="pTakeawaySave" class="btn-secondary">💾 保存</button>
              </div>
              <div id="pTakeawayHint" class="takeaway-hint"></div>
            </div>
          </div>
        </div>
        <div id="m13StepsLocked" class="steps-locked" style="display:none;">
          <button class="steps-locked-btn" id="m13UnlockBtn">
            🔒 查看标准解题过程（需要密码）
          </button>
        </div>
        <div id="m13StandardSteps" class="standard-steps" style="display:none;">
          <div class="standard-steps-hd">
            <span>📖 标准解题过程</span>
            <span class="arrow">▶</span>
          </div>
          <div class="standard-steps-bd" id="m13StandardStepsBody"></div>
        </div>
        <div class="m13-bottom-bar">
          <div id="aiThinking" class="ai-thinking" style="display:none;">
            <span class="dots"><span></span><span></span><span></span></span>
            <div>
              <div class="think-text">🤖 AI 正在思考…</div>
              <div class="think-sub" id="aiThinkingSub">正在分析你的解题过程</div>
            </div>
            <span class="think-time" id="aiThinkingTime">0.0s</span>
          </div>
          <div class="m13-bottom-row">
            <span id="pResult" class="m13-result-badge"></span>
            <button class="m13-check-btn" id="pCheck">✔ 检查</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ⑭ 我的成长 -->
    <template id="tpl-m14">
      <div class="card">
        <h2>📊 我的成长</h2>
        <p class="sub">这里记录你做过的每一道题、每一条心得、每一周的变化。</p>
        <div id="dashboard" class="dashboard-bar">
          <div class="range-tabs" id="rangeTabs">
            <button class="range-tab active" data-range="today">今日</button>
            <button class="range-tab" data-range="week">本周</button>
            <button class="range-tab" data-range="all">累计</button>
          </div>
          <div class="dash-collapsed" id="dashCollapsed">
            <div class="dash-chip" id="dashStudent" title="点此设置名字">
              <span class="chip-icon">👦</span>
              <span class="chip-label">学生</span>
              <span class="chip-value" id="dashStudentName">—</span>
            </div>
            <div class="dash-chip" id="dashGrade" title="点此切换年级">
              <span class="chip-icon">📚</span>
              <span class="chip-label">年级</span>
              <span class="chip-value" id="dashGradeName">三年级</span>
            </div>
            <div class="dash-chip">
              <span class="chip-icon">📝</span>
              <span class="chip-label">今日</span>
              <span class="chip-value" id="dashToday">0<small>道</small></span>
            </div>
            <div class="dash-chip">
              <span class="chip-icon">✅</span>
              <span class="chip-label">对</span>
              <span class="chip-value" id="dashCorrect">0<small>道</small></span>
            </div>
            <div class="dash-chip">
              <span class="chip-icon">🎯</span>
              <span class="chip-label">率</span>
              <span class="chip-value" id="dashRate">—<small>%</small></span>
            </div>
            <div class="dash-chip">
              <span class="chip-icon">🔥</span>
              <span class="chip-label">连续</span>
              <span class="chip-value" id="dashStreak">0<small>天</small></span>
            </div>
            <div class="dash-chip">
              <span class="chip-icon">📕</span>
              <span class="chip-label">错题</span>
              <span class="chip-value" id="dashWrong">0<small>道</small></span>
            </div>
            <div class="dash-chevron" id="dashChevron">▼</div>
          </div>
          <div class="dash-expanded">
            <div class="dash-expanded-inner">
              <div class="dash-item">
                <div class="dash-icon">📝</div>
                <div class="dash-info">
                  <div class="dash-label">今日做题</div>
                  <div class="dash-value" id="dashToday2">0 <small>道</small></div>
                </div>
              </div>
              <div class="dash-item">
                <div class="dash-icon">✅</div>
                <div class="dash-info">
                  <div class="dash-label">今日正确</div>
                  <div class="dash-value" id="dashCorrect2">0 <small>道</small></div>
                </div>
              </div>
              <div class="dash-item">
                <div class="dash-icon">🎯</div>
                <div class="dash-info">
                  <div class="dash-label">正确率</div>
                  <div class="dash-value" id="dashRate2">— <small>%</small></div>
                </div>
              </div>
              <div class="dash-item">
                <div class="dash-icon">🔥</div>
                <div class="dash-info">
                  <div class="dash-label">连续学习</div>
                  <div class="dash-value" id="dashStreak2">0 <small>天</small></div>
                </div>
              </div>
              <div class="dash-item">
                <div class="dash-icon">📕</div>
                <div class="dash-info">
                  <div class="dash-label">错题本</div>
                  <div class="dash-value" id="dashWrong2">0 <small>道</small></div>
                </div>
              </div>
              <div class="growth-wrap">
                <div class="growth-wrap-hd">
                  <span>📈 最近 7 天成长曲线</span>
                  <small>🟩 正确 · 🟥 错</small>
                </div>
                <div class="growth-bars" id="growthBarsBox"></div>
              </div>
              <div class="streak-wrap">
                <div class="streak-wrap-hd">
                  <span>🌱 打卡树</span>
                  <small id="streakDaysLabel">已连续 0 天</small>
                </div>
                <div class="streak-dots" id="streakDotsBox"></div>
              </div>
            </div>
          </div>
        </div>
        <div id="growthPanelContainer" class="growth-card-grid">
          <div class="growth-card c-blue" data-goto="historySection">
            <div class="growth-card-hd">
              <div class="growth-card-icon">📚</div>
              <div class="growth-card-title">
                做题记录
                <small>每一道题的足迹</small>
              </div>
            </div>
            <div class="growth-card-stats" id="historyStats">
              <div class="growth-card-stat"><div class="num">0<small>道</small></div><div class="lbl">题目</div></div>
              <div class="growth-card-stat"><div class="num">0<small>次</small></div><div class="lbl">练习</div></div>
              <div class="growth-card-stat"><div class="num">0<small>%</small></div><div class="lbl">正确率</div></div>
            </div>
            <div class="growth-card-cta">点击展开 ▾</div>
          </div>
          <div class="growth-card c-amber" data-goto="takeawaySection">
            <div class="growth-card-hd">
              <div class="growth-card-icon">💡</div>
              <div class="growth-card-title">
                一题一得
                <small>每道题的心得</small>
              </div>
            </div>
            <div class="growth-card-stats" id="takeawayStats">
              <div class="growth-card-stat"><div class="num">0<small>条</small></div><div class="lbl">心得</div></div>
            </div>
            <div class="growth-card-cta">点击展开 ▾</div>
          </div>
          <div class="growth-card c-green" data-goto="growthChartSection">
            <div class="growth-card-hd">
              <div class="growth-card-icon">📈</div>
              <div class="growth-card-title">
                成长曲线
                <small>最近 7 天的变化</small>
              </div>
            </div>
            <div class="growth-card-stats" id="growthChartStats">
              <div class="growth-card-stat"><div class="num">0<small>道</small></div><div class="lbl">本周做题</div></div>
              <div class="growth-card-stat"><div class="num">0<small>道</small></div><div class="lbl">做对</div></div>
              <div class="growth-card-stat"><div class="num">0<small>天</small></div><div class="lbl">学习天数</div></div>
            </div>
            <div class="growth-card-cta">点击展开 ▾</div>
          </div>
          <div class="growth-card c-teal" data-goto="streakTreeSection">
            <div class="growth-card-hd">
              <div class="growth-card-icon">🌱</div>
              <div class="growth-card-title">
                打卡树
                <small>每天进步一点点</small>
              </div>
            </div>
            <div class="growth-card-stats" id="streakTreeStats">
              <div class="growth-card-stat"><div class="num">0<small>天</small></div><div class="lbl">连续打卡</div></div>
              <div class="growth-card-stat"><div class="num">0<small>轮</small></div><div class="lbl">7天周期</div></div>
            </div>
            <div class="growth-card-cta">点击展开 ▾</div>
          </div>
          <div class="growth-card c-violet" data-goto="weeklyReportSection">
            <div class="growth-card-hd">
              <div class="growth-card-icon">📊</div>
              <div class="growth-card-title">
                本周学习周报
                <small>一周的表现</small>
              </div>
            </div>
            <div class="growth-card-stats" id="weeklyReportStats">
              <div class="growth-card-stat"><div class="num">0<small>道</small></div><div class="lbl">本周做题</div></div>
              <div class="growth-card-stat"><div class="num">0<small>%</small></div><div class="lbl">正确率</div></div>
              <div class="growth-card-stat"><div class="num">0<small>天</small></div><div class="lbl">学习天数</div></div>
            </div>
            <div class="growth-card-cta">点击展开 ▾</div>
          </div>
        </div>
        <div id="growthDetailPanels">
          <div id="errorProfilePanel" class="error-profile-panel" style="display:none;"></div>
          <div class="collapsible-section" id="historySection">
            <div class="collapsible-hd">
              <span class="collapse-icon">▶</span>
              <span class="collapse-title">📚 做题记录</span>
              <span class="collapse-count" id="historyCount">共 0 道</span>
            </div>
            <div class="collapsible-bd">
              <div id="historyList" class="history-list">
                <div class="history-empty">还没有做题记录哦</div>
              </div>
              <div class="btn-row" style="justify-content:flex-end;margin-top:12px;">
                <button class="btn-secondary" id="historyExport">📤 导出记录</button>
                <button class="btn-secondary" id="historyClear">🗑 清空记录</button>
              </div>
            </div>
          </div>
          <div class="collapsible-section" id="takeawaySection">
            <div class="collapsible-hd">
              <span class="collapse-icon">▶</span>
              <span class="collapse-title">💡 一题一得 · 汇总</span>
              <span class="collapse-count" id="takeawayCount">0 条</span>
            </div>
            <div class="collapsible-bd">
              <div id="takeawayGalleryBox"></div>
            </div>
          </div>
          <div class="collapsible-section" id="growthChartSection">
            <div class="collapsible-hd">
              <span class="collapse-icon">▶</span>
              <span class="collapse-title">📈 最近 7 天成长曲线</span>
            </div>
            <div class="collapsible-bd">
              <div class="growth-bars" id="growthChartInline"></div>
            </div>
          </div>
          <div class="collapsible-section" id="streakTreeSection">
            <div class="collapsible-hd">
              <span class="collapse-icon">▶</span>
              <span class="collapse-title">🌱 打卡树</span>
              <span class="collapse-hint" id="streakTreeInlineLabel">已连续 0 天</span>
            </div>
            <div class="collapsible-bd">
              <div class="streak-dots" id="streakTreeInline"></div>
            </div>
          </div>
          <div class="collapsible-section" id="weeklyReportSection">
            <div class="collapsible-hd">
              <span class="collapse-icon">▶</span>
              <span class="collapse-title">📊 本周学习周报</span>
            </div>
            <div class="collapsible-bd">
              <div id="weeklyReportBox"></div>
            </div>
          </div>
        </div>
      </div>
    </template>
  `;

  document.body.appendChild(div);
  console.log('✅ 所有模块 HTML 模板已成功注入');
}