# 在接收地址页面增加地址二维码功能

本方案旨在为钱包的“接收”页面添加二维码展示功能。其他设备（如手机钱包或其他扫码器）扫描此二维码后，可直接读取钱包地址，从而实现自动填充地址，极大提升转账易用性与准确度。

## 待审阅内容

> [!IMPORTANT]
> **二维码对比度与扫码成功率**
> 二维码识别对色彩对比度有较高要求。为了适配钱包的现代暗色主题，我们将使用专门的白色圆角卡片容器包裹二维码，以确保在任何设备、任何光线下均能被快速、高精度地扫描识别。
> 二维码的生成将通过引入成熟轻量的 [qrcode](https://www.npmjs.com/package/qrcode) npm 依赖实现，直接在前端本地渲染，保障绝对的隐私与离线可用性。

## 提议的变更

---

### 依赖与配置

#### [MODIFY] [package.json](file:///Users/shipengliu/antigravity/qianbaoweb3/package.json)
- 将 `"qrcode": "^1.5.4"` 添加到 `dependencies` 中。

---

### 用户界面 (UI) 层

#### [MODIFY] [popup.html](file:///Users/shipengliu/antigravity/qianbaoweb3/src/popup/popup.html)
- 重构 `#receive-modal` 中的布局。
- 移除原本占据主要视觉但无实用功能的钻石大头像。
- 新增一个高亮包裹的二维码容器和 `<canvas id="receive-qrcode"></canvas>` 元素，使扫码更为直接和快捷。

```html
<!-- ===== Receive Modal ===== -->
<div class="modal-overlay" id="receive-modal">
  <div class="modal" style="text-align: center;">
    <h3 class="modal-title" id="receive-title">接收 ETH</h3>
    <div style="margin: 16px 0;">
      <!-- 新增二维码显示区域 -->
      <div class="qrcode-container" style="background: #ffffff; padding: 12px; border-radius: var(--radius-md); display: inline-block; margin: 0 auto 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
        <canvas id="receive-qrcode" style="width: 140px; height: 140px; display: block;"></canvas>
      </div>
      <p id="receive-address" style="font-size: 12px; color: var(--text-secondary); word-break: break-all; font-family: 'SF Mono', monospace; padding: 12px; background: var(--bg-input); border-radius: var(--radius-md); border: 1px solid var(--border);"></p>
    </div>
    <button id="btn-copy-receive-address" class="btn btn-primary btn-full btn-sm">📋 复制地址</button>
    <button id="btn-close-receive" class="btn btn-secondary btn-full btn-sm" style="margin-top: 8px;">关闭</button>
  </div>
</div>
```

#### [MODIFY] [popup.js](file:///Users/shipengliu/antigravity/qianbaoweb3/src/popup/popup.js)
- 在文件顶部引入 `import QRCode from 'qrcode';`。
- 修改 `showReceiveModal()` 函数：
  - 获取当前的钱包地址后，调用 `QRCode.toCanvas` 将地址渲染到新加的 `#receive-qrcode` 元素中。
  - 为确保清晰易扫，设置 `margin: 1` 和 `width: 140`。

---

## 验证计划

### 构建与打包
- 运行 `npm install` 安装新增的二维码库依赖。
- 运行 `npm run build` 进行 Webpack 打包，检查是否有打包或引包错误。

### 手动验证
1. 打开钱包 Popup，切换到不同网络（如 BSC、Ethereum）。
2. 点击主界面上的 **"接收"** 按钮，验证弹出的接收模态框中：
   - 钻石头像已被替换为一个清晰的二维码卡片。
   - 二维码卡片在暗色背景下有白色衬底（高对比度，方便识别）。
3. 使用手机微信、支付宝或任何 Web3 手机钱包（如 Trust Wallet / MetaMask）的扫码功能，扫描 Popup 中的二维码。
4. 验证扫码出的文本是否与下方显示的钱包地址（`0x...`）完全一致，且无多余的空格或特殊字符。
