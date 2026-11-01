/* app/router.js —— 路由：只管「切页面 + 改 hash」，具体渲染由视图注册进来

   为什么不直接 import 视图：navigate 需要调用视图，而视图（返回按钮等）也需要 navigate，
   直接互相 import 会形成循环依赖。改成注册表：router 不认识任何视图，shell 在 initShell 里注册。
*/

const ROUTES = ['home', 'lesson', 'growth', 'messages', 'settings'];
const renderers = Object.create(null);
let currentRoute = 'home';
let currentLessonId = null;

/** 注册某个路由的渲染函数（由 shell 在初始化时调用） */
export function registerView(route, fn) {
  if (typeof fn === "function") renderers[route] = fn;
}

export function getCurrentRoute() { return currentRoute; }
export function getCurrentLessonId() { return currentLessonId; }

export function navigate(route, opts = {}) {
  // ⭐ 路由切换时，强制清空拇指条状态
  const bar = document.getElementById("thumbBar");
  if (bar) bar.classList.remove("show", "ok", "err");

  // ⭐ S10：路由切换时兜底解除滚动锁 —— 任何弹层若异常退出（如被模块卸载打断），
  //    残留的 .modal-open 会让整个页面永久无法滚动，这里兜住最坏情况。
  document.body.classList.remove("modal-open");

  if (!ROUTES.includes(route)) return;

  currentRoute = route;
  if (opts.lessonId) currentLessonId = opts.lessonId;

  // 进入课页时隐藏全局 header
  const globalHeader = document.getElementById("globalHeader");
  if (globalHeader) globalHeader.style.display = route === "lesson" ? "none" : "block";

  // 只操作 class，display 交给 CSS 的 .page / .page.active 规则
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  const target = document.getElementById("page-" + route);
  if (!target) {
    console.error("[router] 找不到页面容器:", "page-" + route);
    return;
  }
  target.classList.add("active");

  const render = renderers[route];
  if (render) {
    try { render({ lessonId: currentLessonId, ...opts }); }
    catch (e) { console.error("[router] 视图渲染失败:", route, e); }
  }

  const hash = route === "lesson" ? "#lesson/" + currentLessonId : "#" + route;
  const state = route === "lesson" ? { route, lessonId: currentLessonId } : { route };
  history.pushState(state, "", hash);

  window.scrollTo({ top: 0, behavior: "auto" });
}

window.addEventListener("popstate", (e) => {
  const s = e.state;
  if (!s) { navigate("home"); return; }
  navigate(s.route, { lessonId: s.lessonId });
});
