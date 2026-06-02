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

## 安装与使用指南

### 第一步：编译与打包项目
在运行插件前，需要先下载依赖并编译代码。

1. **安装依赖**：
   在项目根目录下，使用终端运行以下命令：
   ```bash
   npm install
   ```
2. **构建开发版**（推荐开发调试使用，支持自动监听修改）：
   ```bash
   npm run dev
   ```
3. **构建正式版**（压缩混淆，适合生产环境）：
   ```bash
   npm run build
   ```
编译完成后，项目根目录下会自动生成 **`dist/`** 目录，里面包含编译好的 Chrome 插件所有静态资源和脚本。

---

### 第二步：在 Chrome 浏览器中加载插件
由于本钱包属于定制开发的 Web3 钱包，需以开发者模式加载：

1. 打开 Google Chrome 浏览器，在地址栏输入并访问：`chrome://extensions/`。
2. 在扩展程序页面右上角，开启 **"开发者模式" (Developer mode)** 开关。
3. 点击左上角的 **"加载已解压的扩展程序" (Load unpacked)** 按钮。
4. 在弹出的文件选择器中，选择本项目根目录下的 **`dist`** 文件夹。
5. 成功加载后，点击浏览器工具栏右上角的 **"拼图"图标（扩展程序）**，找到 **钱宝 Web3 钱包** 并点击右侧的 **“图钉”图标（Pin）** 将其固定到工具栏中，方便随时开启。

---

### 第三步：钱包初始化与日常使用

#### 1. 初始化钱包
点击浏览器右上角的钱包图标，您将看到欢迎页面，支持两种初始化方式：
* **创建新钱包**：
  1. 输入符合强度要求的密码（至少 8 位，包含大小写及特殊字符）并确认。
  2. 页面会生成 12 个助记词。请务必将这 12 个单词按顺序记录在安全、离线的地方（请勿截图或保存在联网设备上！）。
  3. 点击“我已安全备份”完成创建。
* **导入已有钱包**：
  1. 输入您之前备份的 12 位助记词。
  2. 设置一个新的钱包密码。
  3. 点击确认恢复资产。

#### 2. 日常功能操作
* **账户管理**：
  * 钱包首页显示当前活跃账户名称及缩短地址。
  * **复制地址**：直接点击地址（例如 `0x1234...abcd`）即可自动复制完整地址到剪贴板。
  * **切换/派生账户**：点击首页顶部的账户名（或设置中的“添加账户”），可弹出账户选择列表。点击“派生新账户”，钱包会根据 BIP-44 协议自动衍生出一个全新的子地址，并无缝切入。
* **网络切换**：
  * 点击右上角网络选择下拉框，可在 **Ethereum Mainnet** 和 **Sepolia 测试网** 之间自由切换。切换后，钱包会自动更新节点提供商（RPC Provider）并刷新代币余额。
* **发送/接收代币**：
  * **接收**：点击“接收”，会弹出带有您完整钱包地址的模态框，点击复制即可发送给转账方。
  * **发送**：点击“发送”，输入 42 位接收方以太坊地址和转账金额。系统会自动预估当前的 Gas 价格，点击确认后输入密码即可广播交易。
* **锁定与导出**：
  * 在“设置”界面中，支持验证密码后安全地重新展示助记词（导出功能）。
  * 点击“锁定”可以立即清除内存私钥并跳转回锁屏页面（5分钟无操作也会自动锁定）。

---

### 第四步：使用本地测试 dApp 体验完整交互

为了方便开发者和用户体验完整的 dApp 连接、消息签名和交易审批流程，本项目内置了一个精心设计的本地测试页面。

#### 1. 运行测试页面
直接在浏览器中打开项目根目录下的测试网页：
* **[test-dapp/index.html](file:///Users/shipengliu/antigravity/qianbaoweb3/test-dapp/index.html)**
*(您可以在终端中使用命令 `open test-dapp/index.html` 快速打开，或者在文件管理器中双击该文件。)*

#### 2. 测试钱包授权连接 (eth_requestAccounts)
1. 在测试网页中，点击 **“连接钱包 (eth_requestAccounts)”** 按钮。
2. 钱宝钱包会自动弹出一个高为 620px、宽为 380px 的**独立审批窗口**。
3. 窗口中会清晰地展示请求发起方域名（如本地文件路径或 localhost）以及请求权限说明。
4. 点击 **“批准”**，测试网页的连接状态将更新为“已连接”，并展示您当前钱包的活跃地址和 Chain ID。

#### 3. 测试消息签名 (personal_sign)
1. 在网页的“消息签名”输入框中输入任意文本。
2. 点击 **“签名消息 (personal_sign)”** 按钮。
3. 钱包再次弹出审批窗口，向您完整还原将要签名的明文内容。
4. 点击 **“批准”** 后，测试网页的日志控制台将实时输出该消息经您私钥签名后产生的十六进制 Signature。

#### 4. 测试发送交易审批 (eth_sendTransaction)
1. 在测试页中指定“接收方地址”和“发送数量 (ETH)”。
2. 点击 **“发送交易”**。
3. 钱包弹出交易签名窗口，为您解析出交易的**收款人**、**转账金额**以及十六进制**附加数据 (data)**。
4. 确认无误后点击 **“批准”**，钱包将在后台进行交易签名并广播，测试网页会在日志控制台中即时拿到交易哈希（Tx Hash）。


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