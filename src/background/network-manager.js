/**
 * 网络管理模块
 * 管理 RPC 连接、余额查询、Gas 估算、交易广播
 */
import { ethers } from 'ethers';
import { NETWORKS, DEFAULT_CHAIN_ID, STORAGE_KEYS } from '../shared/constants.js';

class NetworkManager {
  constructor() {
    /** @type {number} 当前 chainId (数字格式) */
    this._chainId = DEFAULT_CHAIN_ID;
    /** @type {ethers.JsonRpcProvider|null} 当前 provider */
    this._provider = null;
  }

  /**
   * 初始化 — 从存储恢复上次选择的网络
   */
  async init() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CURRENT_NETWORK);
    if (data[STORAGE_KEYS.CURRENT_NETWORK]) {
      this._chainId = data[STORAGE_KEYS.CURRENT_NETWORK];
    }
    this._createProvider();
  }

  /**
   * 获取当前网络配置
   * @returns {object}
   */
  getCurrentNetwork() {
    return {
      ...NETWORKS[this._chainId],
      chainIdNum: this._chainId,
    };
  }

  /**
   * 获取当前 chainId (hex)
   * @returns {string}
   */
  getChainIdHex() {
    return NETWORKS[this._chainId].chainId;
  }

  /**
   * 获取当前 provider
   * @returns {ethers.JsonRpcProvider}
   */
  getProvider() {
    if (!this._provider) {
      this._createProvider();
    }
    return this._provider;
  }

  /**
   * 切换网络
   * @param {number} chainId - 目标 chainId (数字)
   * @returns {object} 新网络配置
   */
  async switchNetwork(chainId) {
    const numId = typeof chainId === 'string' ? parseInt(chainId, 16) : chainId;

    if (!NETWORKS[numId]) {
      throw new Error(`不支持的网络: chainId ${chainId}`);
    }

    this._chainId = numId;
    this._createProvider();

    await chrome.storage.local.set({
      [STORAGE_KEYS.CURRENT_NETWORK]: numId,
    });

    return this.getCurrentNetwork();
  }

  /**
   * 获取账户余额
   * @param {string} address - 账户地址
   * @returns {Promise<{balance: string, balanceFormatted: string}>}
   */
  async getBalance(address) {
    const provider = this.getProvider();
    const balance = await provider.getBalance(address);
    return {
      balance: balance.toString(),
      balanceFormatted: ethers.formatEther(balance),
    };
  }

  /**
   * 估算 Gas
   * @param {object} tx - 交易参数
   * @returns {Promise<string>}
   */
  async estimateGas(tx) {
    const provider = this.getProvider();
    const gasEstimate = await provider.estimateGas(tx);
    return gasEstimate.toString();
  }

  /**
   * 获取当前 Gas 价格
   * @returns {Promise<{gasPrice: string, gasPriceGwei: string}>}
   */
  async getGasPrice() {
    const provider = this.getProvider();
    const feeData = await provider.getFeeData();
    return {
      gasPrice: feeData.gasPrice?.toString() || '0',
      gasPriceGwei: feeData.gasPrice
        ? ethers.formatUnits(feeData.gasPrice, 'gwei')
        : '0',
    };
  }

  /**
   * 获取区块号
   * @returns {Promise<number>}
   */
  async getBlockNumber() {
    const provider = this.getProvider();
    return provider.getBlockNumber();
  }

  /**
   * 代理 RPC 调用 (用于 dApp 的 eth_call 等)
   * @param {string} method - RPC 方法名
   * @param {Array} params - 参数
   * @returns {Promise<any>}
   */
  async rpcCall(method, params) {
    const provider = this.getProvider();
    return provider.send(method, params || []);
  }

  /**
   * 获取所有可用网络列表
   * @returns {Array}
   */
  getAllNetworks() {
    return Object.entries(NETWORKS).map(([id, config]) => ({
      chainIdNum: parseInt(id),
      ...config,
    }));
  }

  // ========== 私有方法 ==========

  _createProvider() {
    const network = NETWORKS[this._chainId];
    if (!network) return;
    this._provider = new ethers.JsonRpcProvider(network.rpcUrl);
  }
}

export const networkManager = new NetworkManager();
