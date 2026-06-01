/**
 * Service Worker 入口
 * 处理来自 Popup 和 Content Script 的所有消息
 */
import { walletManager } from './wallet-manager.js';
import { networkManager } from './network-manager.js';
import { dappHandler } from './dapp-handler.js';
import { MSG, WALLET_STATE } from '../shared/message-types.js';
import { ethers } from 'ethers';

// ========== 初始化 ==========

async function initialize() {
  await walletManager.init();
  await networkManager.init();
  console.log('[QianBao] Service Worker 已初始化, 状态:', walletManager.state);
}

initialize();

// ========== 消息处理 ==========

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 异步处理消息
  handleMessage(message, sender)
    .then(result => sendResponse({ success: true, data: result }))
    .catch(error => sendResponse({
      success: false,
      error: error.message || error.toString(),
      code: error.code,
    }));

  // 返回 true 表示异步响应
  return true;
});

/**
 * 路由消息到对应处理器
 */
async function handleMessage(message, sender) {
  const { type, payload } = message;

  switch (type) {
    // === 钱包管理 ===
    case MSG.GET_WALLET_STATE:
      return { state: walletManager.state };

    case MSG.CREATE_WALLET:
      return walletManager.createWallet(payload.password);

    case MSG.IMPORT_WALLET:
      return walletManager.importWallet(payload.mnemonic, payload.password);

    case MSG.UNLOCK_WALLET:
      return walletManager.unlock(payload.password);

    case MSG.LOCK_WALLET:
      walletManager.lock();
      return { state: WALLET_STATE.LOCKED };

    // === 账户管理 ===
    case MSG.GET_ACCOUNTS:
      return {
        accounts: walletManager.getAccountList(),
        selected: walletManager.getSelectedAddress(),
      };

    case MSG.ADD_ACCOUNT:
      return walletManager.addAccount();

    case MSG.SELECT_ACCOUNT:
      await walletManager.selectAccount(payload.index);
      return { address: walletManager.getSelectedAddress() };

    case MSG.EXPORT_MNEMONIC:
      return { mnemonic: await walletManager.exportMnemonic(payload.password) };

    // === 网络 ===
    case MSG.GET_NETWORK:
      return networkManager.getCurrentNetwork();

    case MSG.SWITCH_NETWORK:
      const newNetwork = await networkManager.switchNetwork(payload.chainId);
      // 通知所有 tab 链已改变
      notifyAllTabs(MSG.CHAIN_CHANGED, { chainId: newNetwork.chainId });
      return newNetwork;

    case MSG.GET_BALANCE:
      return networkManager.getBalance(
        payload.address || walletManager.getSelectedAddress()
      );

    // === 交易 ===
    case MSG.SEND_TRANSACTION: {
      const provider = networkManager.getProvider();
      const txResponse = await walletManager.signAndSendTransaction(
        payload.tx,
        provider
      );
      return {
        hash: txResponse.hash,
      };
    }

    case MSG.ESTIMATE_GAS:
      return { gas: await networkManager.estimateGas(payload.tx) };

    case MSG.GET_GAS_PRICE:
      return networkManager.getGasPrice();

    // === dApp 请求 ===
    case MSG.DAPP_REQUEST: {
      const origin = sender.tab
        ? new URL(sender.tab.url || sender.url).origin
        : payload.origin || 'unknown';
      return dappHandler.handleRequest(origin, payload);
    }

    // === dApp 授权 ===
    case MSG.GET_PENDING_REQUEST:
      return dappHandler.getPendingRequest();

    case MSG.APPROVE_CONNECTION: {
      const request = dappHandler.getPendingRequest();
      if (request && request.type === 'connect') {
        await dappHandler.saveConnection(request.origin);
        const address = walletManager.getSelectedAddress();
        dappHandler.resolveRequest(request.id, true, [address]);
        return { success: true };
      }
      return { success: false };
    }

    case MSG.REJECT_CONNECTION: {
      const request = dappHandler.getPendingRequest();
      if (request) {
        dappHandler.resolveRequest(request.id, false);
        return { success: true };
      }
      return { success: false };
    }

    case MSG.APPROVE_TRANSACTION: {
      const request = dappHandler.getPendingRequest();
      if (request && request.type === 'transaction') {
        try {
          const provider = networkManager.getProvider();
          const txResponse = await walletManager.signAndSendTransaction(
            request.txParams,
            provider
          );
          dappHandler.resolveRequest(request.id, true, txResponse.hash);
          return { success: true, hash: txResponse.hash };
        } catch (e) {
          dappHandler.resolveRequest(request.id, false);
          throw e;
        }
      } else if (request && request.type === 'sign') {
        try {
          // 解码 hex 消息
          let msgToSign = request.message;
          if (msgToSign.startsWith('0x')) {
            try {
              msgToSign = ethers.toUtf8String(msgToSign);
            } catch {
              // 保持原始 hex
            }
          }
          const signature = await walletManager.signMessage(msgToSign);
          dappHandler.resolveRequest(request.id, true, signature);
          return { success: true, signature };
        } catch (e) {
          dappHandler.resolveRequest(request.id, false);
          throw e;
        }
      }
      return { success: false };
    }

    case MSG.REJECT_TRANSACTION: {
      const request = dappHandler.getPendingRequest();
      if (request) {
        dappHandler.resolveRequest(request.id, false);
        return { success: true };
      }
      return { success: false };
    }

    default:
      throw new Error(`未知消息类型: ${type}`);
  }
}

/**
 * 通知所有标签页
 */
function notifyAllTabs(type, data) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      try {
        chrome.tabs.sendMessage(tab.id, { type, data });
      } catch (e) {
        // 忽略无法通信的 tab
      }
    });
  });
}
