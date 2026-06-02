/**
 * Popup 主逻辑
 * 管理页面路由、UI 交互、与 Background 通信
 */
import { MSG, WALLET_STATE } from '../shared/message-types.js';
import { NETWORKS } from '../shared/constants.js';

// ========== 工具函数 ==========

/**
 * 向 background 发送消息
 */
function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response && response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || '请求失败'));
      }
    });
  });
}

/**
 * 缩短地址显示
 */
function shortenAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('已复制到剪贴板', 'success');
  } catch {
    showToast('复制失败', 'error');
  }
}

// ========== 页面路由 ==========

const pages = {};
let currentPage = null;

function initPages() {
  document.querySelectorAll('.page').forEach(page => {
    pages[page.id.replace('page-', '')] = page;
  });
}

function navigateTo(pageName) {
  // 移除所有页面的 active 类，防止页面层叠冲突
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
  });
  
  const page = pages[pageName];
  if (page) {
    page.classList.add('active');
    currentPage = page;
  }
}

// ========== Toast 通知 ==========

let toastTimer = null;

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ========== Loading ==========

function showLoading(text = '处理中...') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading').classList.add('show');
}

function hideLoading() {
  document.getElementById('loading').classList.remove('show');
}

// ========== Modal ==========

let modalResolve = null;

function showModal(title, text, needPassword = false) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-text').textContent = text;
  const inputGroup = document.getElementById('modal-input-group');
  const passwordInput = document.getElementById('modal-password');
  inputGroup.style.display = needPassword ? 'block' : 'none';
  passwordInput.value = '';
  document.getElementById('modal-overlay').classList.add('show');

  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

function closeModal(confirmed = false) {
  document.getElementById('modal-overlay').classList.remove('show');
  if (modalResolve) {
    if (confirmed) {
      const password = document.getElementById('modal-password').value;
      modalResolve({ confirmed: true, password });
    } else {
      modalResolve({ confirmed: false });
    }
    modalResolve = null;
  }
}

// ========== 密码强度 ==========

function updatePasswordStrength(password) {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  const level = strength <= 1 ? 'weak' : strength <= 2 ? 'medium' : 'strong';

  for (let i = 1; i <= 4; i++) {
    const bar = document.getElementById(`pw-bar-${i}`);
    bar.className = 'password-strength-bar';
    if (i <= strength) {
      bar.classList.add('active', level);
    }
  }
}

// ========== 初始化 ==========

async function init() {
  initPages();

  // 先绑定事件，确保按钮可以立即响应
  bindEvents();

  // 检查是否是审批页面
  const hash = window.location.hash;
  if (hash.startsWith('#approve/')) {
    const requestId = hash.split('/')[1];
    await loadApprovalPage(requestId);
    return;
  }

  // 检查钱包状态（带重试，因为 Service Worker 可能还未就绪）
  let retries = 3;
  while (retries > 0) {
    try {
      const result = await sendMessage(MSG.GET_WALLET_STATE);
      switch (result.state) {
        case WALLET_STATE.UNINITIALIZED:
          navigateTo('welcome');
          break;
        case WALLET_STATE.LOCKED:
          navigateTo('lock');
          break;
        case WALLET_STATE.UNLOCKED:
          navigateTo('dashboard');
          await loadDashboard();
          break;
        default:
          navigateTo('welcome');
      }
      return; // 成功后退出
    } catch (e) {
      retries--;
      console.warn('[QianBao Popup] 连接后台失败, 剩余重试:', retries, e.message);
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 500)); // 等待 500ms 后重试
      }
    }
  }

  // 所有重试都失败，默认显示欢迎页
  console.warn('[QianBao Popup] 无法连接后台 Service Worker，显示欢迎页');
  navigateTo('welcome');
}

// ========== 事件绑定 ==========

