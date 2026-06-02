/**
 * Inpage Script — 注入到网页的 EIP-1193 Provider
 * 提供 window.ethereum 对象供 dApp 调用
 *
 * 通过 window.postMessage 与 Content Script 通信
 */

(function () {
  'use strict';

  // 防止重复注入
  if (window.ethereum && window.ethereum.isQianBao) return;

  const CHANNEL_TO_CONTENT = 'QIANBAO_INPAGE_TO_CONTENT';
  const CHANNEL_FROM_CONTENT = 'QIANBAO_CONTENT_TO_INPAGE';

  /** 请求 ID 计数器 */
  let requestId = 0;

  /** 待处理请求的回调 Map<id, {resolve, reject}> */
  const pendingRequests = new Map();

  /** 事件监听器 Map<eventName, Set<callback>> */
  const eventListeners = new Map();

  // ========== EIP-1193 Provider 对象 ==========

  const provider = {
    isQianBao: true,
    isMetaMask: true, // 兼容性：许多 dApp 检查 isMetaMask
    _events: {},

    /**
     * EIP-1193 request 方法 — 所有 dApp 交互的入口
     * @param {object} args - {method: string, params?: Array}
     * @returns {Promise<any>}
     */
    request(args) {
      return new Promise((resolve, reject) => {
        const id = String(++requestId);
        pendingRequests.set(id, { resolve, reject });

        window.postMessage({
          channel: CHANNEL_TO_CONTENT,
          id,
          payload: {
            method: args.method,
            params: args.params || [],
          },
        }, '*');
      });
    },

    /**
     * 监听事件
     * @param {string} eventName - 事件名称 (accountsChanged, chainChanged, connect, disconnect)
     * @param {Function} callback - 回调函数
     */
    on(eventName, callback) {
      if (!eventListeners.has(eventName)) {
        eventListeners.set(eventName, new Set());
      }
      eventListeners.get(eventName).add(callback);
      return provider;
    },

    /**
     * 移除事件监听
     */
    removeListener(eventName, callback) {
      const listeners = eventListeners.get(eventName);
      if (listeners) {
        listeners.delete(callback);
      }
      return provider;
    },

    /**
     * 移除所有事件监听
     */
    removeAllListeners(eventName) {
      if (eventName) {
        eventListeners.delete(eventName);
      } else {
        eventListeners.clear();
      }
      return provider;
    },

    // === 废弃但 dApp 仍在用的方法 ===

    /**
     * @deprecated 使用 request({method: 'eth_requestAccounts'})
     */
    enable() {
      return provider.request({ method: 'eth_requestAccounts' });
    },

    /**
     * @deprecated 旧版 send 方法
     */
    send(methodOrPayload, paramsOrCallback) {
      if (typeof methodOrPayload === 'string') {
        return provider.request({
          method: methodOrPayload,
          params: paramsOrCallback || [],
        });
      }

      // 回调风格
      if (typeof paramsOrCallback === 'function') {
        provider
          .request(methodOrPayload)
          .then(result => paramsOrCallback(null, { result }))
          .catch(error => paramsOrCallback(error, null));
        return;
      }

      return provider.request(methodOrPayload);
    },

    /**
     * @deprecated 使用 request 方法
     */
    sendAsync(payload, callback) {
      provider
        .request(payload)
        .then(result =>
          callback(null, {
            id: payload.id,
            jsonrpc: '2.0',
            result,
          })
        )
        .catch(error => callback(error, null));
    },

    /** chainId (同步属性, 初始为 null, 连接后更新) */
    chainId: null,

    /** networkVersion */
    networkVersion: null,

    /** selectedAddress */
    selectedAddress: null,
  };

  // ========== 消息处理 ==========

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.channel !== CHANNEL_FROM_CONTENT) return;

    const { id, response, event: eventType, data: eventData } = event.data;

    // 处理请求响应
    if (id && pendingRequests.has(id)) {
      const { resolve, reject } = pendingRequests.get(id);
      pendingRequests.delete(id);

      if (response.success) {
        resolve(response.data);
      } else {
        const error = new Error(response.error || '请求失败');
        error.code = response.code || 4001;
        reject(error);
      }
      return;
    }

    // 处理事件
    if (eventType) {
      emitEvent(eventType, eventData);

      // 更新同步属性
      if (eventType === 'CHAIN_CHANGED' && eventData) {
        provider.chainId = eventData.chainId;
        emitEvent('chainChanged', eventData.chainId);
      }
      if (eventType === 'ACCOUNTS_CHANGED' && eventData) {
        provider.selectedAddress = eventData[0] || null;
        emitEvent('accountsChanged', eventData);
      }
    }
  });

  /**
   * 触发事件
   */
  function emitEvent(eventName, data) {
    const listeners = eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (e) {
          console.error('[QianBao] 事件回调错误:', e);
        }
      });
    }
  }

  // ========== 初始化同步属性 ==========

  provider.request({ method: 'eth_chainId' })
    .then(chainId => {
      provider.chainId = chainId;
    })
    .catch(() => {});

  // ========== 注入 window.ethereum ==========

  // 使用 try-catch 包装 defineProperty，防止与其他钱包插件冲突时抛出 "Cannot redefine property" 导致脚本崩溃
  try {
    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: true,     // 设置为 true，允许某些 dApp 在测试中对其进行修改或 mock，提升兼容性
      configurable: true, // 允许重新配置
      enumerable: true,   // 允许在 window 上枚举出来
    });
  } catch (error) {
    console.warn('[QianBao Web3] 无法通过 defineProperty 注入 window.ethereum (可能已被其他钱包锁定):', error);
    try {
      // 尝试直接赋值作为降级方案
      window.ethereum = provider;
    } catch (assignError) {
      console.error('[QianBao Web3] 降级直接赋值 window.ethereum 也失败:', assignError);
    }
  }

  // EIP-6963: 公告 provider
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({
        info: {
          uuid: 'qianbao-web3-wallet',
          name: 'QianBao Web3',
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="%237B61FF"/><text x="64" y="80" font-size="64" text-anchor="middle" fill="white">钱</text></svg>',
          rdns: 'com.qianbao.web3',
        },
        provider,
      }),
    })
  );

  // 监听 EIP-6963 发现请求
  window.addEventListener('eip6963:requestProvider', () => {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({
          info: {
            uuid: 'qianbao-web3-wallet',
            name: 'QianBao Web3',
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="%237B61FF"/><text x="64" y="80" font-size="64" text-anchor="middle" fill="white">钱</text></svg>',
            rdns: 'com.qianbao.web3',
          },
          provider,
        }),
      })
    );
  });

  console.log('[QianBao Web3] Provider 已注入 ✓');
})();
