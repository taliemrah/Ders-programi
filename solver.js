/* Ders programı çözücüsü — tavlama benzetimi (simulated annealing).
 * Hem Web Worker olarak hem de Node'da test için çalışır.
 *
 * Girdi:
 *  days:     [{ slots: [{ block: 'sabah'|..|null, types: ['mezun','lise','ilk'] }] }]
 *  teachers: [{ dayCount, days: [dayIdx], blocked: ['d|s'] }]
 *  groups:   [{ type }]
 *  items:    [{ lesson, t, g, subj, maxPerDay, fixed: [d,s]|null }]   (her biri 1 ders saati)
 *  weights:  ceza ağırlıkları
 */
(function () {
  const DEFAULT_W = {
    unplaced: 5000, // yerleşemeyen ders saati
    over: 800,      // öğretmenin gün sayısını aşması
    tGap: 12,       // öğretmen vardiya içi boş saat (pencere)
    gGap: 8,        // grup vardiya içi boş saat
    single: 14,     // öğretmenin bir güne tek ders için gelmesi
    tLate: 5,       // öğretmenin vardiyaya geç başlaması (saat başına)
    gLate: 2,
    day: 4,         // öğretmenin kullandığı her gün
    maxDay: 40,     // bir grubun aynı dersi günde sınırı aşması
    split: 10,      // aynı dersin aynı gün bölünmesi (arka arkaya değil)
  };

  function solve(input, onProgress) {
    const W = Object.assign({}, DEFAULT_W, input.weights || {});
    const days = input.days, teachers = input.teachers, groups = input.groups, items = input.items;
    const ND = days.length, NT = teachers.length, NG = groups.length, NI = items.length;
    const SMAX = Math.max(1, ...days.map((d) => d.slots.length));

    // Vardiya (blok) yapısı: her gün için blok listesi, her blokta sıralı slot indeksleri
    const blocks = days.map((day) => {
      const map = new Map();
      day.slots.forEach((sl, s) => {
        if (!sl.block || !sl.types || sl.types.length === 0) return;
        if (!map.has(sl.block)) map.set(sl.block, []);
        map.get(sl.block).push(s);
      });
      return [...map.values()];
    });
    // slotun blok içi sırası (bitişiklik kontrolü için)
    const slotBlock = days.map((day, d) => {
      const arr = new Array(day.slots.length).fill(-1);
      const pos = new Array(day.slots.length).fill(-1);
      blocks[d].forEach((b, bi) => b.forEach((s, k) => { arr[s] = bi; pos[s] = k; }));
      return { arr, pos };
    });

    // Doluluk tabloları
    const occT = [], occG = [];
    for (let t = 0; t < NT; t++) { occT.push([]); for (let d = 0; d < ND; d++) occT[t].push(new Int32Array(SMAX).fill(-1)); }
    for (let g = 0; g < NG; g++) { occG.push([]); for (let d = 0; d < ND; d++) occG[g].push(new Int32Array(SMAX).fill(-1)); }
    const posD = new Int32Array(NI).fill(-1), posS = new Int32Array(NI).fill(-1);

    // İzinli konumlar
    const allowed = items.map((it) => {
      const T = teachers[it.t], G = groups[it.g];
      const daySet = new Set(T.days);
      const blocked = new Set(T.blocked || []);
      const gBlocked = new Set(G.blocked || []);
      const out = [];
      for (let d = 0; d < ND; d++) {
        if (!daySet.has(d)) continue;
        days[d].slots.forEach((sl, s) => {
          if (!sl.types || !sl.types.includes(G.type)) return;
          if (blocked.has(d + '|' + s) || gBlocked.has(d + '|' + s)) return;
          out.push(d * SMAX + s);
        });
      }
      return out;
    });
    const allowedSet = allowed.map((a) => new Set(a));

    // Yerleşemeyenler listesi
    const unplaced = [];
    const uIdx = new Int32Array(NI).fill(-1);
    function addU(i) { uIdx[i] = unplaced.length; unplaced.push(i); }
    function remU(i) { const k = uIdx[i]; const last = unplaced.pop(); if (last !== i) { unplaced[k] = last; uIdx[last] = k; } uIdx[i] = -1; }

    function setPos(i, d, s) {
      const it = items[i];
      if (posD[i] >= 0) { occT[it.t][posD[i]][posS[i]] = -1; occG[it.g][posD[i]][posS[i]] = -1; }
      else if (uIdx[i] >= 0) remU(i);
      posD[i] = d; posS[i] = s;
      if (d >= 0) { occT[it.t][d][s] = i; occG[it.g][d][s] = i; }
      else addU(i);
    }

    // --- Maliyet bileşenleri ---
    function teacherDay(t, d) {
      const occ = occT[t][d]; let total = 0, n = 0;
      const bl = blocks[d];
      for (let b = 0; b < bl.length; b++) {
        const sl = bl[b]; let first = -1, last = -1, cnt = 0;
        for (let k = 0; k < sl.length; k++) if (occ[sl[k]] >= 0) { if (first < 0) first = k; last = k; cnt++; }
        if (cnt) { total += (last - first + 1 - cnt) * W.tGap + first * W.tLate; n += cnt; }
      }
      if (n === 1) total += W.single;
      return total;
    }
    function teacherGlobal(t) {
      let u = 0;
      for (let d = 0; d < ND; d++) { const occ = occT[t][d]; for (let s = 0; s < SMAX; s++) if (occ[s] >= 0) { u++; break; } }
      return u * W.day + Math.max(0, u - teachers[t].dayCount) * W.over;
    }
    function groupDay(g, d) {
      const occ = occG[g][d]; let total = 0;
      const bl = blocks[d];
      for (let b = 0; b < bl.length; b++) {
        const sl = bl[b]; let first = -1, last = -1, cnt = 0;
        for (let k = 0; k < sl.length; k++) if (occ[sl[k]] >= 0) { if (first < 0) first = k; last = k; cnt++; }
        if (cnt) total += (last - first + 1 - cnt) * W.gGap + first * W.gLate;
      }
      // Ders bazında: günlük sınır ve bölünme
      const seen = {};
      const nS = days[d].slots.length;
      for (let s = 0; s < nS; s++) {
        const i = occ[s]; if (i < 0) continue;
        const sj = items[i].subj; let e = seen[sj];
        if (!e) { e = seen[sj] = { c: 0, max: items[i].maxPerDay, b: slotBlock[d].arr[s], f: slotBlock[d].pos[s], l: 0, mixed: false }; }
        if (slotBlock[d].arr[s] !== e.b) e.mixed = true;
        e.c++; e.l = slotBlock[d].pos[s];
      }
      for (const k in seen) {
        const e = seen[k];
        if (e.c > e.max) total += (e.c - e.max) * W.maxDay;
        if (e.c >= 2 && (e.mixed || e.l - e.f + 1 !== e.c)) total += W.split;
      }
      return total;
    }

    // Anahtar: tür*X + id*ND + gün
    const K_TD = 0, K_GD = 1, K_TG = 2;
    const keys = [];
    function addKey(kind, id, d) {
      const code = (kind * 100000 + id) * 64 + (d < 0 ? 63 : d);
      if (kind !== K_TG && d < 0) return;
      for (let k = 0; k < keys.length; k++) if (keys[k] === code) return;
      keys.push(code);
    }
    function keysCost() {
      let c = 0;
      for (let k = 0; k < keys.length; k++) {
        const code = keys[k]; const d = code % 64; const r = Math.floor(code / 64);
        const kind = Math.floor(r / 100000), id = r % 100000;
        if (kind === K_TD) c += teacherDay(id, d);
        else if (kind === K_GD) c += groupDay(id, d);
        else c += teacherGlobal(id);
      }
      return c;
    }
    function touchItem(i, d) {
      const it = items[i];
      addKey(K_TD, it.t, d); addKey(K_GD, it.g, d); addKey(K_TG, it.t, -1);
    }
    function totalCost() {
      let c = unplaced.length * W.unplaced;
      for (let t = 0; t < NT; t++) { c += teacherGlobal(t); for (let d = 0; d < ND; d++) c += teacherDay(t, d); }
      for (let g = 0; g < NG; g++) for (let d = 0; d < ND; d++) c += groupDay(g, d);
      return c;
    }

    // --- Başlangıç: sabitler, sonra zor olandan kolaya açgözlü yerleştirme ---
    for (let i = 0; i < NI; i++) addU(i);
    const isFixed = new Uint8Array(NI);
    items.forEach((it, i) => {
      if (it.fixed) {
        const [d, s] = it.fixed;
        if (d >= 0 && d < ND && occT[it.t][d][s] < 0 && occG[it.g][d][s] < 0) { setPos(i, d, s); isFixed[i] = 1; }
      }
    });
    const order = [...Array(NI).keys()].filter((i) => !isFixed[i]);
    order.sort((a, b) => allowed[a].length - allowed[b].length || Math.random() - 0.5);
    for (const i of order) {
      const it = items[i]; let best = null, bestDelta = Infinity, ties = 0;
      for (const code of allowed[i]) {
        const d = Math.floor(code / SMAX), s = code % SMAX;
        if (occT[it.t][d][s] >= 0 || occG[it.g][d][s] >= 0) continue;
        keys.length = 0; touchItem(i, d);
        const before = keysCost(); setPos(i, d, s); const after = keysCost(); setPos(i, -1, -1);
        const delta = after - before;
        if (delta < bestDelta) { bestDelta = delta; best = code; ties = 1; }
        else if (delta === bestDelta && Math.random() * ++ties < 1) best = code;
      }
      if (best !== null) setPos(i, Math.floor(best / SMAX), best % SMAX);
    }

    let cost = totalCost();
    let bestCost = cost;
    let bestD = Int32Array.from(posD), bestS = Int32Array.from(posS);

    // --- Tavlama ---
    const movable = order;
    const iters = input.iterations || Math.max(300000, Math.min(2500000, NI * 4000));
    const T0 = 25, T1 = 0.05;
    const log = []; // [i, oldD, oldS]
    function record(i) { log.push(i, posD[i], posS[i]); }
    function revert() {
      for (let k = 0; k < log.length; k += 3) setPos(log[k], -1, -1);
      for (let k = 0; k < log.length; k += 3) if (log[k + 1] >= 0) setPos(log[k], log[k + 1], log[k + 2]);
    }

    for (let it = 0; it < iters && movable.length; it++) {
      const T = T0 * Math.pow(T1 / T0, it / iters);
      log.length = 0; keys.length = 0;
      let i;
      const tryUnplaced = unplaced.length > 0 && Math.random() < 0.3;
      if (tryUnplaced) {
        i = unplaced[(Math.random() * unplaced.length) | 0];
        if (isFixed[i] || allowed[i].length === 0) continue;
      } else {
        i = movable[(Math.random() * movable.length) | 0];
        if (posD[i] < 0) { if (allowed[i].length === 0) continue; }
      }
      const al = allowed[i]; if (!al.length) continue;
      const code = al[(Math.random() * al.length) | 0];
      const d2 = Math.floor(code / SMAX), s2 = code % SMAX;
      const d1 = posD[i], s1 = posS[i];
      if (d1 === d2 && s1 === s2) continue;
      const ti = items[i].t, gi = items[i].g;
      const j = occG[gi][d2][s2], k = occT[ti][d2][s2];
      const unBefore = unplaced.length;

      if (d1 < 0) {
        // Yerleşmemiş dersi zorla yerleştir: o saatteki dersleri çıkar
        if ((j >= 0 && isFixed[j]) || (k >= 0 && isFixed[k])) continue;
        touchItem(i, d2);
        if (j >= 0) touchItem(j, d2);
        if (k >= 0 && k !== j) touchItem(k, d2);
        const before = keysCost() + unBefore * W.unplaced;
        if (j >= 0) { record(j); setPos(j, -1, -1); }
        if (k >= 0 && k !== j) { record(k); setPos(k, -1, -1); }
        record(i); setPos(i, d2, s2);
        const after = keysCost() + unplaced.length * W.unplaced;
        const delta = after - before;
        if (delta <= 0 || Math.random() < Math.exp(-delta / T)) cost += delta; else revert();
      } else {
        if (k >= 0 && k !== j) continue; // öğretmen o saatte başka grupta
        if (j >= 0) {
          if (isFixed[j]) continue;
          // takas: j, i'nin eski yerine gidebilmeli
          if (!allowedSet[j].has(d1 * SMAX + s1)) continue;
          const tj = items[j].t; const kk = occT[tj][d1][s1];
          if (kk >= 0 && kk !== i) continue;
          touchItem(i, d1); touchItem(i, d2); touchItem(j, d1); touchItem(j, d2);
          const before = keysCost();
          record(i); record(j);
          setPos(i, -1, -1); setPos(j, -1, -1); setPos(i, d2, s2); setPos(j, d1, s1);
          const delta = keysCost() - before;
          if (delta <= 0 || Math.random() < Math.exp(-delta / T)) cost += delta; else revert();
        } else {
          touchItem(i, d1); touchItem(i, d2);
          const before = keysCost();
          record(i); setPos(i, d2, s2);
          const delta = keysCost() - before;
          if (delta <= 0 || Math.random() < Math.exp(-delta / T)) cost += delta; else revert();
        }
      }
      if (cost < bestCost - 1e-9) { bestCost = cost; bestD = Int32Array.from(posD); bestS = Int32Array.from(posS); }
      if (onProgress && it % 25000 === 0) onProgress(it / iters, bestCost);
    }

    // En iyi çözümü geri yükle
    for (let i = 0; i < NI; i++) setPos(i, -1, -1);
    for (let i = 0; i < NI; i++) if (bestD[i] >= 0) setPos(i, bestD[i], bestS[i]);
    const finalCost = totalCost();
    return {
      cost: finalCost,
      positions: items.map((_, i) => [posD[i], posS[i]]),
      unplaced: [...unplaced],
      noOption: items.map((_, i) => allowed[i].length === 0),
    };
  }

  /* Birkaç kez çalıştırıp en düşük cezalıyı seç */
  function solveBest(input, runs, onProgress) {
    let best = null;
    for (let r = 0; r < runs; r++) {
      const res = solve(input, (p, c) => onProgress && onProgress((r + p) / runs, best ? Math.min(best.cost, c) : c));
      if (!best || res.cost < best.cost) best = res;
    }
    return best;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { solve, solveBest, DEFAULT_W };
  if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof module === 'undefined') {
    self.onmessage = (e) => {
      try {
        const res = solveBest(e.data, e.data.runs || 3, (p, c) => self.postMessage({ type: 'progress', p, cost: c }));
        self.postMessage({ type: 'done', result: res });
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err && err.message || err) });
      }
    };
  }
})();
