/**
 * 加密/解密工具模块
 * 使用 Web Crypto API: PBKDF2 密钥派生 + AES-GCM 加密
 */
import { PBKDF2_ITERATIONS } from '../shared/constants.js';

/**
 * 从密码派生加密密钥
 * @param {string} password - 用户密码
 * @param {Uint8Array} salt - 盐值
 * @returns {Promise<CryptoKey>} AES-GCM 密钥
 */
async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 加密数据
 * @param {string} data - 要加密的明文 JSON 字符串
 * @param {string} password - 加密密码
 * @returns {Promise<string>} Base64 编码的密文 (salt + iv + ciphertext)
 */
export async function encrypt(data, password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  // 组合: salt(16) + iv(12) + ciphertext
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * 解密数据
 * @param {string} encryptedBase64 - Base64 编码的密文
 * @param {string} password - 解密密码
 * @returns {Promise<string>} 解密后的明文
 * @throws {Error} 密码错误时抛出异常
 */
export async function decrypt(encryptedBase64, password) {
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);

  const key = await deriveKey(password, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    throw new Error('密码错误，解密失败');
  }
}
