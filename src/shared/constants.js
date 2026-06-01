/**
 * 网络配置常量
 */
export const NETWORKS = {
  1: {
    chainId: '0x1',
    chainName: 'Ethereum Mainnet',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    symbol: 'ETH',
    decimals: 18,
    blockExplorer: 'https://etherscan.io',
  },
  11155111: {
    chainId: '0xaa36a7',
    chainName: 'Sepolia 测试网',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    symbol: 'ETH',
    decimals: 18,
    blockExplorer: 'https://sepolia.etherscan.io',
  },
};

/**
 * 默认网络 chainId
 */
export const DEFAULT_CHAIN_ID = 1;

/**
 * BIP-44 派生路径前缀 (Ethereum)
 */
export const HD_PATH_PREFIX = "m/44'/60'/0'/0/";

/**
 * 自动锁定超时 (毫秒) — 5 分钟
 */
export const AUTO_LOCK_TIMEOUT = 5 * 60 * 1000;

/**
 * PBKDF2 迭代次数
 */
export const PBKDF2_ITERATIONS = 100000;

/**
 * 存储 key 名称
 */
export const STORAGE_KEYS = {
  ENCRYPTED_VAULT: 'encrypted_vault',
  CURRENT_NETWORK: 'current_network',
  CONNECTED_SITES: 'connected_sites',
  ACCOUNT_COUNT: 'account_count',
  SELECTED_ACCOUNT: 'selected_account',
};

/**
 * 钱包扩展名称
 */
export const WALLET_NAME = 'QianBao Web3';
