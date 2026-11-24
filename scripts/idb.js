'use strict';
window.TH_IDB = (() => {
  const DB_NAME = 'TalabatOpsHubV2DB', DB_VER = 1;
  let dbPromise = null;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('riders')) db.createObjectStore('riders', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('orders')) db.createObjectStore('orders', { keyPath: 'code' });
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbPromise;
  }
  async function txPutMany(storeName, items) {
    if (!items || !items.length) return;
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction(storeName, 'readwrite'), st = tx.objectStore(storeName);
      for (const it of items) st.put(it);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }
  async function txGetAll(storeName) {
    const db = await open();
    return new Promise((res, rej) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error);
    });
  }
  async function txGet(storeName, key) {
    const db = await open();
    return new Promise((res) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      req.onsuccess = () => res(req.result || null); req.onerror = () => res(null);
    });
  }
  async function txPut(storeName, obj) {
    const db = await open();
    return new Promise((res) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(obj);
      tx.oncomplete = () => res(true); tx.onerror = () => res(false);
    });
  }
  const AR_D = '٠١٢٣٤٥٦٧٨٩', FA_D = '۰۱۲۳۴۵۶۷۸۹';
  const latin = (s) => String(s == null ? '' : s).replace(/[٠-٩]/g, (d) => AR_D.indexOf(d)).replace(/[۰-۹]/g, (d) => FA_D.indexOf(d));
  const normText = (s) => latin(s).toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  const digits = (s) => latin(s).replace(/\D/g, '');
  const phoneCore = (p) => { const d = digits(p); return !d ? '' : (d.length > 10 ? d.slice(-10) : d.replace(/^0/, '')); };
  const normPlate = (p) => normText(p).replace(/[\s\-_.\/\\|،,]/g, '');

  class FastIndex {
    constructor() { this.byId = new Map(); this.byPhone = new Map(); this.byPlate = new Map(); this.list = []; this.ordersByCode = new Map(); }
    setRiders(riders) {
      this.byId.clear(); this.byPhone.clear(); this.byPlate.clear(); this.list = [];
      for (const r of riders || []) {
        if (!r || !r.id) continue;
        const id = String(r.id), rec = { ...r, id, _n: normText(r.name), _ph: phoneCore(r.phone), _pl: normPlate(r.plate), _nid: digits(r.nid) };
        this.byId.set(id, rec);
        if (rec._ph) { if (!this.byPhone.has(rec._ph)) this.byPhone.set(rec._ph, []); this.byPhone.get(rec._ph).push(rec); }
        if (rec._pl) { if (!this.byPlate.has(rec._pl)) this.byPlate.set(rec._pl, []); this.byPlate.get(rec._pl).push(rec); }
        this.list.push(rec);
      }
    }
    upsertRiders(riders) {
      for (const r of riders || []) {
        if (!r || !r.id) continue;
        const id = String(r.id), merged = { ...(this.byId.get(id) || {}), ...r, id };
        merged._n = normText(merged.name); merged._ph = phoneCore(merged.phone); merged._pl = normPlate(merged.plate); merged._nid = digits(merged.nid);
        this.byId.set(id, merged);
        if (merged._ph) { const a = this.byPhone.get(merged._ph) || []; if (!a.some((x) => x.id === id)) a.push(merged); this.byPhone.set(merged._ph, a); }
        if (merged._pl) { const a = this.byPlate.get(merged._pl) || []; if (!a.some((x) => x.id === id)) a.push(merged); this.byPlate.set(merged._pl, a); }
      }
      this.list = [...this.byId.values()];
    }
    setOrders(orders) { this.ordersByCode.clear(); for (const o of orders || []) if (o && o.code) this.ordersByCode.set(String(o.code), o); }
    searchRiders(rawQuery, limit = 60) {
      const q = String(rawQuery || '').trim(); if (!q) return [];
      const flat = latin(q).replace(/[\s\-_.\/\\|،,]/g, ''), out = [], seen = new Set();
      const push = (r) => { if (r && !seen.has(r.id) && out.length < limit) { seen.add(r.id); out.push(r); } };
      if (/^\+?\d+$/.test(flat)) {
        const d = flat.replace(/^\+/, '');
        if (this.byId.has(d)) push(this.byId.get(d));
        const pc = phoneCore(d); if (pc.length >= 9 && this.byPhone.has(pc)) this.byPhone.get(pc).forEach(push);
        if (out.length) return out;
        for (const r of this.list) { if (out.length >= limit) break; if (r.id.includes(d) || r._ph.includes(d) || r._nid.includes(d) || r._pl.includes(d)) push(r); }
        return out;
      }
      const pl = normPlate(q); if (this.byPlate.has(pl)) this.byPlate.get(pl).forEach(push);
      const toks = normText(q).split(' ').filter(Boolean);
      if (toks.length) for (const r of this.list) { if (out.length >= limit) break; if (toks.every((tk) => r._n.includes(tk)) || (pl && r._pl.includes(pl))) push(r); }
      return out;
    }
    searchOrder(rawCode) {
      const c = latin(rawCode).replace(/^HF_EG/i, '').replace(/\D/g, '');
      return c ? (this.ordersByCode.get(c) || null) : null;
    }
  }
  return { open, txPutMany, txGetAll, txGet, txPut, latin, normText, digits, phoneCore, FastIndex };
})();