/**
 * dApp 请求处理模块
 * 处理 EIP-1193 标准的以太坊 JSON-RPC 请求
 */
import { walletManager } from './wallet-manager.js';
import { networkManager } from './network-manager.js';
import { STORAGE_KEYS } from '../shared/constants.js';
import { WALLET_STATE } from '../shared/message-types.js';

class DAppHandler {
  constructor() {
    /** @type {Map<string, object>} 待审批的请求 (requestId → request) */
    this._pendingRequests = new Map();
    /** @type {number} 请求 ID 计数器 */
    this._requestIdCounter = 0;
  }

  /**
   * 处理 dApp 的 EIP-1193 请求
   * @param {string} origin - 请求来源域名
   * @param {object} payload - {method, params}
   * @returns {Promise<any>} 请求结果
   */
  async handleRequest(origin, payload) {
    const { method, params } = payload;

    switch (method) {
      case 'eth_requestAccounts':
        return this._handleRequestAccounts(origin);

      case 'eth_accounts':
        return this._handleGetAccounts(origin);

      case 'eth_chainId':
        return networkManager.getChainIdHex();

      case 'net_version':
        return String(networkManager.getCurrentNetwork().chainIdNum);

      case 'eth_sendTransaction':
        return this._handleSendTransaction(origin, params[0]);

      case 'personal_sign':
        return this._handlePersonalSign(origin, params);

      case 'eth_sign':
        return this._handlePersonalSign(origin, [params[1], params[0]]);

      case 'wallet_switchEthereumChain':
        return this._handleSwitchChain(params[0]);

      case 'wallet_addEthereumChain':
        // 简单实现：只处理已支持的链
        return this._handleSwitchChain(params[0]);

      // 代理到 RPC 的请求
      case 'eth_getBalance':
      case 'eth_blockNumber':
      case 'eth_call':
      case 'eth_estimateGas':
      case 'eth_gasPrice':
      case 'eth_getTransactionByHash':
      case 'eth_getTransactionReceipt':
      case 'eth_getBlockByNumber':
      case 'eth_getBlockByHash':
      case 'eth_getCode':
      case 'eth_getStorageAt':
      case 'eth_getTransactionCount':
      case 'eth_getLogs':
        return networkManager.rpcCall(method, params);

      default:
        // 尝试代理未知方法到 RPC
        try {
          return await networkManager.rpcCall(method, params);
        } catch (e) {
          throw {
            code: 4200,
            message: `不支持的方法: ${method}`,
          };
        }
    }
  }

  /**
   * 获取待处理的审批请求
   * @returns {object|null}
   */
  getPendingRequest() {
    if (this._pendingRequests.size === 0) return null;
    const [id, request] = this._pendingRequests.entries().next().value;
    return { id, ...request };
  }

  /**
   * 解决待处理请求
   * @param {string} requestId - 请求 ID
   * @param {boolean} approved - 是否批准
   * @param {any} result - 结果或错误
   */
  resolveRequest(requestId, approved, result) {
    const request = this._pendingRequests.get(requestId);
    if (!request) return;

    if (approved && request.resolve) {
      request.resolve(result);
    } else if (request.reject) {
      request.reject({
        code: 4001,
        message: '用户拒绝了请求',
      });
    }
    this._pendingRequests.delete(requestId);
  }

  // ========== 私有方法 ==========

  /**
   * 处理 eth_requestAccounts — 请求连接
   */
  async _handleRequestAccounts(origin) {
    if (walletManager.state !== WALLET_STATE.UNLOCKED) {
      throw { code: 4100, message: '钱包已锁定' };
    }

    // 检查是否已授权
    const isConnected = await this._isConnected(origin);
    if (isConnected) {
      return [walletManager.getSelectedAddress()];
    }

    // 需要用户授权 — 创建审批请求
    return new Promise((resolve, reject) => {
      const requestId = String(++this._requestIdCounter);
      this._pendingRequests.set(requestId, {
        type: 'connect',
        origin,
        resolve,
        reject,
      });

      // 打开 popup 让用户审批
      this._openApprovalPopup(requestId);
    });
  }

  /**
   * 处理 eth_accounts
   */
  async _handleGetAccounts(origin) {
    if (walletManager.state !== WALLET_STATE.UNLOCKED) {
      return [];
    }

    const isConnected = await this._isConnected(origin);
    if (!isConnected) {
      return [];
    }

    return [walletManager.getSelectedAddress()];
  }

  /**
   * 处理 eth_sendTransaction
   */
  async _handleSendTransaction(origin, txParams) {
    if (walletManager.state !== WALLET_STATE.UNLOCKED) {
      throw { code: 4100, message: '钱包已锁定' };
    }

    return new Promise((resolve, reject) => {
      const requestId = String(++this._requestIdCounter);
      this._pendingRequests.set(requestId, {
        type: 'transaction',
        origin,
        txParams,
        resolve,
        reject,
      });

      this._openApprovalPopup(requestId);
    });
  }

  /**
   * 处理 personal_sign
   */
  async _handlePersonalSign(origin, params) {
    if (walletManager.state !== WALLET_STATE.UNLOCKED) {
      throw { code: 4100, message: '钱包已锁定' };
    }

    const message = params[0];

    return new Promise((resolve, reject) => {
      const requestId = String(++this._requestIdCounter);
      this._pendingRequests.set(requestId, {
        type: 'sign',
        origin,
        message,
        resolve,
        reject,
      });

      this._openApprovalPopup(requestId);
    });
  }

  /**
   * 处理 wallet_switchEthereumChain
   */
  async _handleSwitchChain(params) {
    const chainId = params.chainId;
    try {
      await networkManager.switchNetwork(parseInt(chainId, 16));
      return null; // 成功返回 null
    } catch (e) {
      throw {
        code: 4902,
        message: `未添加该网络: ${chainId}`,
      };
    }
  }

  /**
   * 检查 origin 是否已授权连接
   */
  async _isConnected(origin) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CONNECTED_SITES);
    const sites = data[STORAGE_KEYS.CONNECTED_SITES] || {};
    return !!sites[origin];
  }

  /**
   * 保存授权的站点
   */
  async saveConnection(origin) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CONNECTED_SITES);
    const sites = data[STORAGE_KEYS.CONNECTED_SITES] || {};
    sites[origin] = {
      connectedAt: Date.now(),
    };
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONNECTED_SITES]: sites,
    });
  }

  /**
   * 断开站点连接
   */
  async disconnectSite(origin) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CONNECTED_SITES);
    const sites = data[STORAGE_KEYS.CONNECTED_SITES] || {};
    delete sites[origin];
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONNECTED_SITES]: sites,
    });
  }

  /**
   * 打开审批弹窗
   */
  _openApprovalPopup(requestId) {
    // 在 Manifest V3 中使用 chrome.action.openPopup 或 windows.create
    // 使用 windows.create 创建独立审批窗口
    try {
      chrome.windows.create({
        url: `popup.html#approve/${requestId}`,
        type: 'popup',
        width: 380,
        height: 620,
        focused: true,
      });
    } catch (e) {
      // 如果无法创建窗口，回退到 notification
      console.error('无法打开审批窗口:', e);
    }
  }
}

export const dappHandler = new DAppHandler();