function bindEvents() {
  // === Welcome ===
  document.getElementById('btn-create-wallet').addEventListener('click', () => {
    navigateTo('create');
  });

  document.getElementById('btn-import-wallet').addEventListener('click', () => {
    navigateTo('import');
  });

  // === Back buttons ===
  document.querySelectorAll('.back-btn[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.back);
    });
  });

  // === Create Wallet ===
  document.getElementById('create-password').addEventListener('input', (e) => {
    updatePasswordStrength(e.target.value);
  });

  document.getElementById('btn-create-next').addEventListener('click', handleCreateNext);
  document.getElementById('btn-create-done').addEventListener('click', handleCreateDone);
  document.getElementById('btn-copy-mnemonic').addEventListener('click', () => {
    const words = document.getElementById('mnemonic-display').dataset.mnemonic;
    copyToClipboard(words);
  });

  // === Import Wallet ===
  document.getElementById('btn-import-confirm').addEventListener('click', handleImport);

  // === Lock Screen ===
  document.getElementById('btn-unlock').addEventListener('click', handleUnlock);
  document.getElementById('btn-reset-wallet').addEventListener('click', handleResetWallet);
  document.getElementById('lock-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleUnlock();
  });

  // === Dashboard ===
  document.getElementById('account-address').addEventListener('click', () => {
    const addr = document.getElementById('account-address').dataset.address;
    if (addr) copyToClipboard(addr);
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    navigateTo('settings');
  });

  document.getElementById('btn-send').addEventListener('click', () => {
    navigateTo('send');
    loadGasPrice();
  });

  document.getElementById('btn-receive').addEventListener('click', showReceiveModal);

  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadDashboard();
    showToast('刷新中...', 'info');
  });

  // === Network Selector ===
  document.getElementById('network-selector').addEventListener('click', toggleNetworkDropdown);

  // === Account Selector ===
  document.getElementById('btn-switch-account').addEventListener('click', showAccountSelector);
  document.getElementById('btn-close-account-selector').addEventListener('click', hideAccountSelector);
  document.getElementById('btn-add-account-in-selector').addEventListener('click', handleAddAccount);

  // === Send ===
  document.getElementById('btn-send-confirm').addEventListener('click', handleSendTransaction);

  // === Settings ===
  document.getElementById('settings-add-account').addEventListener('click', handleAddAccount);
  document.getElementById('settings-export').addEventListener('click', handleExportMnemonic);
  document.getElementById('settings-lock').addEventListener('click', handleLock);

  // === Approve ===
  document.getElementById('btn-approve-confirm').addEventListener('click', handleApproveConfirm);
  document.getElementById('btn-approve-reject').addEventListener('click', handleApproveReject);

  // === Modal ===
  document.getElementById('modal-cancel').addEventListener('click', () => closeModal(false));
  document.getElementById('modal-confirm').addEventListener('click', () => closeModal(true));

  // === Receive Modal ===
  document.getElementById('btn-copy-receive-address').addEventListener('click', () => {
    const addr = document.getElementById('receive-address').textContent;
    copyToClipboard(addr);
  });
  document.getElementById('btn-close-receive').addEventListener('click', () => {
    document.getElementById('receive-modal').classList.remove('show');
  });
}

// ========== 创建钱包 ==========

let createdMnemonic = null;

async function handleCreateNext() {
  const password = document.getElementById('create-password').value;
  const confirm = document.getElementById('create-password-confirm').value;

  if (password.length < 8) {
    showToast('密码至少需要 8 个字符', 'error');
    return;
  }

  if (password !== confirm) {
    showToast('两次密码输入不一致', 'error');
    return;
  }

  showLoading('正在创建钱包...');
  try {
    const result = await sendMessage(MSG.CREATE_WALLET, { password });
    createdMnemonic = result.mnemonic;

    // 显示助记词
    const grid = document.getElementById('mnemonic-display');
    const words = result.mnemonic.split(' ');
    grid.innerHTML = words.map((word, i) =>
      `<div class="mnemonic-word">
        <span class="mnemonic-word-index">${i + 1}</span>
        <span class="mnemonic-word-text">${word}</span>
      </div>`
    ).join('');
    grid.dataset.mnemonic = result.mnemonic;

    // 切换步骤
    document.getElementById('create-step-1').style.display = 'none';
    document.getElementById('create-step-2').style.display = 'block';
    document.getElementById('btn-create-next').style.display = 'none';
    document.getElementById('btn-create-done').style.display = 'block';

    hideLoading();
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
  }
}

