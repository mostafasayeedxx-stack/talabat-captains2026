'use strict';
window.TH_CORE = (() => {
  const CANONICAL_ZONES = ['Rehab', 'Tagmoa North', 'Tagmoa South', 'Golden Square'];
  const ZONE_PATTERNS = {
    'Rehab': /rehab|الرحاب/i,
    'Tagmoa North': /north|شمال|tagam?mo[au]?\s*n|التجمع\s*الشمال|1st\s*settlement|التجمع\s*الاول|banafseg|بنفسج/i,
    'Tagmoa South': /south|جنوب|tagam?mo[au]?\s*s|التجمع\s*الجنوب|5th\s*settlement|التجمع\s*الشمال\s*لا|التجمع\s*الخامس|toya|تويا|auc/i,
    'Golden Square': /golden|جولدن|lotus|لوتس|square|سكوير/i
  };
  function resolveZoneName(rawZone, spId, zoneSps = {}) {
    const idStr = String(spId || '');
    if (idStr) for (const z of CANONICAL_ZONES) if ((zoneSps[z] || []).map(String).includes(idStr)) return z;
    const txt = String(rawZone || '').trim();
    if (CANONICAL_ZONES.includes(txt)) return txt;
    for (const z of CANONICAL_ZONES) if (ZONE_PATTERNS[z].test(txt)) return z;
    return '';
  }
  function classifyRider(hcRow, liveRider) {
    const r = hcRow || {}, statusStr = String(r.status || '').trim(), hybridCol = String(r.hybridFleet || '').trim(), martCol = String(r.hybridMartName || '').trim();
    const spJoined = Array.isArray(liveRider && liveRider.startingPoints) ? liveRider.startingPoints.map((x) => x.name || x).join(' ') : String((liveRider && liveRider.point) || '');
    const isYes = /^(yes|true|1|hybrid)$/i.test(hybridCol), hasMartHint = /hybrid|banafseg|toya\s*mall|tagm?moa\s*auc|golden\s*lotus/i.test(statusStr + ' ' + martCol);
    if (isYes || hasMartHint) {
      const m = statusStr.match(/(banafseg|toya\s*mall|tagm?moa\s*auc|golden\s*lotus)/i);
      const mart = martCol || (m ? m[1] : 'Hybrid Mart');
      return { kind: 'hybrid', martName: mart, badgeText: 'Hybrid - ' + mart };
    }
    const spMart = spJoined.match(/(banafseg|toya\s*mall|tagm?moa\s*auc|golden\s*lotus)/i);
    if (spMart && !/no/i.test(hybridCol)) return { kind: 'hybrid', martName: spMart[1], badgeText: 'Hybrid - ' + spMart[1] };
    return { kind: 'regular', martName: '', badgeText: 'عادي' };
  }
  function formatEgyPhone(raw) {
    let d = window.TH_IDB.digits(raw); if (!d) return '';
    if (d.startsWith('0020')) d = d.slice(4); else if (d.startsWith('20') && d.length >= 12) d = d.slice(2);
    if (d.length === 10 && d[0] === '1') d = '0' + d;
    return d;
  }
  function waUrlForPhone(raw, message) {
    const localPh = formatEgyPhone(raw); if (!localPh) return '';
    return `https://wa.me/${localPh.startsWith('2') ? localPh : '2' + localPh}?text=${encodeURIComponent(message)}`;
  }
  function buildDelayedWhatsAppText(o) {
    return `كود المندوب: ${o.courierId || '-'} | الاسم: ${o.riderName || '-'} | رقم الموبايل: ${formatEgyPhone(o.riderPhone) || '-'} | كود الأوردر: ${o.code || '-'} | المطعم: ${o.restaurant || '-'} | مدة التأخير: ${o.delayMin} د`;
  }
  function buildOneLineCopy(r) {
    return `${r.name || r.riderName || '-'} - ${r.id || r.courierId || '-'} - ${formatEgyPhone(r.phone || r.riderPhone) || '-'} - ${r.point || r.zone || '-'}`;
  }
  function buildNoShowWhatsAppLines(list) {
    return (list || []).map((r, idx) => `${idx + 1}. ${r.name || '-'} | كود: ${r.id} | موبايل: ${formatEgyPhone(r.phone) || '-'} | النقطة: ${r.point || r.zone || '-'}`).join('\n');
  }
  function extractSmartTokens(text) {
    const clean = window.TH_IDB.latin(text || '');
    return {
      orderCodes: [...new Set([...clean.matchAll(/(?:HF_EG\s*)?(\d{9,12})\b/gi)].map((m) => m[1]))],
      phones: [...new Set([...clean.matchAll(/(?:\+?20|0020|0)?(1[0125]\d{8})\b/g)].map((m) => '0' + m[1]))],
      riderIds: [...new Set([...clean.matchAll(/\b(\d{5,8})\b/g)].map((m) => m[1]))]
    };
  }
  function computeDelayMinutes(order) {
    const ref = Date.parse(order.promisedAt || '') || (Date.parse(order.placedAt || '') + 35 * 60000);
    return (!ref || isNaN(ref)) ? 0 : Math.max(0, Math.round((Date.now() - ref) / 60000));
  }
  function computeGpsStaleMinutes(lastPing) {
    if (!lastPing) return null;
    const ms = typeof lastPing === 'number' ? lastPing : Date.parse(lastPing);
    return (!ms || isNaN(ms)) ? null : Math.max(0, Math.round((Date.now() - ms) / 60000));
  }
  function computeDiscrepancies(roosterRiders, hcRows, authorizedZones, zoneSps) {
    const authSet = new Set(authorizedZones || CANONICAL_ZONES), hcMap = new Map();
    for (const h of hcRows || []) if (h && h.id) hcMap.set(String(h.id), h);
    const missingFromHc = [], classificationConflicts = [];
    for (const r of roosterRiders || []) {
      const z = r.zone || resolveZoneName(r.point, r.spId, zoneSps);
      if (z && !authSet.has(z)) continue;
      const hc = hcMap.get(String(r.id));
      if (!hc) { missingFromHc.push({ id: r.id, name: r.name, phone: formatEgyPhone(r.phone), zone: z || r.point || '-', flag: 'غير مسجل بالهيدكاونت' }); continue; }
      const clsSheet = classifyRider(hc, null), spText = Array.isArray(r.startingPoints) ? r.startingPoints.map((x) => x.name || x).join(' ') : String(r.point || '');
      const sysHybrid = /hybrid|banafseg|toya|auc|lotus/i.test(spText), sheetHybrid = clsSheet.kind === 'hybrid';
      if (sysHybrid !== sheetHybrid) classificationConflicts.push({ id: r.id, name: r.name || hc.name, zone: z || hc.zone || '-', sheetType: clsSheet.badgeText, sysType: sysHybrid ? 'Hybrid (SP)' : 'عادي (SP)', flag: 'تضارب تصنيف: شيت vs سيستم' });
    }
    return { missingFromHc, classificationConflicts };
  }
  function computeNoShow(hcRows, activeIdsSet, authorizedZones) {
    const authSet = new Set(authorizedZones || CANONICAL_ZONES), out = [];
    for (const h of hcRows || []) {
      if (!h || !h.id) continue;
      const z = resolveZoneName(h.zone, null, {});
      if (authSet.size && z && !authSet.has(z)) continue;
      if (/resign|terminat|left|inactive|offboard|suspend/i.test(String(h.status || '').toLowerCase())) continue;
      if (activeIdsSet.has(String(h.id))) continue;
      const cls = classifyRider(h, null);
      out.push({ id: String(h.id), name: h.name || '', phone: formatEgyPhone(h.phone), contractName: h.contractName || '', zone: z || h.zone || '', point: h.hybridMartName || h.zone || '', kind: cls.kind, martName: cls.martName, badgeText: cls.badgeText });
    }
    return out;
  }
  return { CANONICAL_ZONES, resolveZoneName, classifyRider, formatEgyPhone, waUrlForPhone, buildDelayedWhatsAppText, buildOneLineCopy, buildNoShowWhatsAppLines, extractSmartTokens, computeDelayMinutes, computeGpsStaleMinutes, computeDiscrepancies, computeNoShow };
})();