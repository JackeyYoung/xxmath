/* core/parent-pin.js —— 家长密码（9.7）

现状问题：原来的「密码」是当前月日 + pcw（11月3日 → 1103pcw），
孩子看一眼日期就能算出来，等于没有密码。

现在改成固定的 4 位数字 PIN：
  · 家长在设置页设一次，存 grade3_parent_pin（走存储层，会随云同步）
  · 校验时优先比 PIN
  · **没设 PIN 时退回旧规则**，避免升级后把家长锁在门外（也给老用户一个平滑过渡）

为什么是 4 位数字而不是密码框：这是给孩子用的 app，家长操作的频率很低，
4 位 PIN 够挡"顺手点两下"，又不用记复杂密码；忘记时还能用「重置数据」兜底。
*/
import { lsGet, lsSet, lsRemove } from './storage.js';
import { getParentPinKey } from './keys.js';

/** 合法 PIN：4 位数字 */
export function isValidPin(v) {
  return /^\d{4}$/.test(String(v == null ? '' : v).trim());
}

/** 当前 PIN（未设置或格式非法 → 空串） */
export function getParentPin() {
  const v = lsGet(getParentPinKey());
  return isValidPin(v) ? String(v).trim() : '';
}

export function hasParentPin() {
  return !!getParentPin();
}

/** 设置/修改 PIN。格式非法返回 false，不改动原值。 */
export function setParentPin(pin) {
  if (!isValidPin(pin)) return false;
  lsSet(getParentPinKey(), String(pin).trim());
  return true;
}

export function clearParentPin() {
  lsRemove(getParentPinKey());
}

/** 旧规则：当前月日 + pcw（保留作为未设 PIN 时的兜底） */
export function legacyPassword(now = new Date()) {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return mm + dd + 'pcw';
}

/** 家长区口令校验：有 PIN 比 PIN，没 PIN 退回旧规则 */
export function verifyParentSecret(input, now = new Date()) {
  const v = String(input == null ? '' : input).trim();
  if (!v) return false;
  const pin = getParentPin();
  if (pin) return v === pin;
  return v === legacyPassword(now);
}
