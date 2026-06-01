/**
 * 钱包核心管理模块
 * 负责: 创建钱包、导入助记词、多账户派生、交易签名
 */
import { ethers } from 'ethers';
import { encrypt, decrypt } from './crypto-utils.js';
import { HD_PATH_PREFIX, STORAGE_KEYS, AUTO_LOCK_TIMEOUT } from '../shared/constants.js';
import { WALLET_STATE } from '../shared/message-types.js';

class WalletManager {
  constructor() {
    /** @type {string|null} 解锁后内存中的助记词 */
    this._mnemonic = null;
    /** @type {string|null} 当前密码（内存中临时保留，用于自动操作） */
    this._password = null;
    /** @type {Map<number, ethers.HDNodeWallet>} 派生的账户 (index → wallet) */
    this._accounts = new Map();
    /** @type {number} 当前选中的账户索引 */
    this._selectedIndex = 0;
    /** @type {string} 钱包状态 */
    this._state = WALLET_STATE.UNINITIALIZED;
    /** @type {number|null} 自动锁定定时器 */
    this._lockTimer = null;
  }

  /** 获取钱包当前状态 */
  get state() {
    return this._state;
  }

  /**
   * 初始化 — 检查存储中是否有钱包
   */
  async init() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTED_VAULT);
    if (data[STORAGE_KEYS.ENCRYPTED_VAULT]) {
      this._state = WALLET_STATE.LOCKED;
    } else {
      this._state = WALLET_STATE.UNINITIALIZED;
    }
    return this._state;
  }

  /**
   * 创建新钱包
   * @param {string} password - 用户设置的密码
   * @returns {Promise<{mnemonic: string, address: string}>}
   */
  async createWallet(password) {
    // 生成随机助记词钱包
    const wallet = ethers.Wallet.createRandom();
    const mnemonic = wallet.mnemonic.phrase;

    // 加密并存储
    await this._saveVault(mnemonic, password, 1);

    // 解锁状态
    this._mnemonic = mnemonic;
    this._password = password;
    this._state = WALLET_STATE.UNLOCKED;

    // 派生第一个账户
    this._deriveAccounts(1);
    this._resetLockTimer();

    return {
      mnemonic,
      address: this._accounts.get(0).address,
    };
  }

  /**
   * 导入助记词
   * @param {string} mnemonic - 助记词短语
   * @param {string} password - 用户设置的密码
   * @returns {Promise<{address: string}>}
   */
  async importWallet(mnemonic, password) {
    // 验证助记词
    if (!ethers.Mnemonic.isValidMnemonic(mnemonic.trim())) {
      throw new Error('助记词无效，请检查拼写和顺序');
    }

    const cleanMnemonic = mnemonic.trim().toLowerCase();

    // 加密并存储
    await this._saveVault(cleanMnemonic, password, 1);

    // 解锁
    this._mnemonic = cleanMnemonic;
    this._password = password;
    this._state = WALLET_STATE.UNLOCKED;

    this._deriveAccounts(1);
    this._resetLockTimer();

    return {
      address: this._accounts.get(0).address,
    };
  }

  /**
   * 解锁钱包
   * @param {string} password - 密码
   * @returns {Promise<{accounts: string[]}>}
   */
  async unlock(password) {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.ENCRYPTED_VAULT,
      STORAGE_KEYS.ACCOUNT_COUNT,
      STORAGE_KEYS.SELECTED_ACCOUNT,
    ]);

    const encryptedVault = data[STORAGE_KEYS.ENCRYPTED_VAULT];
    if (!encryptedVault) {
      throw new Error('钱包未初始化');
    }

    // 解密 vault
    const vaultJson = await decrypt(encryptedVault, password);
    const vault = JSON.parse(vaultJson);

    this._mnemonic = vault.mnemonic;
    this._password = password;
    this._state = WALLET_STATE.UNLOCKED;
    this._selectedIndex = data[STORAGE_KEYS.SELECTED_ACCOUNT] || 0;

    const accountCount = data[STORAGE_KEYS.ACCOUNT_COUNT] || 1;
    this._deriveAccounts(accountCount);
    this._resetLockTimer();

    return {
      accounts: this.getAddresses(),
    };
  }

  /**
   * 锁定钱包 — 清除内存中的敏感数据
   */
  lock() {
    this._mnemonic = null;
    this._password = null;
    this._accounts.clear();
    this._state = WALLET_STATE.LOCKED;
    if (this._lockTimer) {
      clearTimeout(this._lockTimer);
      this._lockTimer = null;
    }
  }

  /**
   * 添加新账户（派生下一个索引）
   * @returns {Promise<{address: string, index: number}>}
   */
  async addAccount() {
    this._ensureUnlocked();

    const newIndex = this._accounts.size;
    const hdNode = ethers.HDNodeWallet.fromPhrase(
      this._mnemonic,
      undefined,
      HD_PATH_PREFIX + newIndex
    );
    this._accounts.set(newIndex, hdNode);

    // 更新存储中的账户数量
    await chrome.storage.local.set({
      [STORAGE_KEYS.ACCOUNT_COUNT]: this._accounts.size,
    });

    return {
      address: hdNode.address,
      index: newIndex,
    };
  }

  /**
   * 选择当前账户
   * @param {number} index - 账户索引
   */
  async selectAccount(index) {
    if (!this._accounts.has(index)) {
      throw new Error('账户不存在');
    }
    this._selectedIndex = index;
    await chrome.storage.local.set({
      [STORAGE_KEYS.SELECTED_ACCOUNT]: index,
    });
  }

  /**
   * 获取当前选中的账户地址
   * @returns {string}
   */
  getSelectedAddress() {
    this._ensureUnlocked();
    return this._accounts.get(this._selectedIndex).address;
  }

  /**
   * 获取所有账户地址列表
   * @returns {string[]}
   */
  getAddresses() {
    const addresses = [];
    for (const [, wallet] of this._accounts) {
      addresses.push(wallet.address);
    }
    return addresses;
  }

  /**
   * 获取账户列表（带索引和名称）
   * @returns {Array<{index: number, address: string, name: string}>}
   */
  getAccountList() {
    const list = [];
    for (const [index, wallet] of this._accounts) {
      list.push({
        index,
        address: wallet.address,
        name: `账户 ${index + 1}`,
      });
    }
    return list;
  }

  /**
   * 签名交易
   * @param {object} txParams - 交易参数
   * @param {ethers.Provider} provider - 网络 provider
   * @returns {Promise<ethers.TransactionResponse>}
   */
  async signAndSendTransaction(txParams, provider) {
    this._ensureUnlocked();

    const wallet = this._accounts.get(this._selectedIndex).connect(provider);

    const tx = {
      to: txParams.to,
      value: txParams.value || '0x0',
      data: txParams.data || '0x',
      gasLimit: txParams.gas || txParams.gasLimit,
    };

    const txResponse = await wallet.sendTransaction(tx);
    this._resetLockTimer();
    return txResponse;
  }

  /**
   * 签名消息 (personal_sign)
   * @param {string} message - 要签名的消息
   * @returns {Promise<string>} 签名结果
   */
  async signMessage(message) {
    this._ensureUnlocked();

    const wallet = this._accounts.get(this._selectedIndex);
    const signature = await wallet.signMessage(message);
    this._resetLockTimer();
    return signature;
  }

  /**
   * 导出助记词（需要验证密码）
   * @param {string} password - 当前密码
   * @returns {Promise<string>} 助记词
   */
  async exportMnemonic(password) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTED_VAULT);
    const vaultJson = await decrypt(data[STORAGE_KEYS.ENCRYPTED_VAULT], password);
    const vault = JSON.parse(vaultJson);
    return vault.mnemonic;
  }

  // ========== 私有方法 ==========

  /**
   * 保存加密的 vault 到存储
   */
  async _saveVault(mnemonic, password, accountCount) {
    const vault = JSON.stringify({ mnemonic });
    const encrypted = await encrypt(vault, password);

    await chrome.storage.local.set({
      [STORAGE_KEYS.ENCRYPTED_VAULT]: encrypted,
      [STORAGE_KEYS.ACCOUNT_COUNT]: accountCount,
      [STORAGE_KEYS.SELECTED_ACCOUNT]: 0,
    });
  }

  /**
   * 从助记词派生多个账户
   * @param {number} count - 派生数量
   */
  _deriveAccounts(count) {
    this._accounts.clear();
    for (let i = 0; i < count; i++) {
      const hdNode = ethers.HDNodeWallet.fromPhrase(
        this._mnemonic,
        undefined,
        HD_PATH_PREFIX + i
      );
      this._accounts.set(i, hdNode);
    }
  }

  /**
   * 确保钱包已解锁
   */
  _ensureUnlocked() {
    if (this._state !== WALLET_STATE.UNLOCKED) {
      throw new Error('钱包已锁定，请先解锁');
    }
  }

  /**
   * 重置自动锁定计时器
   */
  _resetLockTimer() {
    if (this._lockTimer) {
      clearTimeout(this._lockTimer);
    }
    this._lockTimer = setTimeout(() => {
      this.lock();
    }, AUTO_LOCK_TIMEOUT);
  }
}

// 导出单例
export const walletManager = new WalletManager();
