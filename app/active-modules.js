/* app/active-modules.js
   模块与壳层之间的「活动模块注册表」。

   从 shell.js 里抽出来，是为了让 m1 / m9 / m13 这类模块只依赖这一个小文件，
   而不是把整个 shell（1800+ 行）拖进依赖图。
*/

export const activeModules = {};
export function registerActiveModule(id, api) {
  activeModules[id] = api;
}
export function unregisterActiveModule(id) {
  delete activeModules[id];
}
