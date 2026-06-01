/**
 * Content Script
 * 桥接 Inpage Script ↔ Background Service Worker
 *
 * 职责:
 * 1. 将 inpage.js 注入到页面 DOM
 * 2. 监听 window.postMessage (来自 inpage) → 转发到 background
 * 3. 监听 background 的响应 → 转发回 inpage
 */
import { CHANNEL, MSG } from '../shared/message-types.js';

// ========== 注入 inpage.js ==========

function injectInpageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inpage.js');
  script.setAttribute('data-qianbao', 'true');

  // 尽早注入
  const target = document.head || document.documentElement;
  target.insertBefore(script, target.firstChild);

  // 注入完成后移除 script 标签
  script.onload = () => script.remove();
}

injectInpageScript();

// ========== Inpage → Background 桥接 ==========

window.addEventListener('message', async (event) => {
  // 只处理来自当前页面的消息
  if (event.source !== window) return;
  if (!event.data || event.data.channel !== CHANNEL.INPAGE_TO_CONTENT) return;

  const { id, payload } = event.data;

  try {
    // 转发到 Background Service Worker
    const response = await chrome.runtime.sendMessage({
      type: MSG.DAPP_REQUEST,
      payload,
    });

    // 将结果返回给 inpage
    window.postMessage({
      channel: CHANNEL.CONTENT_TO_INPAGE,
      id,
      response,
    }, '*');
  } catch (error) {
    window.postMessage({
      channel: CHANNEL.CONTENT_TO_INPAGE,
      id,
      response: {
        success: false,
        error: error.message || '请求失败',
      },
    }, '*');
  }
});

// ========== Background → Inpage 事件转发 ==========

chrome.runtime.onMessage.addListener((message) => {
  // 转发事件到 inpage (如 chainChanged, accountsChanged)
  if (message.type === MSG.CHAIN_CHANGED || message.type === MSG.ACCOUNTS_CHANGED) {
    window.postMessage({
      channel: CHANNEL.CONTENT_TO_INPAGE,
      event: message.type,
      data: message.data,
    }, '*');
  }
});
