/* Dershane Ders Programı — arayüz */
(function () {
  'use strict';
  const KEY = 'dersprogrami.v1';
  const TYPE_NAME = { mezun: 'Mezun', lise: 'Lise', ilk: 'İlköğretim' };

  // ---------- Durum ----------
  function load() {
    try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) { /* yoksay */ }
    return null;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* yoksay */ } }
  let state = load() || DP.sampleState();
  const ui = {
    tab: state.schedule ? 'program' : 'program',
    viewMode: 'teacher', viewId: null,
    layout: window.innerWidth < 700 ? 'list' : 'table',
    sel: null,        // seçili yerleşim indeksi
    solving: null,    // {p}
    keepLocked: true,
    modal: null,
    toast: null,
  };

  // ---------- Yardımcılar ----------
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = (arr, id) => arr.find((x) => x.id === id);
  const teacher = (id) => byId(state.teachers, id);
  const group = (id) => byId(state.groups, id);
  const lesson = (id) => byId(state.lessons, id);
  const dayObj = (id) => byId(state.settings.days, id);
  const activeDays = () => state.settings.days.filter((d) => d.active);
  const slotsOf = (dayId) => state.settings.slots[dayObj(dayId).kind] || [];
  const SHORT = { Pazartesi: 'Pzt', Salı: 'Sal', Çarşamba: 'Çar', Perşembe: 'Per', Cuma: 'Cum', Cumartesi: 'Cmt', Pazar: 'Paz' };
  const shortDay = (name) => SHORT[name] || name.slice(0, 3);
  const trCmp = (a, b) => a.localeCompare(b, 'tr', { numeric: true });

  function color(key) {
    let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const hue = h % 360;
    return `background:hsl(${hue} 70% 92%);color:hsl(${hue} 55% 25%)`;
  }

  let toastTimer = null;
  function toast(msg, kind = '') {
    ui.toast = { msg, kind };
    renderToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast = null; renderToast(); }, 4200);
  }
  function renderToast() {
    let el = $('#toast');
    if (!ui.toast) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.className = 'toast ' + ui.toast.kind;
    el.textContent = ui.toast.msg;
  }

  /* Kendi onay penceremiz (tarayıcı confirm'ü bazı yerlerde engelli) */
  let pendingYes = null;
  function ask(msg, onYes, yesLabel = 'Evet') {
    pendingYes = onYes;
    ui.modal = { html: `<h2>Emin misin?</h2><p>${esc(msg)}</p><div class="foot"><button type="button" class="btn" data-act="closeModal">Vazgeç</button><button type="button" class="btn primary" data-act="askYes">${esc(yesLabel)}</button></div>` };
    render();
  }

  function markStale() { if (state.schedule) state.schedule.stale = true; }
  function commit(stale = true) { if (stale) markStale(); save(); render(); }

  // ---------- Program analizi ----------
  function placements() { return (state.schedule && state.schedule.placements) || []; }

  function buildIndex() {
    const T = new Map(), G = new Map();
    placements().forEach((p, i) => {
      if (!p.day) return;
      const L = lesson(p.lessonId); if (!L) return;
      const kt = L.teacherId + '|' + p.day + '|' + p.slot, kg = L.groupId + '|' + p.day + '|' + p.slot;
      if (!T.has(kt)) T.set(kt, []); T.get(kt).push(i);
      if (!G.has(kg)) G.set(kg, []); G.get(kg).push(i);
    });
    return { T, G };
  }

  /* Bir varlığın (öğretmen/grup) gün içindeki dolu slotlarından boşlukları bul */
  function gapsFor(occFn, dayId) {
    const slots = slotsOf(dayId);
    const blocks = new Map();
    slots.forEach((sl, s) => {
      if (!sl.types || !sl.types.length) return;
      if (!blocks.has(sl.block)) blocks.set(sl.block, []);
      blocks.get(sl.block).push(s);
    });
    const gaps = [];
    for (const arr of blocks.values()) {
      const used = arr.filter((s) => occFn(s));
      if (!used.length) continue;
      const f = arr.indexOf(used[0]), l = arr.indexOf(used[used.length - 1]);
      for (let k = f; k <= l; k++) if (!occFn(arr[k])) gaps.push(arr[k]);
    }
    return gaps;
  }

  function stats() {
    const idx = buildIndex();
    const days = activeDays();
    const tRows = state.teachers.map((t) => {
      let hours = 0, used = 0, gaps = 0, singles = 0;
      for (const d of days) {
        const occ = (s) => idx.T.has(t.id + '|' + d.id + '|' + s);
        const n = slotsOf(d.id).filter((_, s) => occ(s)).length;
        hours += n; if (n) used++; if (n === 1) singles++;
        gaps += gapsFor(occ, d.id).length;
      }
      return { t, hours, used, gaps, singles };
    });
    const gRows = state.groups.map((g) => {
      let hours = 0, gaps = 0;
      for (const d of days) {
        const occ = (s) => idx.G.has(g.id + '|' + d.id + '|' + s);
        hours += slotsOf(d.id).filter((_, s) => occ(s)).length;
        gaps += gapsFor(occ, d.id).length;
      }
      return { g, hours, gaps };
    });
    const unplaced = placements().filter((p) => !p.day);
    let conflicts = 0;
    for (const v of idx.T.values()) if (v.length > 1) conflicts += v.length - 1;
    for (const v of idx.G.values()) if (v.length > 1) conflicts += v.length - 1;
    return { tRows, gRows, unplaced, conflicts, idx };
  }

  // ---------- Çizim ----------
  function render() {
    const app = $('#app');
    const tabs = [['program', 'Program'], ['teachers', 'Öğretmenler'], ['groups', 'Gruplar'], ['lessons', 'Dersler'], ['settings', 'Ayarlar']];
    app.innerHTML = `
      <header class="topbar">
        <h1>Ders Programı</h1>
        <div class="sub">${esc(state.settings.institution || '')} · ${state.teachers.length} öğretmen · ${state.groups.length} grup · ${state.lessons.reduce((a, l) => a + (+l.hours || 0), 0)} ders saati</div>
        <nav class="tabs">${tabs.map(([k, n]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${n}</button>`).join('')}</nav>
      </header>
      <main>${({ program: viewProgram, teachers: viewTeachers, groups: viewGroups, lessons: viewLessons, settings: viewSettings })[ui.tab]()}</main>
      ${ui.modal ? `<div class="overlay" data-act="overlay"><div class="modal" role="dialog">${ui.modal.html}</div></div>` : ''}
    `;
    renderToast();
  }

  // ----- Program sekmesi -----
  function viewProgram() {
    const sch = state.schedule;
    let h = '';
    if (ui.solving) {
      return `<div class="card"><h2>Program oluşturuluyor…</h2>
        <div class="progress"><div style="width:${Math.round(ui.solving.p * 100)}%"></div></div>
        <div class="muted small">Çakışmasız ve boşluksuz en iyi programı arıyorum. Birkaç saniye sürer.</div></div>`;
    }
    if (!state.lessons.length) {
      return `<div class="card"><h2>Başlarken</h2>
        <p>Önce <b>Öğretmenler</b>, <b>Gruplar</b> ve <b>Dersler</b> sekmelerinden verileri gir. Sonra buradan tek tuşla program oluştur.</p>
        <button class="btn primary" data-act="sample">Örnek verileri yükle</button></div>`;
    }
    const lockedCount = sch ? sch.placements.filter((p) => p.locked && p.day).length : 0;
    h += `<div class="card">
      <div class="row">
        <button class="btn primary big" data-act="solve">${sch ? 'Programı yeniden oluştur' : 'Programı oluştur'}</button>
        ${lockedCount ? `<label class="check"><input type="checkbox" data-act="keepLocked" ${ui.keepLocked ? 'checked' : ''}> Sabitlenen ${lockedCount} dersi koru 📌</label>` : ''}
      </div>
      ${sch ? '' : '<p class="muted small" style="margin:10px 0 0">Kurallar: çakışma yok, öğretmen sadece kendi günlerinde, vardiya içinde boş saat yok, dersler vardiyanın başına toplanır, bir grubun aynı dersi günde sınırı geçmez.</p>'}
    </div>`;
    if (!sch) return h;

    const st = stats();
    if (sch.stale) h += `<div class="notice warn">Veriler program oluşturulduktan sonra değişti. Güncel program için <b>yeniden oluştur</b>.</div>`;
    if (st.unplaced.length) {
      const list = {};
      st.unplaced.forEach((p) => { const L = lesson(p.lessonId); if (!L) return; const k = (group(L.groupId) || {}).name + ' · ' + L.subject + ' (' + ((teacher(L.teacherId) || {}).name || '?') + ')'; list[k] = (list[k] || 0) + 1; });
      h += `<div class="notice bad"><b>${st.unplaced.length} ders saati yerleşemedi.</b> Öğretmenin günleri/saatleri yetmiyor olabilir.<br>${Object.entries(list).map(([k, n]) => esc(k) + ' – ' + n + ' saat').join('<br>')}</div>`;
    }
    if (st.conflicts) h += `<div class="notice bad">${st.conflicts} çakışma var (aynı saatte iki ders).</div>`;

    // Görünüm seçici
    const list = ui.viewMode === 'teacher'
      ? state.teachers.slice().sort((a, b) => trCmp(a.name, b.name))
      : state.groups.slice().sort((a, b) => trCmp(a.name, b.name));
    if (!list.find((x) => x.id === ui.viewId)) ui.viewId = list[0] && list[0].id;
    const cur = list.find((x) => x.id === ui.viewId);
    h += `<div class="card">
      <div class="row" style="margin-bottom:12px">
        <div class="seg"><button class="${ui.viewMode === 'teacher' ? 'on' : ''}" data-act="mode" data-v="teacher">Öğretmen</button><button class="${ui.viewMode === 'group' ? 'on' : ''}" data-act="mode" data-v="group">Grup</button></div>
        <select data-act="pick" style="flex:1;min-width:160px">${list.map((x) => `<option value="${x.id}" ${x.id === ui.viewId ? 'selected' : ''}>${esc(x.name)}${ui.viewMode === 'teacher' ? ' – ' + esc(x.branch || '') : ''}</option>`).join('')}</select>
        <div class="seg"><button class="${ui.layout === 'list' ? 'on' : ''}" data-act="layout" data-v="list">Liste</button><button class="${ui.layout === 'table' ? 'on' : ''}" data-act="layout" data-v="table">Tablo</button></div>
      </div>
      ${cur ? summaryLine(cur, st) : ''}
      ${cur ? (ui.layout === 'table' ? gridHTML(cur, st.idx) : listHTML(cur, st.idx)) : '<p class="muted">Kayıt yok.</p>'}
      ${ui.layout === 'table' ? `<p class="muted small" style="margin:8px 0 0">${ui.sel != null ? '<b>Taşımak için bir saate dokun.</b> Aynı karede başka ders varsa yer değiştirir. İptal için derse tekrar dokun.' : 'Elle değiştirmek için bir derse dokun, sonra gideceği saate dokun. Taşınan ders 📌 sabitlenir.'}</p>` : `<p class="muted small" style="margin:8px 0 0">Elle taşıma için <b>Tablo</b> görünümüne geç.</p>`}
      <div class="row" style="margin-top:12px">
        <button class="btn sm" data-act="print" data-v="one">🖨️ Bu programı yazdır</button>
        <button class="btn sm" data-act="print" data-v="teachers">Tüm öğretmenler</button>
        <button class="btn sm" data-act="print" data-v="groups">Tüm gruplar</button>
        ${lockedCount ? '<span class="spacer"></span><button class="btn sm" data-act="unlockAll">📌 Sabitlemeleri kaldır</button>' : ''}
      </div>
    </div>`;

    // Rapor
    const totalTGaps = st.tRows.reduce((a, r) => a + r.gaps, 0);
    const totalGGaps = st.gRows.reduce((a, r) => a + r.gaps, 0);
    h += `<div class="card"><h2>Kalite raporu</h2>
      <div class="row" style="margin-bottom:10px">
        <span class="badge ${totalTGaps ? 'warn' : 'ok'}">Öğretmen boş saati: ${totalTGaps}</span>
        <span class="badge ${totalGGaps ? 'warn' : 'ok'}">Grup boş saati: ${totalGGaps}</span>
        <span class="badge ${st.unplaced.length ? 'bad' : 'ok'}">Yerleşemeyen: ${st.unplaced.length}</span>
        <span class="badge ${st.conflicts ? 'bad' : 'ok'}">Çakışma: ${st.conflicts}</span>
      </div>
      <div class="repwrap"><table class="rep"><thead><tr><th>Öğretmen</th><th>Ders</th><th>Gün</th><th>Boş saat</th><th>Tek derslik gün</th></tr></thead><tbody>
      ${st.tRows.slice().sort((a, b) => trCmp(a.t.name, b.t.name)).map((r) => `<tr data-act="goto" data-mode="teacher" data-v="${r.t.id}" style="cursor:pointer">
        <td>${esc(r.t.name)}</td><td class="n">${r.hours}</td>
        <td class="n"><span class="badge ${r.used > r.t.dayCount ? 'bad' : ''}">${r.used} / ${r.t.dayCount}</span></td>
        <td class="n"><span class="badge ${r.gaps ? 'warn' : 'ok'}">${r.gaps}</span></td>
        <td class="n">${r.singles || '–'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted small" style="margin:8px 0 0">Öğle arası ve birebir saatleri boş saat sayılmaz; sadece aynı vardiya içindeki boşluklar sayılır.</p>
    </div>`;
    return h;
  }

  function summaryLine(cur, st) {
    if (ui.viewMode === 'teacher') {
      const r = st.tRows.find((x) => x.t.id === cur.id) || {};
      return `<div class="row small" style="margin-bottom:10px"><span class="badge">${r.hours || 0} ders saati</span><span class="badge ${r.used > cur.dayCount ? 'bad' : ''}">${r.used || 0}/${cur.dayCount} gün</span><span class="badge ${r.gaps ? 'warn' : 'ok'}">${r.gaps || 0} boş saat</span></div>`;
    }
    const r = st.gRows.find((x) => x.g.id === cur.id) || {};
    return `<div class="row small" style="margin-bottom:10px"><span class="badge ${cur.type}">${TYPE_NAME[cur.type]}</span><span class="badge">${r.hours || 0} ders saati</span><span class="badge ${r.gaps ? 'warn' : 'ok'}">${r.gaps || 0} boş saat</span></div>`;
  }

  function cellInfo(pIdx) {
    const p = placements()[pIdx]; const L = lesson(p.lessonId);
    const g = group(L.groupId), t = teacher(L.teacherId);
    return ui.viewMode === 'teacher'
      ? { top: g ? g.name : '?', bot: L.subject, key: L.groupId, locked: p.locked }
      : { top: L.subject, bot: t ? t.name : '?', key: L.subject, locked: p.locked };
  }

  function entityUsable(cur, dayId, s) {
    const sl = slotsOf(dayId)[s];
    if (!sl || !sl.types || !sl.types.length) return false;
    if (ui.viewMode === 'teacher') return cur.days.includes(dayId) && !(cur.blocked || []).includes(dayId + '|' + s);
    return sl.types.includes(cur.type);
  }

  function gridHTML(cur, idx) {
    const days = activeDays();
    const kinds = [...new Set(days.map((d) => d.kind))];
    const maxS = Math.max(...days.map((d) => slotsOf(d.id).length));
    const key = (dayId, s) => (ui.viewMode === 'teacher' ? cur.id : cur.id) + '|' + dayId + '|' + s;
    const map = ui.viewMode === 'teacher' ? idx.T : idx.G;
    let h = '<div class="gridwrap"><table class="grid"><thead><tr><th class="day">Gün</th>';
    for (let s = 0; s < maxS; s++) {
      const times = kinds.map((k, ki) => { const sl = state.settings.slots[k][s]; return sl ? `<span class="${ki ? 't2' : ''}">${sl.start}</span>` : ''; }).join('');
      h += `<th><span class="no">${s + 1}</span>${times}</th>`;
    }
    h += '</tr></thead><tbody>';
    for (const d of days) {
      const slots = slotsOf(d.id);
      const occ = (s) => map.has(key(d.id, s));
      const gaps = new Set(gapsFor(occ, d.id));
      h += `<tr><th class="day">${esc(d.name)}</th>`;
      for (let s = 0; s < maxS; s++) {
        const sl = slots[s];
        if (!sl) { h += '<td class="none"></td>'; continue; }
        if (!sl.types || !sl.types.length) { h += `<td class="closed">${esc(sl.block || 'Kapalı')}</td>`; continue; }
        const ps = map.get(key(d.id, s));
        if (ps && ps.length) {
          const pi = ps[0]; const c = cellInfo(pi);
          h += `<td class="cell ${ui.sel === pi ? 'sel' : ''}" data-act="cell" data-day="${d.id}" data-slot="${s}" data-p="${pi}">
            <div class="les" style="${color(c.key)}">${c.locked ? '<span class="pin">📌</span>' : ''}<b>${esc(c.top)}</b><span>${esc(c.bot)}</span>${ps.length > 1 ? '<span style="color:#c0392b">+' + (ps.length - 1) + ' çakışma</span>' : ''}</div></td>`;
        } else {
          const usable = entityUsable(cur, d.id, s);
          h += `<td class="cell ${gaps.has(s) ? 'gap' : usable ? '' : 'na'} ${ui.sel != null ? 'target' : ''}" data-act="cell" data-day="${d.id}" data-slot="${s}">${gaps.has(s) ? '<span class="small" style="color:#b54708">boş</span>' : ''}</td>`;
        }
      }
      h += '</tr>';
    }
    return h + '</tbody></table></div>';
  }

  function listHTML(cur, idx) {
    const map = ui.viewMode === 'teacher' ? idx.T : idx.G;
    let h = '<div class="daylist">';
    for (const d of activeDays()) {
      const slots = slotsOf(d.id);
      const occ = (s) => map.has(cur.id + '|' + d.id + '|' + s);
      const used = slots.map((_, s) => s).filter(occ);
      h += `<div class="dayc"><div class="dh"><span>${esc(d.name)}</span><span class="muted small">${used.length ? used.length + ' ders' : ''}</span></div>`;
      if (!used.length) { h += '<div class="empty">Ders yok</div></div>'; continue; }
      const gaps = new Set(gapsFor(occ, d.id));
      let prevBlock = null;
      for (let s = used[0]; s <= used[used.length - 1]; s++) {
        const sl = slots[s];
        if (!sl.types || !sl.types.length) continue;
        if (!occ(s) && !gaps.has(s)) { continue; }
        if (prevBlock && sl.block !== prevBlock) h += `<div class="dl brk">— ${esc(sl.block)} —</div>`;
        prevBlock = sl.block;
        const tm = `<div class="tm">${sl.start}–${sl.end}</div>`;
        if (occ(s)) {
          const c = cellInfo(map.get(cur.id + '|' + d.id + '|' + s)[0]);
          h += `<div class="dl">${tm}<div class="tg" style="${color(c.key)}"><b>${esc(c.top)}</b> · ${esc(c.bot)} ${c.locked ? '📌' : ''}</div></div>`;
        } else {
          h += `<div class="dl gap">${tm}<div class="tg">Boş saat</div></div>`;
        }
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  // ----- Elle taşıma -----
  function checkPlace(L, dayId, s, exclude) {
    const sl = slotsOf(dayId)[s];
    const g = group(L.groupId), t = teacher(L.teacherId);
    const dn = dayObj(dayId).name;
    if (!sl || !sl.types || !sl.types.length) return `Bu saat ders saati değil (${sl ? sl.block : 'yok'}).`;
    if (!sl.types.includes(g.type)) return `${dn} ${sl.start} saati ${TYPE_NAME[g.type]} gruplarına kapalı.`;
    if (!t.days.includes(dayId)) return `${t.name} ${dn} günü gelmiyor.`;
    if ((t.blocked || []).includes(dayId + '|' + s)) return `${t.name} ${dn} ${sl.start} saatinde müsait değil.`;
    const P = placements();
    for (let i = 0; i < P.length; i++) {
      if (exclude.includes(i)) continue;
      const p = P[i]; if (p.day !== dayId || p.slot !== s) continue;
      const O = lesson(p.lessonId); if (!O) continue;
      if (O.teacherId === L.teacherId) return `${t.name} o saatte ${group(O.groupId).name} grubunda derste.`;
      if (O.groupId === L.groupId) return `${g.name} o saatte ${O.subject} dersinde.`;
    }
    return null;
  }

  function tryMove(pi, dayId, s, occupant) {
    const P = placements(); const p = P[pi]; const L = lesson(p.lessonId);
    if (occupant != null && occupant !== pi) {
      const q = P[occupant]; const M = lesson(q.lessonId);
      const e1 = checkPlace(L, dayId, s, [pi, occupant]);
      const e2 = checkPlace(M, p.day, p.slot, [pi, occupant]);
      if (e1 || e2) return toast('Yer değiştirilemedi: ' + (e1 || e2), 'bad');
      const od = p.day, os = p.slot;
      p.day = dayId; p.slot = s; p.locked = true;
      q.day = od; q.slot = os; q.locked = true;
      ui.sel = null; save(); render(); toast('Yer değiştirildi, iki ders de 📌 sabitlendi.', 'ok');
      return;
    }
    const e = checkPlace(L, dayId, s, [pi]);
    if (e) return toast('Taşınamadı: ' + e, 'bad');
    p.day = dayId; p.slot = s; p.locked = true;
    ui.sel = null; save(); render();
    const t = teacher(L.teacherId);
    const usedDays = new Set(P.filter((x) => x.day && lesson(x.lessonId) && lesson(x.lessonId).teacherId === t.id).map((x) => x.day)).size;
    if (usedDays > t.dayCount) toast(`Taşındı 📌 Dikkat: ${t.name} artık ${usedDays} gün geliyor (sınır ${t.dayCount}).`, '');
    else toast('Taşındı ve 📌 sabitlendi.', 'ok');
  }

  // ----- Çözücü -----
  let worker = null;
  function runSolve() {
    const { input, meta } = DP.buildSolverInput(state, { keepLocked: ui.keepLocked });
    if (!input.items.length) return toast('Önce ders ekle.', 'bad');
    ui.solving = { p: 0 }; ui.sel = null; render();
    try { if (worker) worker.terminate(); worker = new Worker('solver.js'); } catch (e) { ui.solving = null; render(); return toast('Çözücü başlatılamadı: ' + e.message, 'bad'); }
    input.runs = 3;
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') { ui.solving.p = m.p; const bar = document.querySelector('.progress > div'); if (bar) bar.style.width = Math.round(m.p * 100) + '%'; }
      else if (m.type === 'done') {
        state.schedule = { placements: DP.resultToPlacements(m.result, meta), generatedAt: new Date().toISOString(), stale: false };
        ui.solving = null; save(); render();
        const st = stats();
        const g = st.tRows.reduce((a, r) => a + r.gaps, 0);
        toast(st.unplaced.length ? `${st.unplaced.length} ders saati yerleşemedi, rapora bak.` : `Program hazır. Öğretmenlerde toplam ${g} boş saat.`, st.unplaced.length ? 'bad' : 'ok');
        worker.terminate(); worker = null;
      } else if (m.type === 'error') {
        ui.solving = null; render(); toast('Hata: ' + m.message, 'bad');
      }
    };
    worker.onerror = (e) => { ui.solving = null; render(); toast('Çözücü hatası: ' + (e.message || ''), 'bad'); };
    worker.postMessage(input);
  }

  // ----- Öğretmenler -----
  function teacherHours(tid) { return state.lessons.filter((l) => l.teacherId === tid).reduce((a, l) => a + (+l.hours || 0), 0); }
  function teacherCapacity(t) {
    // Seçili günlerde, en az bir grup türüne açık slot sayısı (kabaca üst sınır)
    const caps = t.days.filter((d) => dayObj(d) && dayObj(d).active).map((d) => slotsOf(d).filter((sl, s) => sl.types && sl.types.length && !(t.blocked || []).includes(d + '|' + s)).length).sort((a, b) => b - a);
    return caps.slice(0, t.dayCount).reduce((a, b) => a + b, 0);
  }
  function viewTeachers() {
    const list = state.teachers.slice().sort((a, b) => trCmp(a.name, b.name));
    return `<div class="row" style="margin-bottom:12px"><h2 style="margin:0;font-size:17px">Öğretmenler</h2><span class="spacer"></span><button class="btn primary" data-act="editTeacher">+ Öğretmen ekle</button></div>
      ${list.length ? '' : '<p class="muted">Henüz öğretmen yok.</p>'}
      <div class="list">${list.map((t) => {
        const hrs = teacherHours(t.id); const cap = teacherCapacity(t);
        const dn = state.settings.days.filter((d) => t.days.includes(d.id)).map((d) => shortDay(d.name)).join(', ');
        return `<div class="item"><div class="row"><div class="name">${esc(t.name)}</div><span class="spacer"></span><span class="badge ${hrs > cap ? 'bad' : ''}">${hrs} saat</span></div>
          <div class="meta">${esc(t.branch || '—')}</div>
          <div class="meta">${t.dayCount} gün · ${esc(dn) || 'gün seçilmedi'}${(t.blocked || []).length ? ' · ' + t.blocked.length + ' kapalı saat' : ''}</div>
          ${hrs > cap ? `<div class="meta" style="color:var(--bad)">Ders saati, seçili günlere sığmıyor (en fazla ${cap}).</div>` : ''}
          <div class="acts"><button class="btn sm" data-act="editTeacher" data-id="${t.id}">Düzenle</button><button class="btn sm danger" data-act="delTeacher" data-id="${t.id}">Sil</button></div></div>`;
      }).join('')}</div>`;
  }
  function teacherModal(id) {
    const t = id ? teacher(id) : { name: '', branch: '', dayCount: 4, days: activeDays().map((d) => d.id), blocked: [] };
    const branches = [...new Set(state.teachers.map((x) => x.branch).filter(Boolean))];
    const days = activeDays();
    const maxS = Math.max(...days.map((d) => slotsOf(d.id).length));
    let grid = '<div class="avail"><table><tr><th></th>' + Array.from({ length: maxS }, (_, s) => `<th>${s + 1}</th>`).join('') + '</tr>';
    for (const d of days) {
      grid += `<tr><th>${shortDay(d.name)}</th>`;
      slotsOf(d.id).forEach((sl, s) => {
        if (!sl.types || !sl.types.length) { grid += '<td></td>'; return; }
        const off = (t.blocked || []).includes(d.id + '|' + s);
        grid += `<td><button type="button" class="${off ? 'off' : ''}" data-act="toggleBlock" data-k="${d.id}|${s}" title="${sl.start}">${sl.start}</button></td>`;
      });
      grid += '</tr>';
    }
    grid += '</table></div>';
    return `<h2>${id ? 'Öğretmeni düzenle' : 'Öğretmen ekle'}</h2>
      <form id="f">
      <label class="field"><span>Ad soyad</span><input type="text" name="name" value="${esc(t.name)}" required></label>
      <label class="field"><span>Branş</span><input type="text" name="branch" value="${esc(t.branch)}" list="branches"><datalist id="branches">${branches.map((b) => `<option value="${esc(b)}">`).join('')}</datalist></label>
      <label class="field"><span>Haftada kaç gün gelir?</span><select name="dayCount">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === t.dayCount ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="field" style="margin-bottom:12px"><span class="muted small" style="font-weight:600;display:block;margin-bottom:6px">Gelebileceği günler <span style="font-weight:400">(gün sayısından fazla seçersen hangi günler olacağını program seçer)</span></span>
        <div class="chips">${days.map((d) => `<label class="check"><input type="checkbox" name="days" value="${d.id}" ${t.days.includes(d.id) ? 'checked' : ''}>${esc(d.name)}</label>`).join('')}</div></div>
      <div class="field"><span class="muted small" style="font-weight:600;display:block;margin-bottom:6px">Müsait olmadığı saatler <span style="font-weight:400">(dokununca kırmızı = gelemez)</span></span>${grid}</div>
      <div class="foot"><button type="button" class="btn" data-act="closeModal">Vazgeç</button><button type="button" class="btn primary" data-act="saveTeacher" data-id="${id || ''}">Kaydet</button></div>
      </form>`;
  }
  function saveTeacher(id) {
    const f = $('#f');
    const name = f.name.value.trim(); if (!name) return toast('Ad gerekli.', 'bad');
    const days = [...f.querySelectorAll('input[name=days]:checked')].map((x) => x.value);
    const blocked = [...f.querySelectorAll('[data-act=toggleBlock].off')].map((x) => x.dataset.k);
    const data = { name, branch: f.branch.value.trim(), dayCount: +f.dayCount.value, days, blocked };
    if (days.length < data.dayCount) return toast(`${data.dayCount} gün için en az ${data.dayCount} gün seçmelisin.`, 'bad');
    if (id) Object.assign(teacher(id), data); else state.teachers.push(Object.assign({ id: DP.uid() }, data));
    ui.modal = null; commit();
  }

  // ----- Gruplar -----
  function viewGroups() {
    const list = state.groups.slice().sort((a, b) => trCmp(a.name, b.name));
    return `<div class="row" style="margin-bottom:12px"><h2 style="margin:0;font-size:17px">Gruplar / Sınıflar</h2><span class="spacer"></span><button class="btn primary" data-act="editGroup">+ Grup ekle</button></div>
      ${list.length ? '' : '<p class="muted">Henüz grup yok.</p>'}
      <div class="list">${list.map((g) => {
        const hrs = state.lessons.filter((l) => l.groupId === g.id).reduce((a, l) => a + (+l.hours || 0), 0);
        return `<div class="item"><div class="row"><div class="name">${esc(g.name)}</div><span class="badge ${g.type}">${TYPE_NAME[g.type]}</span><span class="spacer"></span><span class="badge">${hrs} saat</span></div>
        <div class="acts"><button class="btn sm" data-act="goLessons" data-id="${g.id}">Dersleri</button><button class="btn sm" data-act="editGroup" data-id="${g.id}">Düzenle</button><button class="btn sm danger" data-act="delGroup" data-id="${g.id}">Sil</button></div></div>`;
      }).join('')}</div>
      <p class="muted small">Grup türü hangi saatlerde ders alabileceğini belirler (Ayarlar › Ders saatleri).</p>`;
  }
  function groupModal(id) {
    const g = id ? group(id) : { name: '', type: 'lise' };
    return `<h2>${id ? 'Grubu düzenle' : 'Grup ekle'}</h2><form id="f">
      <label class="field"><span>Grup adı</span><input type="text" name="name" value="${esc(g.name)}" placeholder="ör. 12J, 13 SAY3"></label>
      <label class="field"><span>Türü</span><select name="type">${Object.entries(TYPE_NAME).map(([k, v]) => `<option value="${k}" ${g.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="foot"><button type="button" class="btn" data-act="closeModal">Vazgeç</button><button type="button" class="btn primary" data-act="saveGroup" data-id="${id || ''}">Kaydet</button></div></form>`;
  }
  function saveGroup(id) {
    const f = $('#f'); const name = f.name.value.trim(); if (!name) return toast('Grup adı gerekli.', 'bad');
    const data = { name, type: f.type.value };
    if (id) Object.assign(group(id), data); else state.groups.push(Object.assign({ id: DP.uid() }, data));
    ui.modal = null; commit();
  }

  // ----- Dersler -----
  function viewLessons() {
    const groups = state.groups.slice().sort((a, b) => trCmp(a.name, b.name));
    if (!groups.length) return '<div class="card">Önce <b>Gruplar</b> sekmesinden grup ekle.</div>';
    if (!state.teachers.length) return '<div class="card">Önce <b>Öğretmenler</b> sekmesinden öğretmen ekle.</div>';
    return `<div class="row" style="margin-bottom:12px"><h2 style="margin:0;font-size:17px">Dersler</h2><span class="spacer"></span><button class="btn primary" data-act="editLesson">+ Ders ekle</button></div>
      <div class="list">${groups.map((g) => {
        const ls = state.lessons.filter((l) => l.groupId === g.id).sort((a, b) => trCmp(a.subject, b.subject));
        const hrs = ls.reduce((a, l) => a + (+l.hours || 0), 0);
        return `<div class="item" id="g-${g.id}"><div class="row" style="margin-bottom:4px"><div class="name">${esc(g.name)}</div><span class="badge ${g.type}">${TYPE_NAME[g.type]}</span><span class="spacer"></span><span class="badge">${hrs} saat</span></div>
          ${ls.map((l) => `<div class="lessonrow"><div><div class="subj">${esc(l.subject)}</div><div class="muted small">${esc((teacher(l.teacherId) || {}).name || '—')} · günde en çok ${l.maxPerDay || 2}</div></div><span class="hrs">${l.hours} saat</span>
            <button class="icon-btn" data-act="editLesson" data-id="${l.id}" aria-label="Düzenle">✎</button><button class="icon-btn" data-act="delLesson" data-id="${l.id}" aria-label="Sil">✕</button></div>`).join('') || '<div class="muted small">Ders yok</div>'}
          <div class="acts"><button class="btn sm" data-act="editLesson" data-group="${g.id}">+ Bu gruba ders</button></div></div>`;
      }).join('')}</div>`;
  }
  function lessonModal(id, groupId) {
    const l = id ? lesson(id) : { groupId: groupId || (state.groups[0] || {}).id, subject: '', teacherId: '', hours: 2, maxPerDay: 2 };
    const subjects = [...new Set(state.lessons.map((x) => x.subject).concat(state.teachers.map((t) => t.branch)).filter(Boolean))].sort(trCmp);
    const ts = state.teachers.slice().sort((a, b) => trCmp(a.name, b.name));
    return `<h2>${id ? 'Dersi düzenle' : 'Ders ekle'}</h2><form id="f">
      <label class="field"><span>Grup</span><select name="groupId">${state.groups.slice().sort((a, b) => trCmp(a.name, b.name)).map((g) => `<option value="${g.id}" ${g.id === l.groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Ders</span><input type="text" name="subject" value="${esc(l.subject)}" list="subjects" placeholder="ör. Fizik"><datalist id="subjects">${subjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <label class="field"><span>Öğretmen</span><select name="teacherId">${ts.map((t) => `<option value="${t.id}" ${t.id === l.teacherId ? 'selected' : ''}>${esc(t.name)}${t.branch ? ' – ' + esc(t.branch) : ''}</option>`).join('')}</select></label>
      <div class="row"><label class="field" style="flex:1"><span>Haftalık saat</span><input type="number" name="hours" min="1" max="40" value="${l.hours}"></label>
      <label class="field" style="flex:1"><span>Günde en fazla</span><input type="number" name="maxPerDay" min="1" max="10" value="${l.maxPerDay || 2}"></label></div>
      <div class="foot"><button type="button" class="btn" data-act="closeModal">Vazgeç</button><button type="button" class="btn primary" data-act="saveLesson" data-id="${id || ''}">Kaydet</button></div></form>`;
  }
  function saveLesson(id) {
    const f = $('#f');
    const data = { groupId: f.groupId.value, subject: f.subject.value.trim(), teacherId: f.teacherId.value, hours: Math.max(1, +f.hours.value || 1), maxPerDay: Math.max(1, +f.maxPerDay.value || 2) };
    if (!data.subject) return toast('Ders adı gerekli.', 'bad');
    if (!data.teacherId) return toast('Öğretmen seç.', 'bad');
    if (id) Object.assign(lesson(id), data); else state.lessons.push(Object.assign({ id: DP.uid() }, data));
    ui.modal = null; commit();
  }

  // ----- Ayarlar -----
  function viewSettings() {
    const S = state.settings;
    const slotTable = (kind, title) => `<div class="card"><h2>${title}</h2><div class="slotwrap"><table class="slots"><thead><tr><th>#</th><th>Başlangıç</th><th>Bitiş</th><th>Vardiya</th>${Object.values(TYPE_NAME).map((n) => `<th>${n}</th>`).join('')}<th></th></tr></thead><tbody>
      ${S.slots[kind].map((sl, s) => `<tr data-kind="${kind}" data-s="${s}"><td>${s + 1}</td>
        <td><input type="time" data-f="start" value="${sl.start}"></td><td><input type="time" data-f="end" value="${sl.end}"></td>
        <td><input type="text" data-f="block" value="${esc(sl.block)}"></td>
        ${Object.keys(TYPE_NAME).map((k) => `<td><input type="checkbox" data-f="type" value="${k}" ${sl.types.includes(k) ? 'checked' : ''}></td>`).join('')}
        <td><button class="icon-btn" data-act="delSlot" data-kind="${kind}" data-s="${s}">✕</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-act="addSlot" data-kind="${kind}">+ Saat ekle</button></div></div>`;
    return `<div class="card"><h2>Kurum</h2><label class="field"><span>Kurum adı</span><input type="text" id="inst" value="${esc(S.institution || '')}"></label></div>
      <div class="card"><h2>Ders günleri</h2><div class="chips">${S.days.map((d) => `<label class="check"><input type="checkbox" class="dayact" value="${d.id}" ${d.active ? 'checked' : ''}>${esc(d.name)}</label>`).join('')}</div>
        <p class="muted small" style="margin:8px 0 0">Cuma deneme günü olduğu için kapalı.</p></div>
      <div class="notice info">Bir saatte hiçbir tür işaretli değilse (ör. birebir saatleri) o saate ders konmaz. Aynı vardiyadaki boşluklar cezalandırılır; vardiyalar arası (öğle arası, birebir) boşluk sayılmaz.</div>
      ${slotTable('hi', 'Ders saatleri — Hafta içi')}
      ${slotTable('cmt', 'Ders saatleri — Hafta sonu')}
      <div class="row" style="margin-bottom:14px"><button class="btn primary" data-act="saveSettings">Ayarları kaydet</button></div>
      <div class="card"><h2>Veriler</h2>
        <p class="muted small" style="margin-top:0">Veriler bu cihazın tarayıcısında saklanır. Başka cihaza taşımak için yedek indirip orada yükle.</p>
        <div class="row">
          <button class="btn" data-act="export">⬇️ Yedek indir</button>
          <label class="btn" style="display:inline-block">⬆️ Yedek yükle<input type="file" accept=".json,application/json" id="importFile" hidden></label>
          <button class="btn" data-act="sample">Örnek verileri yükle</button>
          <button class="btn danger" data-act="wipe">Tümünü sil</button>
        </div></div>`;
  }
  function readSettingsForm() {
    const S = state.settings;
    S.institution = ($('#inst') || {}).value || S.institution;
    document.querySelectorAll('.dayact').forEach((c) => { dayObj(c.value).active = c.checked; });
    document.querySelectorAll('tr[data-kind]').forEach((tr) => {
      const sl = S.slots[tr.dataset.kind][+tr.dataset.s]; if (!sl) return;
      sl.start = tr.querySelector('[data-f=start]').value;
      sl.end = tr.querySelector('[data-f=end]').value;
      sl.block = tr.querySelector('[data-f=block]').value.trim() || 'Vardiya';
      sl.types = [...tr.querySelectorAll('[data-f=type]:checked')].map((x) => x.value);
    });
  }

  // ----- Yazdırma -----
  function printPages(kind) {
    const st = stats();
    const days = activeDays();
    const kinds = [...new Set(days.map((d) => d.kind))];
    const maxS = Math.max(...days.map((d) => slotsOf(d.id).length));
    const S = state.settings;
    const page = (mode, ent) => {
      const map = mode === 'teacher' ? st.idx.T : st.idx.G;
      let h = `<div class="pp"><h1>HAFTALIK ${mode === 'teacher' ? 'ÖĞRETMEN' : 'GRUP'} DERS PROGRAMI</h1>
        <div class="ph"><div><b>${mode === 'teacher' ? 'Sayın:' : 'Grup:'}</b> ${esc(ent.name)}${S.institution ? ' – ' + esc(S.institution) : ''}<br>
        ${mode === 'teacher' ? `<b>Branş:</b> ${esc(ent.branch || '')}` : `<b>Tür:</b> ${TYPE_NAME[ent.type]}`}</div><div style="text-align:right">${new Date().getFullYear()}–${new Date().getFullYear() + 1} Ders Programı</div></div>
        <table><thead><tr><th class="day">Gün</th>`;
      for (let s = 0; s < maxS; s++) h += `<th>${s + 1}<br>${kinds.map((k) => (S.slots[k][s] ? S.slots[k][s].start : '')).join('<br>')}</th>`;
      h += '</tr></thead><tbody>';
      for (const d of days) {
        h += `<tr><th class="day">${esc(d.name)}</th>`;
        const slots = slotsOf(d.id);
        for (let s = 0; s < maxS; s++) {
          const sl = slots[s];
          if (!sl) { h += '<td></td>'; continue; }
          if (!sl.types.length) { h += '<td class="x"></td>'; continue; }
          const ps = map.get(ent.id + '|' + d.id + '|' + s);
          if (!ps) { h += '<td></td>'; continue; }
          const L = lesson(placements()[ps[0]].lessonId);
          h += mode === 'teacher'
            ? `<td class="f"><b>${esc((group(L.groupId) || {}).name)}</b><br>${esc(L.subject)}</td>`
            : `<td class="f"><b>${esc(L.subject)}</b><br>${esc((teacher(L.teacherId) || {}).name)}</td>`;
        }
        h += '</tr>';
      }
      return h + '</tbody></table></div>';
    };
    let html = '';
    if (kind === 'one') {
      const ent = ui.viewMode === 'teacher' ? teacher(ui.viewId) : group(ui.viewId);
      if (ent) html = page(ui.viewMode, ent);
    } else if (kind === 'teachers') html = state.teachers.slice().sort((a, b) => trCmp(a.name, b.name)).map((t) => page('teacher', t)).join('');
    else html = state.groups.slice().sort((a, b) => trCmp(a.name, b.name)).map((g) => page('group', g)).join('');
    $('#print').innerHTML = html;
    setTimeout(() => window.print(), 50);
  }

  // ---------- Olaylar ----------
  const actions = {
    tab: (el) => { ui.tab = el.dataset.v; ui.sel = null; render(); window.scrollTo(0, 0); },
    mode: (el) => { ui.viewMode = el.dataset.v; ui.viewId = null; ui.sel = null; render(); },
    layout: (el) => { ui.layout = el.dataset.v; ui.sel = null; render(); },
    goto: (el) => { ui.viewMode = el.dataset.mode; ui.viewId = el.dataset.v; ui.sel = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    solve: () => runSolve(),
    cell: (el) => {
      const p = el.dataset.p != null ? +el.dataset.p : null;
      if (ui.sel == null) { if (p != null) { ui.sel = p; render(); } return; }
      if (p === ui.sel) { ui.sel = null; render(); return; }
      tryMove(ui.sel, el.dataset.day, +el.dataset.slot, p);
    },
    unlockAll: () => { placements().forEach((p) => { p.locked = false; }); save(); render(); toast('Sabitlemeler kaldırıldı.'); },
    print: (el) => printPages(el.dataset.v),
    sample: () => { const go = () => { state = DP.sampleState(); ui.modal = null; ui.tab = 'program'; save(); render(); toast('Örnek veriler yüklendi.', 'ok'); runSolve(); }; if (state.lessons.length) ask('Mevcut verilerin yerine örnek veriler yüklensin mi?', go); else go(); },
    askYes: () => { const f = pendingYes; pendingYes = null; ui.modal = null; if (f) f(); else render(); },
    wipe: () => ask('Tüm öğretmen, grup, ders ve program silinsin mi? Ayarlar kalır.', () => { state = Object.assign(DP.emptyState(), { settings: state.settings }); save(); render(); toast('Veriler silindi.'); }, 'Sil'),
    export: () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'ders-programi-yedek-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    closeModal: () => { ui.modal = null; render(); },
    overlay: (el, ev) => { if (ev.target === el) { ui.modal = null; render(); } },
    editTeacher: (el) => { ui.modal = { html: teacherModal(el.dataset.id) }; render(); },
    saveTeacher: (el) => saveTeacher(el.dataset.id),
    toggleBlock: (el) => el.classList.toggle('off'),
    delTeacher: (el) => {
      const t = teacher(el.dataset.id); const n = state.lessons.filter((l) => l.teacherId === t.id).length;
      ask(`${t.name} silinsin mi?${n ? ` Ona bağlı ${n} ders de silinecek.` : ''}`, () => {
      state.teachers = state.teachers.filter((x) => x.id !== t.id);
      const ids = new Set(state.lessons.filter((l) => l.teacherId === t.id).map((l) => l.id));
      state.lessons = state.lessons.filter((l) => !ids.has(l.id));
      if (state.schedule) state.schedule.placements = state.schedule.placements.filter((p) => !ids.has(p.lessonId));
      commit();
      }, 'Sil');
    },
    editGroup: (el) => { ui.modal = { html: groupModal(el.dataset.id) }; render(); },
    saveGroup: (el) => saveGroup(el.dataset.id),
    delGroup: (el) => {
      const g = group(el.dataset.id); const n = state.lessons.filter((l) => l.groupId === g.id).length;
      ask(`${g.name} silinsin mi?${n ? ` ${n} dersi de silinecek.` : ''}`, () => {
      state.groups = state.groups.filter((x) => x.id !== g.id);
      const ids = new Set(state.lessons.filter((l) => l.groupId === g.id).map((l) => l.id));
      state.lessons = state.lessons.filter((l) => !ids.has(l.id));
      if (state.schedule) state.schedule.placements = state.schedule.placements.filter((p) => !ids.has(p.lessonId));
      commit();
      }, 'Sil');
    },
    goLessons: (el) => { ui.tab = 'lessons'; render(); const t = document.getElementById('g-' + el.dataset.id); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    editLesson: (el) => { ui.modal = { html: lessonModal(el.dataset.id, el.dataset.group) }; render(); },
    saveLesson: (el) => saveLesson(el.dataset.id),
    delLesson: (el) => {
      const l = lesson(el.dataset.id);
      ask(`${group(l.groupId).name} – ${l.subject} dersi silinsin mi?`, () => {
      state.lessons = state.lessons.filter((x) => x.id !== l.id);
      if (state.schedule) state.schedule.placements = state.schedule.placements.filter((p) => p.lessonId !== l.id);
      commit();
      }, 'Sil');
    },
    saveSettings: () => { readSettingsForm(); commit(); toast('Ayarlar kaydedildi.', 'ok'); },
    addSlot: (el) => { readSettingsForm(); const arr = state.settings.slots[el.dataset.kind]; const last = arr[arr.length - 1]; arr.push({ start: last ? last.end : '09:00', end: last ? last.end : '09:40', block: last ? last.block : 'Sabah', types: last ? last.types.slice() : [] }); commit(); },
    delSlot: (el) => {
      readSettingsForm();
      ask('Bu ders saati silinsin mi? Sonraki saatlerin numarası kayar, öğretmenlerin kapalı saatleri sıfırlanır; programı yeniden oluşturman gerekir.', () => {
      state.settings.slots[el.dataset.kind].splice(+el.dataset.s, 1);
      (state.teachers || []).forEach((t) => { t.blocked = []; });
      commit();
      }, 'Sil');
    },
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return; // change ile işlenir
    if (actions[a]) { if (a !== 'overlay') ev.preventDefault(); actions[a](el, ev); }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.act === 'pick') { ui.viewId = el.value; ui.sel = null; render(); }
    else if (el.dataset.act === 'keepLocked') { ui.keepLocked = el.checked; }
    else if (el.id === 'importFile' && el.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const s = JSON.parse(r.result);
          if (!s.settings || !Array.isArray(s.teachers)) throw new Error('Geçersiz dosya');
          state = s; save(); ui.tab = 'program'; render(); toast('Yedek yüklendi.', 'ok');
        } catch (e) { toast('Yedek okunamadı: ' + e.message, 'bad'); }
      };
      r.readAsText(el.files[0]);
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (ui.modal || ui.sel != null)) { ui.modal = null; ui.sel = null; render(); } });

  // İlk açılışta örnek verilerle hazır program
  render();
  if (!state.schedule && state.lessons.length) runSolve();
})();
