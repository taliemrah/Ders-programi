/* Veri modeli, varsayılan ayarlar, örnek veriler ve çözücü girdisi hazırlama */
(function () {
  const TYPES = [
    { id: 'mezun', name: 'Mezun' },
    { id: 'lise', name: 'Lise' },
    { id: 'ilk', name: 'İlköğretim' },
  ];

  // Dershanelerde okutulan dersler (öneri listesi; serbest yazım da yapılabilir)
  const SUBJECTS = [
    'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji', 'Fen Bilimleri',
    'Türkçe', 'Türk Dili ve Edebiyatı', 'Edebiyat', 'Tarih', 'T.C. İnkılap Tarihi ve Atatürkçülük',
    'Coğrafya', 'Sosyal Bilgiler', 'Felsefe', 'Mantık', 'Psikoloji', 'Sosyoloji',
    'Din Kültürü ve Ahlak Bilgisi', 'İngilizce', 'Almanca', 'Paragraf', 'Problemler',
  ];

  function uid() { return Math.random().toString(36).slice(2, 9); }

  function defaultSettings() {
    const sl = (start, end, block, types) => ({ start, end, block, types });
    const M = ['mezun'], L = ['lise', 'ilk'], I = ['ilk'], ALL = ['mezun', 'lise', 'ilk'];
    return {
      institution: 'Mfbplus',
      days: [
        { id: 'pzt', name: 'Pazartesi', kind: 'hi', active: true },
        { id: 'sal', name: 'Salı', kind: 'hi', active: true },
        { id: 'car', name: 'Çarşamba', kind: 'hi', active: true },
        { id: 'per', name: 'Perşembe', kind: 'hi', active: true },
        { id: 'cum', name: 'Cuma', kind: 'hi', active: false },
        { id: 'cmt', name: 'Cumartesi', kind: 'cmt', active: true },
        { id: 'paz', name: 'Pazar', kind: 'cmt', active: false },
      ],
      slots: {
        hi: [
          sl('09:00', '09:40', 'Sabah', M),
          sl('09:50', '10:30', 'Sabah', M),
          sl('10:50', '11:30', 'Sabah', M),
          sl('11:40', '12:20', 'Sabah', M),
          sl('12:30', '13:10', 'Sabah', M),
          sl('14:00', '14:40', 'Birebir', []),
          sl('14:50', '15:30', 'Birebir', []),
          sl('16:00', '16:40', 'Akşam', I),
          sl('16:45', '17:20', 'Akşam', L),
          sl('17:25', '18:00', 'Akşam', L),
          sl('18:05', '18:40', 'Akşam', L),
          sl('18:45', '19:20', 'Akşam', L),
          sl('19:25', '20:00', 'Akşam', L),
        ],
        cmt: [
          sl('08:30', '09:10', 'Sabah', ALL),
          sl('09:20', '10:00', 'Sabah', ALL),
          sl('10:10', '10:50', 'Sabah', ALL),
          sl('11:00', '11:40', 'Sabah', ALL),
          sl('11:50', '12:30', 'Sabah', ALL),
          sl('12:40', '13:20', 'Sabah', ALL),
          sl('14:00', '14:40', 'Öğleden sonra', ALL),
          sl('14:50', '15:30', 'Öğleden sonra', ALL),
          sl('15:40', '16:20', 'Öğleden sonra', ALL),
          sl('16:30', '17:10', 'Öğleden sonra', ALL),
          sl('17:20', '18:00', 'Öğleden sonra', ALL),
          sl('18:10', '18:50', 'Öğleden sonra', ALL),
        ],
      },
    };
  }

  function sampleState() {
    const settings = defaultSettings();
    const T = (name, branch, dayCount, days) => ({ id: uid(), name, branch, dayCount, days, blocked: [] });
    const allDays = ['pzt', 'sal', 'car', 'per', 'cmt'];
    const teachers = [
      T('Emrah Tali', 'Fizik', 4, ['sal', 'car', 'per', 'cmt']),
      T('Örnek Matematik 1', 'Matematik', 5, allDays),
      T('Örnek Matematik 2', 'Matematik', 4, allDays),
      T('Örnek Geometri', 'Geometri', 3, allDays),
      T('Örnek Kimya', 'Kimya', 4, allDays),
      T('Örnek Biyoloji', 'Biyoloji', 4, allDays),
      T('Örnek Edebiyat', 'Türk Dili ve Edebiyatı', 4, allDays),
      T('Örnek Fen Bilgisi', 'Fen Bilimleri', 3, allDays),
      T('Örnek İlköğretim Mat.', 'Matematik', 3, allDays),
      T('Örnek Tarih', 'Tarih', 3, allDays),
      T('Örnek Coğrafya', 'Coğrafya', 3, allDays),
      T('Örnek Sosyal Bilgiler', 'Sosyal Bilgiler', 2, allDays),
    ];
    const tid = (n) => teachers.find((t) => t.name === n).id;
    const G = (name, type) => ({ id: uid(), name, type });
    const groups = [
      G('13G', 'mezun'), G('13H', 'mezun'), G('13 SAY3', 'mezun'),
      G('12J', 'lise'), G('12H', 'lise'),
      G('11G', 'lise'), G('11I', 'lise'), G('11 SAY3', 'lise'),
      G('10. Sınıf', 'lise'), G('9. Sınıf', 'lise'),
      G('8A', 'ilk'), G('7A', 'ilk'),
    ];
    const gid = (n) => groups.find((g) => g.name === n).id;
    const lessons = [];
    const L = (g, subject, teacher, hours, maxPerDay = 2) =>
      lessons.push({ id: uid(), groupId: gid(g), subject, teacherId: tid(teacher), hours, maxPerDay });

    // Fizik saatleri Emrah Hoca'nın gerçek programından (toplam 29)
    [['13G', 4], ['13H', 4], ['13 SAY3', 4], ['12J', 3], ['12H', 3], ['11G', 3], ['11I', 3], ['11 SAY3', 3], ['10. Sınıf', 1], ['9. Sınıf', 1]]
      .forEach(([g, h]) => L(g, 'Fizik', 'Emrah Tali', h));

    // Örnek diğer dersler
    for (const g of ['13G', '13H', '13 SAY3']) {
      L(g, 'Matematik', g === '13 SAY3' ? 'Örnek Matematik 2' : 'Örnek Matematik 1', 6, 3);
      L(g, 'Geometri', 'Örnek Geometri', 3);
      L(g, 'Kimya', 'Örnek Kimya', 3);
      L(g, 'Biyoloji', 'Örnek Biyoloji', 3);
      L(g, 'Edebiyat', 'Örnek Edebiyat', 3);
    }
    for (const g of ['12J', '12H']) {
      L(g, 'Matematik', 'Örnek Matematik 2', 4);
      L(g, 'Geometri', 'Örnek Geometri', 2);
      L(g, 'Kimya', 'Örnek Kimya', 2);
      L(g, 'Biyoloji', 'Örnek Biyoloji', 2);
      L(g, 'Edebiyat', 'Örnek Edebiyat', 2);
    }
    for (const g of ['11G', '11I', '11 SAY3']) {
      L(g, 'Matematik', g === '11 SAY3' ? 'Örnek Matematik 2' : 'Örnek Matematik 1', 4);
      L(g, 'Kimya', 'Örnek Kimya', 2);
      L(g, 'Biyoloji', 'Örnek Biyoloji', 2);
      L(g, 'Edebiyat', 'Örnek Edebiyat', 2);
    }
    for (const g of ['10. Sınıf', '9. Sınıf']) {
      L(g, 'Matematik', 'Örnek Matematik 1', 3);
      L(g, 'Kimya', 'Örnek Kimya', 1);
      L(g, 'Biyoloji', 'Örnek Biyoloji', 1);
      L(g, 'Edebiyat', 'Örnek Edebiyat', 2);
    }
    for (const g of ['8A', '7A']) {
      L(g, 'Matematik', 'Örnek İlköğretim Mat.', 4);
      L(g, 'Fen Bilimleri', 'Örnek Fen Bilgisi', 3);
      L(g, 'Türkçe', 'Örnek Edebiyat', 2);
    }
    // Sözel dersler
    L('8A', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'Örnek Sosyal Bilgiler', 2);
    L('7A', 'Sosyal Bilgiler', 'Örnek Sosyal Bilgiler', 2);
    for (const g of ['13G', '13H', '13 SAY3']) {
      L(g, 'Tarih', 'Örnek Tarih', 2);
      L(g, 'Coğrafya', 'Örnek Coğrafya', 2);
    }
    for (const g of ['12J', '12H', '11G', '11I', '11 SAY3', '10. Sınıf', '9. Sınıf']) {
      L(g, 'Tarih', 'Örnek Tarih', 1);
      L(g, 'Coğrafya', 'Örnek Coğrafya', 1);
    }
    return { version: 1, settings, teachers, groups, lessons, schedule: null };
  }

  function emptyState() {
    return { version: 1, settings: defaultSettings(), teachers: [], groups: [], lessons: [], schedule: null };
  }

  /* Durumdan çözücü girdisi üret. Dönen meta, sonucu geri çevirmek için. */
  function buildSolverInput(state, opts = {}) {
    const S = state.settings;
    const activeDays = S.days.filter((d) => d.active);
    const dayIdx = new Map(activeDays.map((d, i) => [d.id, i]));
    const days = activeDays.map((d) => ({ slots: S.slots[d.kind].map((x) => ({ block: x.block, types: x.types })) }));
    const tIdx = new Map(state.teachers.map((t, i) => [t.id, i]));
    const gIdx = new Map(state.groups.map((g, i) => [g.id, i]));
    const teachers = state.teachers.map((t) => ({
      dayCount: t.dayCount,
      days: t.days.filter((d) => dayIdx.has(d)).map((d) => dayIdx.get(d)),
      blocked: (t.blocked || []).filter((k) => dayIdx.has(k.split('|')[0])).map((k) => { const [d, s] = k.split('|'); return dayIdx.get(d) + '|' + s; }),
    }));
    const groups = state.groups.map((g) => ({ type: g.type, blocked: [] }));
    const subjKey = new Map();
    const items = [];
    const itemLesson = [];
    // Kilitli yerleşimler (elle sabitlenmiş)
    const locked = {};
    if (opts.keepLocked && state.schedule) {
      for (const p of state.schedule.placements) if (p.locked) (locked[p.lessonId] = locked[p.lessonId] || []).push(p);
    }
    for (const L of state.lessons) {
      if (!tIdx.has(L.teacherId) || !gIdx.has(L.groupId)) continue;
      const sk = L.groupId + '|' + L.subject.trim().toLocaleLowerCase('tr');
      if (!subjKey.has(sk)) subjKey.set(sk, subjKey.size);
      const lk = (locked[L.id] || []).slice();
      for (let h = 0; h < L.hours; h++) {
        const lp = lk.shift();
        items.push({
          lesson: L.id, t: tIdx.get(L.teacherId), g: gIdx.get(L.groupId), subj: subjKey.get(sk),
          maxPerDay: L.maxPerDay || 2,
          fixed: lp && dayIdx.has(lp.day) ? [dayIdx.get(lp.day), lp.slot] : null,
        });
        itemLesson.push(L.id);
      }
    }
    return { input: { days, teachers, groups, items }, meta: { activeDays, itemLesson, items } };
  }

  function resultToPlacements(res, meta) {
    return res.positions.map(([d, s], i) => ({
      lessonId: meta.itemLesson[i],
      day: d >= 0 ? meta.activeDays[d].id : null,
      slot: d >= 0 ? s : null,
      locked: !!meta.items[i].fixed,
    }));
  }

  const api = { TYPES, SUBJECTS, uid, defaultSettings, sampleState, emptyState, buildSolverInput, resultToPlacements };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.DP = api;
})();
