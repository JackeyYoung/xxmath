/* core/sync/auth.js
   CloudBase 登录管理：匿名 + 邮箱验证码
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
  // persistence: 'local' —— 登录态持久化到 localStorage
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

/* 第一步：发送邮箱验证码 */
export async function sendEmailCode(email) {
  const auth = getAuth();
  if (!auth) throw new Error('CloudBase 未配置');

  // 返回 { verification_id, is_user, expires_in }
  const verification = await auth.getVerification({ email });
  return verification;
}

/* 第二步 + 第三步：校验验证码 → 登录/注册 */
export async function verifyAndSignIn(email, code, verificationId, isUser) {
  const auth = getAuth();
  if (!auth) throw new Error('CloudBase 未配置');

  // 1. 校验验证码
  const verificationTokenRes = await auth.verify({
    verification_id: verificationId,
    verification_code: code,
  });

  let loginState;
  if (isUser) {
    // 已存在 → 登录
    loginState = await auth.signIn({
      username: email,
      verification_token: verificationTokenRes.verification_token,
    });
  } else {
    // 不存在 → 注册
    loginState = await auth.signUp({
      email: email,
      verification_code: code,
      verification_token: verificationTokenRes.verification_token,
      // 可选设置密码，如果不填只支持验证码登录
      // password: 'demo1234'
    });
  }

  _currentUser = loginState.user;
  return _currentUser;
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