function handleCreateDone() {
  createdMnemonic = null;
  // 重置创建页面状态
  document.getElementById('create-step-1').style.display = 'block';
  document.getElementById('create-step-2').style.display = 'none';
  document.getElementById('btn-create-next').style.display = 'block';
  document.getElementById('btn-create-done').style.display = 'none';
  document.getElementById('create-password').value = '';
  document.getElementById('create-password-confirm').value = '';

  navigateTo('dashboard');
  loadDashboard();
}

// ========== 导入钱包 ==========

async function handleImport() {
  const mnemonic = document.getElementById('import-mnemonic').value.trim();
  const password = document.getElementById('import-password').value;
  const confirm = document.getElementById('import-password-confirm').value;

  if (!mnemonic) {
    showToast('请输入助记词', 'error');
    return;
  }

  if (password.length < 8) {
    showToast('密码至少需要 8 个字符', 'error');
    return;
  }

  if (password !== confirm) {
    showToast('两次密码输入不一致', 'error');
    return;
  }

  showLoading('正在导入钱包...');
  try {
    await sendMessage(MSG.IMPORT_WALLET, { mnemonic, password });
    hideLoading();
    showToast('钱包导入成功！', 'success');

    // 清理表单
    document.getElementById('import-mnemonic').value = '';
    document.getElementById('import-password').value = '';
    document.getElementById('import-password-confirm').value = '';

    navigateTo('dashboard');
    loadDashboard();
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
  }
}

// ========== 解锁钱包 ==========

async function handleUnlock() {
  const password = document.getElementById('lock-password').value;
  if (!password) {
    showToast('请输入密码', 'error');
    return;
  }

  showLoading('正在解锁...');
  try {
    await sendMessage(MSG.UNLOCK_WALLET, { password });
    hideLoading();
    document.getElementById('lock-password').value = '';
    navigateTo('dashboard');
    loadDashboard();
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
  }
}

async function handleResetWallet() {
  const confirmed = await showModal(
    '危险操作：重置钱包',
    '重置钱包将会清空本地存储的所有账户和加密数据，且无法找回！请确保您已经备份了助记词。是否确认重置？'
  );

  if (!confirmed.confirmed) return;

  showLoading('正在重置钱包...');
  try {
    await chrome.storage.local.clear();
    showToast('重置成功，正在重启插件...', 'success');
    setTimeout(() => {
      chrome.runtime.reload();
    }, 1000);
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
  }
}

// ========== Dashboard ==========

async function loadDashboard() {
  try {
    // 并行加载账户和网络信息
    const [accountData, networkData] = await Promise.all([
      sendMessage(MSG.GET_ACCOUNTS),
      sendMessage(MSG.GET_NETWORK),
    ]);

    // 更新账户信息
    const addr = accountData.selected;
    document.getElementById('account-address').textContent = shortenAddress(addr);
    document.getElementById('account-address').dataset.address = addr;

    // 找到当前账户
    const currentAccount = accountData.accounts.find(a => a.address === addr);
    if (currentAccount) {
      document.getElementById('account-name').textContent = currentAccount.name;
      document.getElementById('account-avatar').textContent = currentAccount.index + 1;
    }

    // 更新网络
    document.getElementById('network-name').textContent = networkData.chainName;

    // 加载余额
    loadBalance(addr);
  } catch (e) {
    console.error('加载 Dashboard 失败:', e);
    // 如果是因为钱包被锁定（Service Worker 重启导致），自动跳转到锁定页面
    if (e.message && e.message.includes('锁定')) {
      showToast('钱包已锁定，请重新解锁', 'info');
      navigateTo('lock');
    }
  }
}

async function loadBalance(address) {
  try {
    const result = await sendMessage(MSG.GET_BALANCE, { address });
    const formatted = parseFloat(result.balanceFormatted).toFixed(4);
    document.getElementById('balance-amount').textContent = formatted;
  } catch (e) {
    document.getElementById('balance-amount').textContent = '-.----';
  }
}

// ========== Network ==========

