'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { esc, notify, copyText, renderWindowed, SVG_COPY, SVG_WA, SVG_AVATAR } = window.TH_UI;
  const Core = window.TH_CORE, Idb = window.TH_IDB, Net = window.TH_PWA_NET;
  const S = {
    lang: localStorage.getItem('pwa_lang') || 'ar', theme: localStorage.getItem('pwa_theme') || 'light', zone: localStorage.getItem('pwa_zone') || '',
    accessKey: localStorage.getItem('pwa_key') || '', bridgeUrl: localStorage.getItem('pwa_bridge_url') || '', bridgeSecret: localStorage.getItem('pwa_bridge_secret') || '',
    captainName: localStorage.getItem('pwa_captain') || 'Captain', meta: null, aesKey: null, riders: [], hcRows: [], orders: [], myRequests: [],
    packs: new Map(), photoUrls: new Map(), fastIndex: new Idb.FastIndex(), nsKind: 'all', nsSelected: new Set(), reqType: 'suspend', durKey: '24h', issueTag: 'تأخير استلام', proofWebp: ''
  };
  const tr = (k) => (window.TH_I18N[S.lang] || window.TH_I18N.ar)[k] || k;
  function applyI18n() {
    document.documentElement.lang = S.lang; document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
    document.body.classList.toggle('dark', S.theme === 'dark'); document.body.classList.toggle('light', S.theme !== 'dark');
    $$('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach((el) => { el.placeholder = tr(el.dataset.i18nPh); });
    $('#btnPwaLang').textContent = S.lang === 'ar' ? 'EN' : 'عربي';
  }
  function parseHashParams() {
    const h = (location.hash || '').replace(/^#/, ''); if (!h) return;
    const sp = new URLSearchParams(h);
    if (sp.get('k')) { S.accessKey = sp.get('k'); localStorage.setItem('pwa_key', S.accessKey); }
    if (sp.get('b')) { S.bridgeUrl = sp.get('b'); localStorage.setItem('pwa_bridge_url', S.bridgeUrl); }
    if (sp.get('s')) { S.bridgeSecret = sp.get('s'); localStorage.setItem('pwa_bridge_secret', S.bridgeSecret); }
  }
  function rebuildIndex() {
    const hcMap = new Map((S.hcRows || []).map((h) => [String(h.id), h])), unified = [], seen = new Set();
    for (const r of S.riders || []) {
      const id = String(r.i); seen.add(id); const hc = hcMap.get(id) || {}, point = (Array.isArray(r.s) && r.s[0]) || hc.hybridMartName || hc.zone || '';
      const zone = Core.resolveZoneName(hc.zone || point, '', {}), cls = Core.classifyRider(hc, { point });
      unified.push({ id, name: r.n || hc.name || '', phone: Core.formatEgyPhone(r.p || hc.phone), nid: r.d || hc.nid || '', plate: r.l || '', zone: zone || hc.zone || '', point: point || zone || '', contractName: hc.contractName || r.c || '', onShift: !!r.a, hasPhoto: !!r.h, kind: cls.kind, martName: cls.martName, badgeText: cls.badgeText });
    }
    for (const [id, hc] of hcMap.entries()) {
      if (seen.has(id)) continue; const zone = Core.resolveZoneName(hc.zone, '', {}), cls = Core.classifyRider(hc, null);
      unified.push({ id, name: hc.name || '', phone: Core.formatEgyPhone(hc.phone), nid: hc.nid || '', plate: '', zone: zone || hc.zone || '', point: hc.hybridMartName || hc.zone || '', contractName: hc.contractName || '', onShift: false, hasPhoto: false, kind: cls.kind, martName: cls.martName, badgeText: cls.badgeText });
    }
    S.fastIndex.setRiders(unified); S.fastIndex.setOrders(S.orders);
    Idb.txPutMany('riders', unified.slice(0, 3000)).catch(() => {}); Idb.txPutMany('orders', S.orders.slice(0, 1500)).catch(() => {});
  }
  async function loadVaultAndBridge() {
    try {
      const mr = await fetch('data/meta.json?t=' + Date.now(), { cache: 'no-store' });
      if (mr.ok) {
        S.meta = await mr.json(); if (S.meta.bridge && !S.bridgeUrl) S.bridgeUrl = S.meta.bridge;
        if (S.accessKey && S.meta.salt) {
          S.aesKey = await Net.deriveAesKey(S.accessKey, S.meta.salt, S.meta.iter || 150000);
          const [ab, rb, ob] = await Promise.all([fetch('data/auth.bin?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.ok ? r.arrayBuffer() : null), fetch('data/riders.bin?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.ok ? r.arrayBuffer() : null), fetch('data/orders.bin?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null)]);
          if (ab) { const auth = await Net.decryptJson(S.aesKey, ab); if (auth && auth.b && !S.bridgeSecret) S.bridgeSecret = auth.b; }
          if (rb) S.riders = (await Net.decryptJson(S.aesKey, rb)).r || [];
          if (ob) S.orders = (await Net.decryptJson(S.aesKey, ob)).o || [];
        }
      }
    } catch (_) {}
    if (S.bridgeUrl && S.bridgeSecret) {
      try { const hc = await Net.bridgeCall(S.bridgeUrl, S.bridgeSecret, { action: 'headcount' }); if (Array.isArray(hc.rows)) S.hcRows = hc.rows; } catch (_) {}
      await pollMyRequests(true);
    }
    rebuildIndex(); renderDelays(); renderNoShow();
  }
  async function hydratePwaPhotos(root) {
    if (!S.aesKey || !S.meta) return;
    for (const box of $$('.avatar-box[data-pid]', root)) {
      const id = box.dataset.pid;
      if (S.photoUrls.has(id)) { if (box.isConnected) box.innerHTML = `<img alt="" src="${S.photoUrls.get(id)}">`; continue; }
      const cached = await Idb.txGet('photos', id);
      if (cached && cached.dataUrl) { S.photoUrls.set(id, cached.dataUrl); if (box.isConnected) box.innerHTML = `<img alt="" src="${cached.dataUrl}">`; continue; }
      const b = Number(id) % (S.meta.buckets || 64);
      if (!S.packs.has(b)) S.packs.set(b, (async () => { try { const res = await fetch(`data/photos/p${b}.bin?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store' }); return res.ok ? Net.parsePhotoPack(await Net.decryptBytes(S.aesKey, await res.arrayBuffer())) : new Map(); } catch (_) { return new Map(); } })());
      const bytes = (await S.packs.get(b)).get(String(id));
      if (bytes) { const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })); S.photoUrls.set(id, url); if (box.isConnected) box.innerHTML = `<img alt="" src="${url}">`; }
    }
  }
  window.TH_ON_BATCH = (root) => { hydratePwaPhotos(root); };
  async function liveBridgeLookup(code) {
    if (!S.bridgeUrl || !S.bridgeSecret) return null;
    try {
      let res = await Net.bridgeCall(S.bridgeUrl, S.bridgeSecret, { action: 'request', code });
      for (let i = 0; i < 9 && res.status !== 'ready'; i++) { await new Promise((r) => setTimeout(r, 1800)); res = await Net.bridgeCall(S.bridgeUrl, S.bridgeSecret, { action: 'result', code }); }
      if (res.status !== 'ready' || !res.data) return null;
      return S.aesKey ? await Net.decryptJson(S.aesKey, Uint8Array.from(atob(res.data), (c) => c.charCodeAt(0)).buffer) : JSON.parse(res.data);
    } catch (_) { return null; }
  }
  function renderRiderCardHtml(r) {
    const oneLine = Core.buildOneLineCopy(r), waHref = Core.waUrlForPhone(r.phone, `مرحبا ${r.name || ''}`);
    return `<div class="card"><div class="rider-flex"><div class="avatar-box" ${r.hasPhoto ? `data-pid="${esc(r.id)}"` : ''}>${SVG_AVATAR}</div><div class="rider-meta"><div class="card-head"><h4 class="card-title">${esc(r.name || '-')}</h4><span class="badge ${r.kind === 'hybrid' ? 'plum' : 'ok'}">${esc(r.badgeText || 'عادي')}</span></div><div class="row" style="margin-top:2px"><span class="badge">ID ${esc(r.id)}</span><span class="badge ltr">${esc(r.phone || '-')}</span><span class="badge">${esc(r.point || r.zone || '-')}</span></div><div class="hint" style="margin-top:4px">NID: <span class="ltr">${esc(r.nid || '-')}</span> | Plate: ${esc(r.plate || '-')}</div></div></div><div class="row"><button type="button" class="btn sm ghost" data-cp="${esc(oneLine)}">${SVG_COPY} <span>${esc(tr('copyLine'))}</span></button>${waHref ? `<a class="btn sm ok" href="${esc(waHref)}" target="_blank" rel="noopener">${SVG_WA} <span>${esc(tr('whatsapp'))}</span></a>` : ''}<button type="button" class="btn sm plum" data-reqfor="${esc(r.id)}" data-reqname="${esc(r.name || '')}">Submit Request</button></div></div>`;
  }
  async function runPwaSearch() {
    const q = ($('#pwaSearchIn').value || '').trim(), out = $('#pwaSearchOut'); if (!q) { out.innerHTML = ''; return; }
    const activeZone = S.zone, riders = S.fastIndex.searchRiders(q, 60).filter((r) => !activeZone || !r.zone || r.zone === activeZone), orderHit = S.fastIndex.searchOrder(q);
    if (orderHit) { renderWindowed(out, (orderHit.r || []).map((x) => S.fastIndex.byId.get(String(x.i)) || { id: String(x.i || ''), name: x.n || '', phone: x.p || '', point: activeZone }), renderRiderCardHtml, ''); return; }
    if (riders.length) { renderWindowed(out, riders, renderRiderCardHtml, ''); return; }
    const cleanNum = Idb.latin(q).replace(/^HF_EG/i, '').replace(/\D/g, '');
    if (cleanNum.length >= 5 && S.bridgeUrl && S.bridgeSecret) {
      out.innerHTML = '<div class="card hint">Searching live system...</div>';
      const live = await liveBridgeLookup(cleanNum.length >= 9 ? cleanNum : 'R:' + cleanNum);
      if (live && live.r && !live.nf) {
        const r = { id: String(live.r.i || cleanNum), name: live.r.n || '', phone: Core.formatEgyPhone(live.r.p), nid: live.r.d || '', plate: live.r.l || '', zone: Core.resolveZoneName((live.r.s && live.r.s[0]) || '', '', {}), point: (live.r.s && live.r.s[0]) || '', onShift: !!live.r.a, hasPhoto: false, kind: 'regular', badgeText: 'عادي' };
        S.fastIndex.upsertRiders([r]); renderWindowed(out, [r], renderRiderCardHtml, ''); return;
      }
      if (live && live.o && !live.nf) {
        S.orders.unshift(live.o); S.fastIndex.setOrders(S.orders);
        renderWindowed(out, (live.o.r || []).map((x) => S.fastIndex.byId.get(String(x.i)) || { id: String(x.i || ''), name: x.n || '', phone: x.p || '', point: activeZone }), renderRiderCardHtml, ''); return;
      }
    }
    out.innerHTML = '<div class="card hint">No matching rider or order found in current zone.</div>';
  }
  function renderDelays() {
    const activeZone = S.zone;
    const delayed = (S.orders || []).map((o) => {
      const firstR = (o.r && o.r[0]) || {}, rInfo = S.fastIndex.byId.get(String(firstR.i)) || {}, zone = rInfo.zone || '';
      return { code: o.c, status: o.s || '', restaurant: o.rest || '', courierId: String(firstR.i || ''), riderName: rInfo.name || firstR.n || '', riderPhone: Core.formatEgyPhone(rInfo.phone || firstR.p), point: rInfo.point || zone || '', zone, badgeText: rInfo.badgeText || 'عادي', kind: rInfo.kind || 'regular', delayMin: Core.computeDelayMinutes({ placedAt: o.t }), staleMin: Core.computeGpsStaleMinutes(o.lastPingAt) };
    }).filter((o) => !activeZone || !o.zone || o.zone === activeZone);
    $('#pCntDelays').textContent = delayed.length;
    renderWindowed($('#pwaDelaysOut'), delayed, (o) => {
      const gpsWarn = o.staleMin != null && o.staleMin > 10 ? `<span class="badge bad">${esc(tr('gpsWarnPrefix'))} ${o.staleMin} ${esc(tr('minSuffix'))}</span>` : '';
      const oneLine = Core.buildOneLineCopy(o), waHref = Core.waUrlForPhone(o.riderPhone, Core.buildDelayedWhatsAppText(o));
      return `<div class="card"><div class="card-head"><div class="row" style="margin-top:0"><span class="badge orange">#${esc(o.code)}</span><span class="badge warn">${o.delayMin} min</span>${gpsWarn}<span class="badge ${o.kind === 'hybrid' ? 'plum' : ''}">${esc(o.badgeText)}</span></div><span class="hint">${esc(o.point || o.zone)}</span></div><div><b>${esc(o.riderName || '-')}</b> (ID: <span class="ltr">${esc(o.courierId || '-')}</span>) · <span class="ltr">${esc(o.riderPhone || '-')}</span></div><div class="hint">${esc(o.restaurant || '-')} · ${esc(o.status)}</div><div class="row"><button type="button" class="btn sm ghost" data-cp="${esc(oneLine)}">${SVG_COPY} <span>${esc(tr('copyLine'))}</span></button>${waHref ? `<a class="btn sm ok" href="${esc(waHref)}" target="_blank" rel="noopener">${SVG_WA} <span>${esc(tr('whatsapp'))}</span></a>` : ''}</div></div>`;
    }, '<div class="card hint">No delayed orders in your active zone.</div>');
  }
  function getFilteredNoShow() {
    const activeIds = new Set(S.fastIndex.list.filter((r) => r.onShift).map((r) => r.id)), all = Core.computeNoShow(S.hcRows, activeIds, S.zone ? [S.zone] : Core.CANONICAL_ZONES);
    const martSel = $('#pwaMartFilter').value, contractSel = $('#pwaContractFilter').value;
    const marts = [...new Set(all.filter((x) => x.kind === 'hybrid' && x.martName).map((x) => x.martName))].sort(), contracts = [...new Set(all.map((x) => x.contractName).filter(Boolean))].sort();
    $('#pwaMartFilter').hidden = S.nsKind !== 'hybrid';
    $('#pwaMartFilter').innerHTML = '<option value="">All Marts</option>' + marts.map((m) => `<option value="${esc(m)}" ${m === martSel ? 'selected' : ''}>${esc(m)}</option>`).join('');
    $('#pwaContractFilter').innerHTML = '<option value="">All Contracts / Agencies</option>' + contracts.map((c) => `<option value="${esc(c)}" ${c === contractSel ? 'selected' : ''}>${esc(c)}</option>`).join('');
    return { totalCount: all.length, items: all.filter((x) => (S.nsKind !== 'regular' || x.kind === 'regular') && (S.nsKind !== 'hybrid' || x.kind === 'hybrid') && (S.nsKind !== 'hybrid' || !martSel || x.martName === martSel) && (!contractSel || x.contractName === contractSel)) };
  }
  function renderNoShow() {
    $$('#pwaNsTabs button').forEach((b) => b.classList.toggle('on', b.dataset.pnskind === S.nsKind));
    const { totalCount, items } = getFilteredNoShow(); $('#pCntNoshow').textContent = totalCount;
    renderWindowed($('#pwaNoshowOut'), items, (r) => `<div class="noshow-row"><input type="checkbox" data-pnschk="${esc(r.id)}" ${S.nsSelected.has(r.id) ? 'checked' : ''}><span style="flex:1"><b>${esc(r.name)}</b> | ID: <span class="ltr">${esc(r.id)}</span> | <span class="ltr">${esc(r.phone || '-')}</span> | ${esc(r.point || r.zone)}</span><span class="badge ${r.kind === 'hybrid' ? 'plum' : ''}">${esc(r.badgeText)}</span></div>`, '<div class="hint" style="padding:8px">No absent riders in current zone.</div>', 60);
  }
  async function pollMyRequests(silent = false) {
    if (!S.bridgeUrl || !S.bridgeSecret) return;
    try {
      const prevMap = new Map(S.myRequests.map((x) => [x.id, x.status])), res = await Net.bridgeCall(S.bridgeUrl, S.bridgeSecret, { action: 'list_requests', captainName: S.captainName });
      S.myRequests = Array.isArray(res.requests) ? res.requests : [];
      if (!silent) for (const r of S.myRequests) { const oldSt = prevMap.get(r.id); if (oldSt && oldSt !== r.status) notify(`Request ${r.status}`, `${r.riderName || r.riderId} (${r.type})`, r.status === 'Approved' ? 'ok' : 'bad', true); }
      renderMyRequests();
    } catch (_) {}
  }
  function renderMyRequests() {
    const list = S.myRequests || [];
    $('#mrPend').textContent = list.filter((x) => x.status === 'Pending').length; $('#mrApp').textContent = list.filter((x) => x.status === 'Approved').length;
    $('#mrRej').textContent = list.filter((x) => x.status === 'Rejected').length; $('#pCntMyReq').textContent = list.length;
    renderWindowed($('#myReqOut'), list, (r) => `<div class="card"><div class="card-head"><b>${esc(r.riderName || '-')} (ID: ${esc(r.riderId)})</b><span class="badge ${r.status === 'Approved' ? 'ok' : r.status === 'Rejected' ? 'bad' : 'warn'}">${esc(r.status)}</span></div><div class="hint">${esc(r.type)} · ${esc(r.zone)}${r.durationKey ? ' · ' + esc(r.durationKey) : ''}${r.issueTag ? ' · ' + esc(r.issueTag) : ''}</div>${r.coordinatorNote ? `<div class="hint">Coordinator Note: ${esc(r.coordinatorNote)}</div>` : ''}</div>`, '<div class="card hint">No submitted requests yet.</div>');
  }
  function switchTab(tab) { $$('#pwaNav button').forEach((b) => b.classList.toggle('on', b.dataset.ptab === tab)); $$('.view').forEach((v) => v.classList.toggle('on', v.id === 'pview-' + tab)); }
  function enterApp() {
    $('#gateScreen').hidden = true; $('#appShell').hidden = false;
    if (!S.zone) $('#zoneStartCard').hidden = false; else { $('#zoneStartCard').hidden = true; $('#hdrZoneSwitch').value = S.zone; }
    loadVaultAndBridge(); setInterval(() => pollMyRequests(false), 15000);
  }
  document.addEventListener('click', (e) => {
    const nt = e.target.closest('#pwaNav button'); if (nt) return switchTab(nt.dataset.ptab);
    const zpick = e.target.closest('[data-zpick]'); if (zpick) { S.zone = zpick.dataset.zpick; localStorage.setItem('pwa_zone', S.zone); $('#hdrZoneSwitch').value = S.zone; $('#zoneStartCard').hidden = true; renderDelays(); renderNoShow(); notify('Shift Zone', S.zone, 'ok', false); return; }
    const cp = e.target.closest('[data-cp]'); if (cp) return copyText(cp.dataset.cp, 'Copied Line');
    const rf = e.target.closest('[data-reqfor]'); if (rf) { switchTab('submit'); $('#reqRiderId').value = rf.dataset.reqfor; $('#reqRiderName').value = rf.dataset.reqname || ''; return; }
    const pns = e.target.closest('#pwaNsTabs button'); if (pns) { S.nsKind = pns.dataset.pnskind; S.nsSelected.clear(); return renderNoShow(); }
    const rtype = e.target.closest('#reqTypeTabs button'); if (rtype) { S.reqType = rtype.dataset.reqtype; $$('#reqTypeTabs button').forEach((b) => b.classList.toggle('on', b === rtype)); $('#suspFields').hidden = S.reqType !== 'suspend'; $('#pwFields').hidden = S.reqType !== 'password'; return; }
    const dt = e.target.closest('#durTags button'); if (dt) { S.durKey = dt.dataset.dur; $$('#durTags button').forEach((b) => b.classList.toggle('on', b === dt)); return; }
    const it = e.target.closest('#issueTags button'); if (it) { S.issueTag = it.dataset.tag; $$('#issueTags button').forEach((b) => b.classList.toggle('on', b === it)); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.pnschk) { if (t.checked) S.nsSelected.add(t.dataset.pnschk); else S.nsSelected.delete(t.dataset.pnschk); }
    else if (t.id === 'pwaNsSelAll') { getFilteredNoShow().items.forEach((r) => { if (t.checked) S.nsSelected.add(r.id); else S.nsSelected.delete(r.id); }); renderNoShow(); }
    else if (t.id === 'pwaMartFilter' || t.id === 'pwaContractFilter') renderNoShow();
  });
  $('#hdrZoneSwitch').onchange = (e) => { S.zone = e.target.value; localStorage.setItem('pwa_zone', S.zone); renderDelays(); renderNoShow(); runPwaSearch(); };
  $('#btnPwaLang').onclick = () => { S.lang = S.lang === 'ar' ? 'en' : 'ar'; localStorage.setItem('pwa_lang', S.lang); applyI18n(); renderDelays(); };
  $('#btnPwaTheme').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('pwa_theme', S.theme); applyI18n(); };
  $('#btnPwaSync').onclick = () => { loadVaultAndBridge(); notify('Synced', 'Data refreshed', 'ok', false); };
  $('#btnPwaSearch').onclick = runPwaSearch; $('#pwaSearchIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') runPwaSearch(); });
  $('#btnPwaCopyNs').onclick = () => { const { items } = getFilteredNoShow(), chosen = S.nsSelected.size ? items.filter((x) => S.nsSelected.has(x.id)) : items; if (!chosen.length) return notify('No-Show', 'No riders selected', 'warn', false); copyText(Core.buildNoShowWhatsAppLines(chosen), 'Copied for WhatsApp Group'); };
  $('#reqProofFile').onchange = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try { const { dataUrl, bytes } = await Net.compressImageToWebp80KB(file); S.proofWebp = dataUrl; $('#proofPreviewImg').src = dataUrl; $('#proofSizeBadge').textContent = `WebP: ${(bytes / 1024).toFixed(1)} KB`; $('#proofPreviewBox').hidden = false; }
    catch (err) { notify('Image Error', err.message, 'bad', false); }
  };
  $('#btnSubmitReq').onclick = async () => {
    if (!S.zone) return notify('Zone Required', 'Select shift zone first', 'bad', false);
    if (!S.bridgeUrl || !S.bridgeSecret) return notify('Bridge Required', 'Bridge settings missing', 'bad', false);
    const riderId = Idb.digits($('#reqRiderId').value); if (!riderId) return notify('Validation', 'Enter Rider ID', 'bad', false);
    const rInfo = S.fastIndex.byId.get(riderId) || {};
    try {
      await Net.bridgeCall(S.bridgeUrl, S.bridgeSecret, { action: 'submit_request' }, {
        action: 'submit_request', secret: S.bridgeSecret, type: S.reqType, zone: S.zone, riderId,
        riderName: $('#reqRiderName').value.trim() || rInfo.name || '', riderPhone: rInfo.phone || '',
        durationKey: S.reqType === 'suspend' ? S.durKey : '', issueTag: S.reqType === 'suspend' ? S.issueTag : '',
        note: $('#reqCustomNote').value.trim(), newPassword: S.reqType === 'password' ? $('#reqNewPw').value.trim() : '',
        proofWebp: S.reqType === 'suspend' ? S.proofWebp : '', captainName: S.captainName
      });
      S.proofWebp = ''; $('#proofPreviewBox').hidden = true; $('#reqCustomNote').value = '';
      notify('Submitted', 'Request sent to Coordinator', 'ok', true); await pollMyRequests(true); switchTab('myreq');
    } catch (err) { notify('Submit Error', err.message, 'bad', false); }
  };
  $('#btnRefreshMyReq').onclick = () => pollMyRequests(false);
  $('#btnUnlockHub').onclick = () => {
    S.accessKey = $('#inAccessKey').value.trim(); S.bridgeUrl = $('#inBridgeUrl').value.trim(); S.bridgeSecret = $('#inBridgeSecret').value.trim(); S.captainName = $('#inCaptainId').value.trim() || 'Captain';
    if (S.accessKey) localStorage.setItem('pwa_key', S.accessKey); if (S.bridgeUrl) localStorage.setItem('pwa_bridge_url', S.bridgeUrl); if (S.bridgeSecret) localStorage.setItem('pwa_bridge_secret', S.bridgeSecret);
    localStorage.setItem('pwa_captain', S.captainName); enterApp();
  };
  async function boot() {
    applyI18n(); parseHashParams();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
    const [rCache, oCache] = await Promise.all([Idb.txGetAll('riders').catch(() => []), Idb.txGetAll('orders').catch(() => [])]);
    if (rCache.length) S.fastIndex.setRiders(rCache); if (oCache.length) S.fastIndex.setOrders(oCache);
    $('#inAccessKey').value = S.accessKey; $('#inBridgeUrl').value = S.bridgeUrl; $('#inBridgeSecret').value = S.bridgeSecret; $('#inCaptainId').value = S.captainName;
    if (S.accessKey || (S.bridgeUrl && S.bridgeSecret)) enterApp();
  }
  boot();
})();