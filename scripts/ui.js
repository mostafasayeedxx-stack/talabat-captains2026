'use strict';
window.TH_UI = (() => {
  const SVG_LOGO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9.5 4.5V16.8M5 16.8H19M9.5 13.5C11.2 10.8 14 9.5 16.2 10.6C18.2 11.6 18.8 14.3 18.5 16.8" stroke="#FFFFFF" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SVG_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const SVG_WA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  const SVG_AVATAR = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/></svg>';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)(), now = ctx.currentTime;
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0.05, now + i * 0.09); gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.22);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(now + i * 0.09); osc.stop(now + i * 0.09 + 0.24);
      });
    } catch (_) {}
  }
  function notify(title, msg, level = 'info', sound = false) {
    const host = document.getElementById('appleToastHost'); if (!host) return;
    const card = document.createElement('div'); card.className = 'apple-toast ' + level;
    card.innerHTML = `<div class="t-icon">${SVG_LOGO}</div><div class="t-body"><div class="t-title">${esc(title)}</div><div class="t-msg">${esc(msg)}</div></div>`;
    host.prepend(card); while (host.children.length > 4) host.lastElementChild.remove();
    if (sound) playChime();
    setTimeout(() => { if (card.isConnected) card.remove(); }, 4200);
  }
  async function copyText(str, label = 'Copied') {
    try { await navigator.clipboard.writeText(str); }
    catch (_) { const ta = document.createElement('textarea'); ta.value = str; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    notify(label, str.slice(0, 75), 'ok', false);
  }
  function renderWindowed(container, items, renderItem, emptyHtml, pageSize = 60) {
    container.innerHTML = '';
    if (!items || !items.length) { container.innerHTML = emptyHtml || '<div class="card hint">No items found.</div>'; return; }
    let rendered = 0;
    const listWrap = document.createElement('div'); container.appendChild(listWrap);
    const moreBtn = document.createElement('button'); moreBtn.type = 'button'; moreBtn.className = 'btn ghost sm'; moreBtn.style.width = '100%'; moreBtn.hidden = true; container.appendChild(moreBtn);
    function appendBatch() {
      const slice = items.slice(rendered, rendered + pageSize); if (!slice.length) { moreBtn.hidden = true; return; }
      const frag = document.createDocumentFragment(), tmp = document.createElement('div'); tmp.innerHTML = slice.map(renderItem).join('');
      while (tmp.firstElementChild) frag.appendChild(tmp.firstElementChild);
      listWrap.appendChild(frag); rendered += slice.length;
      if (rendered < items.length) { moreBtn.hidden = false; moreBtn.textContent = `+ Load More (${rendered} / ${items.length})`; } else moreBtn.hidden = true;
      if (typeof window.TH_ON_BATCH === 'function') window.TH_ON_BATCH(listWrap);
    }
    moreBtn.addEventListener('click', appendBatch);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting) && rendered < items.length) appendBatch(); }, { rootMargin: '240px' });
      io.observe(moreBtn);
    }
    appendBatch();
  }
  async function toWebpThumb(dataUrl, maxW = 140, maxH = 170) {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * scale)); cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/webp', 0.72);
  }
  return { SVG_LOGO, SVG_COPY, SVG_WA, SVG_AVATAR, esc, notify, copyText, renderWindowed, toWebpThumb };
})();