function toggleNetworkDropdown() {
  const dropdown = document.getElementById('network-dropdown');
  const isShown = dropdown.classList.contains('show');

  if (isShown) {
    dropdown.classList.remove('show');
    return;
  }

  // 构建网络列表
  const networks = Object.entries(NETWORKS);
  dropdown.innerHTML = networks.map(([id, net]) => `
    <div class="network-option" data-chain-id="${id}">
      <span class="network-dot" style="${id === '1' ? '' : 'background: #FFA502; box-shadow: 0 0 8px rgba(255, 165, 2, 0.5);'}"></span>
      <span>${net.chainName}</span>
    </div>
  `).join('');

  // 绑定点击
  dropdown.querySelectorAll('.network-option').forEach(option => {
    option.addEventListener('click', async () => {
      const chainId = parseInt(option.dataset.chainId);
      showLoading('切换网络...');
      try {
        const result = await sendMessage(MSG.SWITCH_NETWORK, { chainId });
        document.getElementById('network-name').textContent = result.chainName;
        dropdown.classList.remove('show');
        hideLoading();
        loadDashboard();
      } catch (e) {
        hideLoading();
        showToast(e.message, 'error');
      }
    });
  });

  dropdown.classList.add('show');

  // 点击外部关闭
  setTimeout(() => {
    const handler = (e) => {
      if (!dropdown.contains(e.target) && e.target.id !== 'network-selector') {
        dropdown.classList.remove('show');
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 0);
}

// ========== Account Selector ==========

async function showAccountSelector() {
  try {
    const data = await sendMessage(MSG.GET_ACCOUNTS);
    const list = document.getElementById('account-selector-list');

    list.innerHTML = data.accounts.map(acc => `
      <div class="account-selector-item ${acc.address === data.selected ? 'active' : ''}"
           data-index="${acc.index}">
        <div class="account-avatar">${acc.index + 1}</div>
        <div>
          <div class="account-name">${acc.name}</div>
          <div class="account-selector-addr">${shortenAddress(acc.address)}</div>
        </div>
      </div>
    `).join('');

    // 绑定点击
    list.querySelectorAll('.account-selector-item').forEach(item => {
      item.addEventListener('click', async () => {
        const index = parseInt(item.dataset.index);
        try {
          await sendMessage(MSG.SELECT_ACCOUNT, { index });
          hideAccountSelector();
          loadDashboard();
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });

    document.getElementById('account-selector-overlay').classList.add('show');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function hideAccountSelector() {
  document.getElementById('account-selector-overlay').classList.remove('show');
}

async function handleAddAccount() {
  showLoading('派生新账户...');
  try {
    const result = await sendMessage(MSG.ADD_ACCOUNT);
    hideLoading();
    hideAccountSelector();
    showToast(`已添加账户 ${result.index + 1}: ${shortenAddress(result.address)}`, 'success');
    loadDashboard();
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
  }
}

// ========== Send Transaction ==========

async function loadGasPrice() {
  try {
    const result = await sendMessage(MSG.GET_GAS_PRICE);
    document.getElementById('gas-estimate').textContent = `${parseFloat(result.gasPriceGwei).toFixed(2)} Gwei`;
  } catch (e) {
    document.getElementById('gas-estimate').textContent = '-- Gwei';
  }
}

async function handleSendTransaction() {
  const to = document.getElementById('send-to').value.trim();
  const amount = document.getElementById('send-amount').value;

  if (!to || !to.startsWith('0x') || to.length !== 42) {
    showToast('请输入有效的以太坊地址', 'error');
    return;
  }

  if (!amount || parseFloat(amount) <= 0) {
    showToast('请输入有效的金额', 'error');
    return;
  }

  const confirmed = await showModal(
    '确认发送',
    `发送 ${amount} ETH 到\n${shortenAddress(to)}`
  );

  if (!confirmed.confirmed) return;

  showLoading('正在发送交易...');
  try {
    // 将 ETH 转换为 Wei (hex)
    const valueWei = BigInt(Math.floor(parseFloat(amount) * 1e18));
    const tx = {
      to,
      value: '0x' + valueWei.toString(16),
    };

    const result = await sendMessage(MSG.SEND_TRANSACTION, { tx });
    hideLoading();
    showToast(`交易已发送！Hash: ${shortenAddress(result.hash)}`, 'success');

    // 清理表单
    document.getElementById('send-to').value = '';
    document.getElementById('send-amount').value = '';

    navigateTo('dashboard');
    loadDashboard();
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
  }
}

// ========== Receive ==========

function showReceiveModal() {
  const addr = document.getElementById('account-address').dataset.address;
  document.getElementById('receive-address').textContent = addr;
  document.getElementById('receive-modal').classList.add('show');
}

// ========== Settings ==========

async function handleExportMnemonic() {
  const result = await showModal(
    '导出助记词',
    '请输入密码以查看助记词。请确保在安全的环境下操作。',
    true
  );

  if (!result.confirmed) return;

  showLoading('验证密码...');
  try {
    const data = await sendMessage(MSG.EXPORT_MNEMONIC, { password: result.password });
    hideLoading();

    // 显示助记词在 modal 中
    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = '你的助记词';
    document.getElementById('modal-text').textContent = data.mnemonic;
    document.getElementById('modal-text').style.fontFamily = "'SF Mono', monospace";
    document.getElementById('modal-text').style.wordBreak = 'break-word';
    document.getElementById('modal-input-group').style.display = 'none';
    modal.classList.add('show');

    // 重置 modal 文字样式 on close
    const origResolve = modalResolve;
    modalResolve = () => {
      document.getElementById('modal-text').style.fontFamily = '';
      document.getElementById('modal-text').style.wordBreak = '';
      if (origResolve) origResolve({ confirmed: false });
    };
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
  }
}

async function handleLock() {
  try {
    await sendMessage(MSG.LOCK_WALLET);
    navigateTo('lock');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ========== Approve Page ==========

async function loadApprovalPage() {
  navigateTo('approve');

  try {
    const request = await sendMessage(MSG.GET_PENDING_REQUEST);
    if (!request) {
      document.getElementById('approve-title').textContent = '无待处理请求';
      return;
    }

    document.getElementById('approve-origin-text').textContent = request.origin || '未知';

    if (request.type === 'connect') {
      document.getElementById('approve-title').textContent = '连接请求';
      document.getElementById('approve-detail-text').textContent =
        '此网站请求连接你的钱包，连接后可查看你的账户地址。';
    } else if (request.type === 'transaction') {
      document.getElementById('approve-title').textContent = '交易签名';
      const content = document.getElementById('approve-content');
      const tx = request.txParams;
      content.innerHTML = `
        <div class="approve-detail">
          <div class="approve-detail-label">收款地址</div>
          <div class="approve-detail-value">${tx.to || '合约创建'}</div>
        </div>
        <div class="approve-detail">
          <div class="approve-detail-label">金额</div>
          <div class="approve-detail-value">${tx.value ? (parseInt(tx.value, 16) / 1e18).toFixed(6) + ' ETH' : '0 ETH'}</div>
        </div>
        ${tx.data && tx.data !== '0x' ? `
          <div class="approve-detail">
            <div class="approve-detail-label">数据</div>
            <div class="approve-detail-value" style="font-size: 11px; max-height: 100px; overflow-y: auto;">${tx.data}</div>
          </div>
        ` : ''}
      `;
    } else if (request.type === 'sign') {
      document.getElementById('approve-title').textContent = '消息签名';
      document.getElementById('approve-detail-text').textContent = request.message;
    }
  } catch (e) {
    showToast('加载审批请求失败', 'error');
  }
}

async function handleApproveConfirm() {
  showLoading('处理中...');
  try {
    const request = await sendMessage(MSG.GET_PENDING_REQUEST);
    if (request && request.type === 'connect') {
      await sendMessage(MSG.APPROVE_CONNECTION);
    } else {
      await sendMessage(MSG.APPROVE_TRANSACTION);
    }
    hideLoading();
    showToast('已批准', 'success');
    setTimeout(() => window.close(), 1000);
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
  }
}

async function handleApproveReject() {
  try {
    const request = await sendMessage(MSG.GET_PENDING_REQUEST);
    if (request && request.type === 'connect') {
      await sendMessage(MSG.REJECT_CONNECTION);
    } else {
      await sendMessage(MSG.REJECT_TRANSACTION);
    }
    showToast('已拒绝', 'info');
    setTimeout(() => window.close(), 500);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ========== 启动 ==========

document.addEventListener('DOMContentLoaded', init);
