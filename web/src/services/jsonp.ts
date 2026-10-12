// ============================================================================
// 通用 JSONP 助手：注入 <script src="...&cb=name">，全局回调触发即得 JSON。
// 用于浏览器直连第三方行情接口（服务端在机房被封锁时的兜底），<script> 天生无跨域限制。
//
// ⚠️ 东方财富按 Referer 拦截本站域名（带 https://www.fundtracker.top/ 会被直接断连），
//    因此这里统一置 referrerPolicy = "no-referrer"，让浏览器不发送 Referer。
// ============================================================================
let seq = 0;

/**
 * @param url 目标接口地址（会自动追加 cb 参数）
 * @param timeoutMs 超时毫秒数，默认 8000
 */
export function jsonp<T = any>(url: string, timeoutMs = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cb = `__jsonp_${Date.now()}_${seq++}`;
    const w = window as any;
    const script = document.createElement("script");
    let settled = false;

    const timer = setTimeout(() => finish(new Error("jsonp timeout")), timeoutMs);

    function finish(err: Error | null, data?: T) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        delete w[cb];
      } catch {
        w[cb] = undefined;
      }
      script.remove();
      if (err) reject(err);
      else resolve(data as T);
    }

    w[cb] = (data: T) => finish(null, data);
    script.onerror = () => finish(new Error("jsonp error"));
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = `${url}${url.includes("?") ? "&" : "?"}cb=${cb}`;
    document.head.appendChild(script);
  });
}