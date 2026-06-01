#!/usr/bin/env node
/**
 * 生成扩展图标 — 使用简单的 PPM 格式转换
 * 生成紫色渐变背景 + 白色钻石图案的图标
 */

const fs = require('fs');
const path = require('path');

function generateIcon(size) {
  // 创建像素数据
  const pixels = new Uint8Array(size * size * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 3;

      // 圆角检测
      const radius = size * 0.2;
      const isOutside = isOutsideRoundedRect(x, y, size, size, radius);

      if (isOutside) {
        // 透明 (用白色表示)
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        continue;
      }

      // 渐变背景: #7B61FF → #00D2FF (左上到右下)
      const t = (x / size + y / size) / 2;
      const r = Math.round(123 * (1 - t) + 0 * t);
      const g = Math.round(97 * (1 - t) + 210 * t);
      const b = Math.round(255 * (1 - t) + 255 * t);

      // 检查是否在钻石形状内
      const cx = size / 2;
      const cy = size / 2;
      const diamondSize = size * 0.3;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);

      if (dx / diamondSize + dy / diamondSize < 1) {
        // 白色钻石
        pixels[idx] = 255;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = 255;
      } else {
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
      }
    }
  }

  return pixels;
}

function isOutsideRoundedRect(x, y, w, h, r) {
  // 四个角的圆角检测
  if (x < r && y < r) {
    return Math.sqrt((r - x) ** 2 + (r - y) ** 2) > r;
  }
  if (x > w - r && y < r) {
    return Math.sqrt((x - (w - r)) ** 2 + (r - y) ** 2) > r;
  }
  if (x < r && y > h - r) {
    return Math.sqrt((r - x) ** 2 + (y - (h - r)) ** 2) > r;
  }
  if (x > w - r && y > h - r) {
    return Math.sqrt((x - (w - r)) ** 2 + (y - (h - r)) ** 2) > r;
  }
  return false;
}

// 简单 BMP 写入
function writeBMP(filepath, pixels, width, height) {
  const rowSize = Math.ceil(width * 3 / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const buf = Buffer.alloc(fileSize);

  // BMP Header
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // offset

  // DIB Header
  buf.writeUInt32LE(40, 14); // header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22); // negative = top-down
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bpp
  buf.writeUInt32LE(0, 30); // compression
  buf.writeUInt32LE(pixelDataSize, 34);

  // Pixel data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 3;
      const dstIdx = 54 + y * rowSize + x * 3;
      buf[dstIdx] = pixels[srcIdx + 2]; // B
      buf[dstIdx + 1] = pixels[srcIdx + 1]; // G
      buf[dstIdx + 2] = pixels[srcIdx]; // R
    }
  }

  fs.writeFileSync(filepath, buf);
}

// PNG 最小实现
function writePNG(filepath, pixels, width, height) {
  const zlib = require('zlib');

  // 准备 RGBA 行数据 (带 filter byte)
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 3;
      const dstIdx = y * (width * 4 + 1) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];     // R
      rawData[dstIdx + 1] = pixels[srcIdx + 1]; // G
      rawData[dstIdx + 2] = pixels[srcIdx + 2]; // B
      // Alpha: 如果是黑色(背景外)则透明
      rawData[dstIdx + 3] = (pixels[srcIdx] === 0 && pixels[srcIdx + 1] === 0 && pixels[srcIdx + 2] === 0) ? 0 : 255;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // 构建 PNG
  const chunks = [];

  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  chunks.push(makeChunk('IHDR', ihdr));

  // IDAT
  chunks.push(makeChunk('IDAT', compressed));

  // IEND
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  fs.writeFileSync(filepath, Buffer.concat(chunks));
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcInput);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 生成三种尺寸
const sizes = [16, 48, 128];
const outDir = path.join(__dirname, 'assets', 'icons');

sizes.forEach(size => {
  const pixels = generateIcon(size);
  const filepath = path.join(outDir, `icon${size}.png`);
  writePNG(filepath, pixels, size, size);
  console.log(`✓ 生成 icon${size}.png`);
});

console.log('图标生成完成！');
