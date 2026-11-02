/**
 * 会话代际守卫
 *
 * 登录/登出时递增「代际」并中止上一会话的在途请求，用于解决切换账号后的身份串号：
 * 用户一登出时仍有已发出的请求在途，用户二登录成功后，用户一的迟到响应（在滑动续期
 * 阈值内会带 X-Auth-Token 续期头）会覆盖本地 token，导致刷新后「用户名是用户二、
 * 数据却是用户一」。
 *
 * 调用方：authStore 的 login/logout 调用 resetSession()；api.ts 在请求上绑定当前
 * 代际与中止信号，并在响应续期时校验代际未发生变化。
 */
let epoch = 0;
let controller = new AbortController();

/** 当前会话代际，登录/登出会使其递增 */
export const getSessionEpoch = () => epoch;

/** 当前会话的中止信号，绑定到该会话内发出的所有请求 */
export const getSessionSignal = () => controller.signal;

/** 开启新会话：中止上一会话所有在途请求，并递增代际 */
export function resetSession() {
  epoch += 1;
  controller.abort();
  controller = new AbortController();
}
