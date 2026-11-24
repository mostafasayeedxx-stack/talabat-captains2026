'use strict';
window.TH_PWA_NET = (() => {
  const dec = new TextDecoder(), b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function deriveAesKey(accessKey, saltB64, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(accessKey), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64(saltB64), iterations: iter || 150000, hash: 'SHA-256' }, base, 512));
    return crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['decrypt']);
  }
  async function decryptBytes(key, buf) { const u = new Uint8Array(buf); if (u.length < 29) throw new Error('Invalid file'); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12))); }
  async function gunzip(u8) { const ds = new DecompressionStream('gzip'), w = ds.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
  async function decryptJson(key, buf) { return JSON.parse(dec.decode(await gunzip(await decryptBytes(key, buf)))); }
  function parsePhotoPack(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), map = new Map(); let o = 0; const n = dv.getUint32(o); o += 4;
    for (let k = 0; k < n; k++) { const id = dv.getUint32(o); o += 4; const len = dv.getUint32(o); o += 4; map.set(String(id), u8.subarray(o, o + len)); o += len; }
    return map;
  }
  async function bridgeCall(bridgeUrl, secret, params, body) {
    if (!bridgeUrl || !secret) throw new Error('Bridge not configured');
    const u = new URL(bridgeUrl); Object.entries({ ...params, secret }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u.toString(), body ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store' } : { cache: 'no-store' });
    if (!r.ok) throw new Error('Bridge HTTP ' + r.status);
    const j = await r.json(); if (!j || j.ok === false) throw new Error((j && j.error) || 'Bridge error');
    return j;
  }
  async function compressImageToWebp80KB(file) {
    const bmp = await createImageBitmap(file); let maxDim = 960;
    for (let pass = 0; pass < 4; pass++) {
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(bmp.width * scale)); cv.height = Math.max(1, Math.round(bmp.height * scale));
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      for (const q of [0.76, 0.62, 0.48, 0.36, 0.26]) {
        const blob = await new Promise((res) => cv.toBlob(res, 'image/webp', q));
        if (blob && blob.size <= 80000) {
          const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
          if (bmp.close) bmp.close(); return { dataUrl, bytes: blob.size };
        }
      }
      maxDim = Math.round(maxDim * 0.72);
    }
    if (bmp.close) bmp.close();
    throw new Error('Could not compress image under 80KB');
  }
  return { deriveAesKey, decryptBytes, decryptJson, parsePhotoPack, bridgeCall, compressImageToWebp80KB };
})();