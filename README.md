# QianBao Web3 钱包 Chrome 扩展

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](manifest.json)
[![Manifest Version](https://img.shields.io/badge/Manifest-V3-green.svg)](manifest.json)
[![Ethers Version](https://img.shields.io/badge/ethers-v6-orange.svg)](package.json)

QianBao Web3 钱包是一个基于 Chrome 扩展 Manifest V3 开发的安全、轻量级的 Web3 钱包。它支持助记词管理、多账户派生、主流网络切换，以及与 dApp 的无缝连接（支持 EIP-1193 和 EIP-6963 协议）。

---

## 核心特性

- 🔑 **助记词管理**：支持生成全新的 12 词助记词，或安全导入已有助记词。
- 🛡️ **高强度加密保护**：
  - 采用 **Web Crypto API**。
  - 使用 **PBKDF2**（100,000 次迭代）从密码派生高强度对称密钥。
  - 使用 **AES-GCM (256-bit)** 加密算法对助记词进行本地存储加密。
- 🔄 **自动锁定机制**：5 分钟无操作自动锁定钱包，清除内存中解密的助记词和密码，防范内存泄露与物理接触攻击。
- 👥 **多账户派生**：支持 BIP-44 协议（派生路径 `m/44'/60'/0'/0/index`），一键快速派生多个子账户。
- 🌐 **网络管理**：内置 Ethereum 主网和 Sepolia 测试网，支持实时查询余额、估算 Gas 费、查询 Gas 价格及一键切换网络。
- 🔗 **dApp 桥接与授权**：
  - **EIP-1193 兼容**：注入 `window.ethereum` 提供标准接口。
  - **EIP-6963 兼容**：支持多钱包共存的发现机制（Multi-Provider Discovery）。
  - **独立审批弹窗**：dApp 请求连接、发送交易和签名消息时，会弹出独立的安全确认窗口，防止静默盗取资金。

---

## 架构设计

本扩展采用 Chrome Extension MV3 的多层通信架构，保障了注入页面 (Inpage) 的沙箱环境与后台敏感数据 (Background) 的隔离。

```mermaid
flowchart TD
    subgraph dApp Sandbox (Web Page)
        dApp[网页/dApp] <-->|EIP-1193/6963| Provider[Inpage Provider: window.ethereum]
    end

    subgraph Content Script Layer (Bridge)
        CS[content-script.js]
    end

    subgraph Chrome Extension Environment
        Background[background/index.js\nService Worker] <--> Wallet[wallet-manager.js]
        Background <--> Network[network-manager.js]
        Background <--> DappHandler[dapp-handler.js]
        Popup[popup.js / HTML / CSS\n插件弹窗]
    end

    %% Communication channels
    Provider <-->|window.postMessage| CS
    CS <-->|chrome.runtime.sendMessage| Background
    Popup <-->|chrome.runtime.sendMessage| Background
    DappHandler -->|windows.create| PopupApprove[popup.html#approve\n独立审批弹窗]
```

- **Inpage Script ([inpage.js](file:///Users/shipengliu/antigravity/qianbaoweb3/src/inpage/inpage.js))**：尽早注入到网页的 DOM 中，创建 `window.ethereum` 对象，拦截并处理 dApp 的 JSON-RPC 请求，通过 `window.postMessage` 与 Content Script 通信。
- **Content Script ([content-script.js](file:///Users/shipengliu/antigravity/qianbaoweb3/src/content/content-script.js))**：充当桥梁，接收 Inpage 的消息，通过 `chrome.runtime.sendMessage` 安全地转发给后台 Service Worker。
- **Background Service Worker ([index.js](file:///Users/shipengliu/antigravity/qianbaoweb3/src/background/index.js))**：
  - 它是整个钱包的大脑，生命周期由浏览器管理。
  - 内部持有单例：[walletManager](file:///Users/shipengliu/antigravity/qianbaoweb3/src/background/wallet-manager.js)、[networkManager](file:///Users/shipengliu/antigravity/qianbaoweb3/src/background/network-manager.js) 和 [dappHandler](file:///Users/shipengliu/antigravity/qianbaoweb3/src/background/dapp-handler.js)。
  - 管理加密存储库、余额获取、网络调用、并向外部 dApp 做出响应。
- **Popup UI ([popup.js](file:///Users/shipengliu/antigravity/qianbaoweb3/src/popup/popup.js))**：提供直观的用户界面，实现创建钱包、解锁钱包、发送代币、管理账户和网络切换，以及处理来自 dApp 的确认操作。

---

## 目录结构

```text
qianbaoweb3/
├── assets/                     # 资源文件（图标等）
│   └── icons/                  # 钱包在不同尺寸下的 Logo
├── dist/                       # 构建输出目录（编译生成的插件）
├── src/                        # 源代码目录
│   ├── background/             # 后台 Service Worker 逻辑
│   │   ├── crypto-utils.js     # 基于 Web Crypto 的加解密工具
│   │   ├── dapp-handler.js     # 处理来自 dApp 的 JSON-RPC 路由和审批
│   │   ├── index.js            # Background 入口与消息转发监听
│   │   ├── network-manager.js  # 负责 RPC 连接、余额与 Gas 查询
│   │   └── wallet-manager.js   # 核心钱包管理：助记词、账户派生与签名
│   ├── content/                # Content Script 桥接层
│   │   └── content-script.js
│   ├── inpage/                 # 注入到页面的 Web3 接口层
│   │   └── inpage.js           # 封装 EIP-1193 / EIP-6963 协议
│   ├── popup/                  # 插件弹窗与 UI 交互层
│   │   ├── popup.css           # 钱包专属的高端深色系 UI 样式
│   │   ├── popup.html          # HTML 结构
│   │   └── popup.js            # 路由管理、事件绑定与数据渲染
│   └── shared/                 # 跨模块共享配置
│       ├── constants.js        # 网络定义、派生路径与锁定超时时间
│       └── message-types.js    # 统一的消息通道与消息类型定义
├── generate-icons.js           # 自动生成图标的 Node 脚本
├── manifest.json               # Chrome 插件 Manifest V3 配置文件
├── package.json                # 项目依赖及构建脚本
├── webpack.config.js           # Webpack 打包配置文件
└── README.md                   # 开发者文档说明
```

---

## 快速上手与运行

### 1. 安装依赖

确保你本地安装了 [Node.js](https://nodejs.org/)，在项目根目录下执行：

```bash
npm install
```

### 2. 开发模式运行

在开发期间，启动 Webpack watch 模式。代码修改后会自动编译，无需手动重新打包：

```bash
npm run dev
```

### 3. 生成生产包

打包并压缩代码，生成可以直接用于发布的版本：

```bash
npm run build
```

### 4. 加载至浏览器

1. 打开 Google Chrome 或其他 Chromium 内核浏览器。
2. 访问地址：`chrome://extensions/`（扩展程序管理页面）。
3. 开启右上角的 **"开发者模式" (Developer mode)**。
4. 点击左上角的 **"加载已解压的扩展程序" (Load unpacked)**。
5. 选择本项目下的 **`dist`** 文件夹。
6. 加载完成后，您就可以在浏览器右上角的扩展栏里找到并打开 **QianBao Web3 钱包** 了！

---

## 安全机制深度解析

1. **零密钥明文落盘**：
   - 钱包仅把经过 **AES-GCM-256** 加密的密文 (Vault) 写入 Chrome 本地存储 (`chrome.storage.local`)。
   - 解密密钥是根据用户密码加上随机盐值通过 PBKDF2 动态派生的，即使磁盘上的存储数据被恶意软件读取，在没有正确密码的情况下也极难破解。
2. **内存隔离与自动锁定 (Auto-Lock)**：
   - 解密后的助记词、派生私钥仅存在于后台进程 (Background Service Worker) 的内存中，前台 Popup 无法直接接触到私钥。
   - 一旦用户连续 5 分钟没有任何交互，定时器将自动触发 `lock()`。该方法会显式将 `_mnemonic` 与 `_password` 置为 `null`，并清空所有派生账户的内存缓存。
3. **EIP-6963 规范**：
   - 传统浏览器钱包会通过覆盖 `window.ethereum` 导致多个钱包之间相互冲突（例如 MetaMask 与其他钱包抢占全局变量）。
   - 本项目率先支持 **EIP-6963**。通过分发 `eip6963:announceProvider` 事件，使新版 dApp（例如使用 RainbowKit 或 Wagmi 的应用）能够以多选列表形式识别并接入本钱包，与其他钱包和谐共存。