/* core/sync/auth.js
   CloudBase 登录管理：匿名 + 邮箱
*/

import { getCloudBaseApp } from './cloudbase-client.js';

let _currentUser = null;

export function getCurrentUser() {
  return _currentUser;
}

export function isLoggedIn() {
  return !!_currentUser;
}

function getAuth() {
  const app = getCloudBaseApp();
  if (!app) return null;
  // persistence: 'local' —— 登录态持久化到 localStorage，30 天有效
  return app.auth({ persistence: 'local' });
}

/* 匿名登录（首次自动注册匿名用户） */
export async function ensureAnonymousLogin() {
  const auth = getAuth();
  if (!auth) return null;

  // 已有登录态 → 直接用
  const state = await auth.getLoginState();
  if (state?.user) {
    _currentUser = state.user;
    return _currentUser;
  }

  // 匿名登录
  const loginState = await auth.signInAnonymously();
  _currentUser = loginState.user;
  return _currentUser;
}

/* 邮箱登录 */
export async function signInWithEmail(email, password) {
  const auth = getAuth();
  if (!auth) throw new Error('CloudBase 未配置');

  const loginState = await auth.signInWithEmailAndPassword(email, password);
  _currentUser = loginState.user;
  return _currentUser;
}

/* 邮箱注册 */
export async function signUpWithEmail(email, password) {
  const auth = getAuth();
  if (!auth) throw new Error('CloudBase 未配置');

  const loginState = await auth.signUpWithEmailAndPassword(email, password);
  _currentUser = loginState.user;
  return loginState;
}

/* 匿名账号绑定邮箱（账户关联） */
export async function linkEmailToAnonymous(email, password) {
  const auth = getAuth();
  if (!auth) throw new Error('CloudBase 未配置');

  const loginState = await auth.linkWithEmailAndPassword(email, password);
  _currentUser = loginState.user;
  return loginState;
}

/* 退出登录 */
export async function signOut() {
  const auth = getAuth();
  if (!auth) return;
  await auth.signOut();
  _currentUser = null;
}

/* 监听登录状态变化 */
export function onAuthChange(callback) {
  const auth = getAuth();
  if (!auth) return;

  auth.onLoginStateChanged((loginState) => {
    _currentUser = loginState?.user || null;
    callback('STATE_CHANGE', _currentUser);
  });
}