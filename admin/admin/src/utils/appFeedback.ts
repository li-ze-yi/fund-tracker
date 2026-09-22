import type { MessageInstance } from 'antd/es/message/interface';

let messageApi: MessageInstance | null = null;

/** 由 App 内的 MessageBridge 组件绑定主题化的 message 实例 */
export function bindAppMessage(message: MessageInstance) {
  messageApi = message;
}

/** 供非组件代码（如 axios 拦截器）使用的主题化消息提示 */
export function appMessage() {
  return messageApi;
}
