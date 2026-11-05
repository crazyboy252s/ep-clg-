
'use strict';

/* AttendAI v3
   One source of truth:
   - baseline[subjectId] contains totals from before AttendAI.
   - records[date].classes contains period-by-period records entered in AttendAI.
   Stats combine those two sources exactly once.
*/
const STORAGE_KEY = 'attendai_data_v3';
const LEGACY_KEYS = ['attendai_clean_v1', 'attendai_v2_data'];
const WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const DEFAULT_DATA = {"app":"AttendAI","schemaVersion":3,"target":75,"subjects":[{"id":"pic-cs","name":"PIC-CS","short":"PIC-CS","color":"#9875ff"},{"id":"estud","name":"ESTUD","short":"ESTUD","color":"#35b8a5"},{"id":"boeee","name":"BOEEE","short":"BOEEE","color":"#e5a34b"},{"id":"lalg","name":"L.ALG","short":"L.ALG","color":"#5d9cec"},{"id":"enggphy","name":"ENGGPHY","short":"ENGGPHY","color":"#df7d9c"},{"id":"pic-cs-i","name":"PIC-CS-I","short":"PIC-CS-I","color":"#8bba68"},{"id":"aaitcs","name":"AAITCS","short":"AAITCS","color":"#b58cff"},{"id":"boeee-i","name":"BOEEE-I","short":"BOEEE-I","color":"#f0a45d"},{"id":"epacskls","name":"EPACSKLS","short":"EPACSKLS","color":"#69b7e8"},{"id":"uhval","name":"UHVAL","short":"UHVAL","color":"#4db6ac"},{"id":"enggphy-i","name":"ENGGPHY-I","short":"ENGGPHY-I","color":"#e78aaa"},{"id":"coind","name":"COIND","short":"COIND","color":"#8c9eff"},{"id":"icah","name":"ICAH","short":"ICAH","color":"#c0a0e8"}],"timetable":{"Monday":[{"subjectId":"aaitcs","periods":2},{"subjectId":"boeee","periods":1},{"subjectId":"pic-cs-i","periods":1},{"subjectId":"uhval","periods":1},{"subjectId":"lalg","periods":1}],"Tuesday":[{"subjectId":"estud","periods":1},{"subjectId":"coind","periods":1},{"subjectId":"lalg","periods":1},{"subjectId":"enggphy-i","periods":2},{"subjectId":"pic-cs","periods":1}],"Wednesday":[{"subjectId":"pic-cs-i","periods":2},{"subjectId":"enggphy","periods":1},{"subjectId":"boeee-i","periods":2},{"subjectId":"epacskls","periods":1}],"Thursday":[{"subjectId":"epacskls","periods":1},{"subjectId":"boeee","periods":1},{"subjectId":"enggphy","periods":1},{"subjectId":"estud","periods":1},{"subjectId":"lalg","periods":2}],"Friday":[{"subjectId":"epacskls","periods":2},{"subjectId":"icah","periods":1},{"subjectId":"estud","periods":1},{"subjectId":"pic-cs-i","periods":2}],"Saturday":[{"subjectId":"aaitcs","periods":2},{"subjectId":"lalg","periods":1},{"subjectId":"enggphy","periods":1},{"subjectId":"coind","periods":1},{"subjectId":"estud","periods":1}]},"baseline":{"pic-cs":{"present":21,"absent":9,"cancelled":0},"estud":{"present":30,"absent":8,"cancelled":0},"boeee":{"present":25,"absent":3,"cancelled":0},"lalg":{"present":49,"absent":9,"cancelled":0},"enggphy":{"present":29,"absent":11,"cancelled":0},"pic-cs-i":{"present":23,"absent":10,"cancelled":0},"aaitcs":{"present":26,"absent":10,"cancelled":0},"boeee-i":{"present":16,"absent":4,"cancelled":0},"epacskls":{"present":29,"absent":12,"cancelled":0},"uhval":{"present":12,"absent":1,"cancelled":0},"enggphy-i":{"present":15,"absent":0,"cancelled":0},"coind":{"present":19,"absent":3,"cancelled":0},"icah":{"present":6,"absent":4,"cancelled":0}},"records":{},"sourceNote":"Imported from the user's attendance report dated 04-11-2026, covering 01-08-2026 to 04-11-2026. Only subjects with non-zero conducted hours and an aggregate present/total figure are included. Counts are stored as previous totals in baseline; daily records are empty to prevent double-counting. Subjects with '-' in the report (no reported count) are not added. Weekly timetable seeded from the Vignan Hyderabad Campus Section 10 CSE timetable effective 06-08-2026. Thursday final slot is LALG (T), confirmed by user."};
const SAFE_LIMIT = 75;
const DANGER_LIMIT = 60;
function attendanceZone(pct) { return pct < DANGER_LIMIT ? 'danger' : pct < SAFE_LIMIT ? 'warning' : 'safe'; }
function zoneLabel(pct) { return pct < DANGER_LIMIT ? 'DANGER ZONE' : pct < SAFE_LIMIT ? 'WARNING ZONE' : 'SAFE ZONE'; }

function freshState() {
  return { schemaVersion: 3, target: 75, subjects: [], timetable: {}, baseline: {}, records: {} };
}
function makeId() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() :
    'sub_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,9);
}
function normalizeCounts(value) {
  const n = v => Math.max(0, Math.floor(Number(v) || 0));
  return { present: n(value?.present ?? value?.p), absent: n(value?.absent ?? value?.a), cancelled: n(value?.cancelled ?? value?.c) };
}
function migrateLegacy(raw) {
  const next = freshState();
  next.target = Math.min(100, Math.max(1, Number(raw?.target) || 75));
  next.subjects = Array.isArray(raw?.subjects) ? raw.subjects.map((s, i) => ({
    id: String(s.id || ('legacy_' + i + '_' + Date.now())),
    name: String(s.name || 'Untitled subject'),
    short: String(s.short || ''),
    color: /^#[0-9a-f]{6}$/i.test(s.color || '') ? s.color : '#9875ff'
  })) : [];
  const subjectIds = new Set(next.subjects.map(s => s.id));
  if (raw?.timetable && typeof raw.timetable === 'object') {
    for (const [day, entries] of Object.entries(raw.timetable)) {
      if (!Array.isArray(entries)) continue;
      const cleanDay = WEEKDAYS.includes(day) ? day : null;
      if (!cleanDay) continue;
      next.timetable[cleanDay] = entries.map(x => {
        const id = String(x.subjectId || x.id || x.sid || '');
        return { subjectId: id, periods: Math.max(1, Math.min(15, Number(x.periods ?? x.n ?? x.count) || 1)) };
      }).filter(x => subjectIds.has(x.subjectId));
    }
  }
  const oldBaseline = raw?.baseline || {};
  for (const subjectId of subjectIds) {
    const b = oldBaseline[subjectId];
    if (b) next.baseline[subjectId] = normalizeCounts(b);
  }
  if (raw?.records && typeof raw.records === 'object') {
    for (const [date, record] of Object.entries(raw.records)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      // New-format record already present.
      if (record && Array.isArray(record.classes)) {
        next.records[date] = record;
        continue;
      }
      // Older builds stored records as { subjectId: ["P","A",...] }.
      if (record && typeof record === 'object') {
        const classes = [];
        for (const [subjectId, marks] of Object.entries(record)) {
          if (!subjectIds.has(subjectId) || !Array.isArray(marks)) continue;
          const cleanMarks = marks.map(m => ['P','A','C'].includes(m) ? m : '');
          if (cleanMarks.length) classes.push({ subjectId, periods: cleanMarks.length, marks: cleanMarks });
        }
        if (classes.length) next.records[date] = { kind: 'college', attendanceIntent: 'migrated', classes, note: '', migrated: true };
      }
    }
  }
  return next;
}
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const base = freshState();
      const restored = { ...base, ...parsed, baseline: parsed.baseline || {}, timetable: parsed.timetable || {}, records: parsed.records || {} };
      // If an earlier AttendAI install already has the imported totals but no timetable,
      // safely add the official seeded timetable without touching attendance history.
      if (!Object.values(restored.timetable).some(entries => Array.isArray(entries) && entries.length)) {
        restored.timetable = clone(DEFAULT_DATA.timetable);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
      }
      return restored;
    }
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) {
        const migrated = migrateLegacy(JSON.parse(legacy));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch (error) {
    console.error('AttendAI data could not be loaded:', error);
  }
  const seeded = clone(DEFAULT_DATA);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}
let state = loadState();
let editingSubjectId = null;
let toastTimer = null;

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    return true;
  } catch (error) {
    console.error(error);
    showToast('Could not save. Export a backup or free browser storage.');
    return false;
  }
}
function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2400);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function parseDate(key) {
  const [y,m,d] = key.split('-').map(Number);
  return new Date(y, m-1, d, 12, 0, 0);
}
function prettyDate(key) {
  return parseDate(key).toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'short', year:'numeric' });
}
function weekdayFor(key) {
  return parseDate(key).toLocaleDateString('en-US', { weekday:'long' });
}
function subjectById(id) {
  return state.subjects.find(subject => subject.id === id) || null;
}
function scheduleForDate(key) {
  const day = weekdayFor(key);
  return (state.timetable[day] || []).map(entry => ({ ...entry }));
}
function getDateRecord(key) {
  return state.records[key] || null;
}
function makeRecordFromTimetable(key) {
  const scheduled = scheduleForDate(key);
  if (!scheduled.length) return null;
  return {
    kind: 'college',
    attendanceIntent: 'not-marked',
    classes: scheduled.map(entry => ({
      subjectId: entry.subjectId,
      periods: entry.periods,
      marks: Array(entry.periods).fill('')
    })),
    note: ''
  };
}
function ensureRecord(key) {
  if (!state.records[key]) state.records[key] = makeRecordFromTimetable(key);
  return state.records[key] || null;
}
function totalForSubject(subjectId) {
  const base = normalizeCounts(state.baseline[subjectId] || {});
  let present = base.present, absent = base.absent, cancelled = base.cancelled;
  for (const record of Object.values(state.records)) {
    if (!record || record.kind !== 'college' || !Array.isArray(record.classes)) continue;
    for (const entry of record.classes) {
      if (entry.subjectId !== subjectId || !Array.isArray(entry.marks)) continue;
      for (const mark of entry.marks) {
        if (mark === 'P') present++;
        else if (mark === 'A') absent++;
        else if (mark === 'C') cancelled++;
      }
    }
  }
  const counted = present + absent; // Cancelled and unmarked periods are not in the denominator.
  return { present, absent, cancelled, counted, percentage: counted ? (present / counted) * 100 : 0 };
}
function overallStats() {
  return state.subjects.reduce((sum, subject) => {
    const stats = totalForSubject(subject.id);
    sum.present += stats.present; sum.absent += stats.absent; sum.cancelled += stats.cancelled;
    return sum;
  }, { present:0, absent:0, cancelled:0 });
}
function formatPct(value) {
  return `${(Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '')}%`;
}
function setPage(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  document.querySelectorAll('.bottom-nav button').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  if (page === 'attendance') {
    if (!$('attendanceDate').value) $('attendanceDate').value = dateKey();
    renderAttendancePage();
  }
  if (page === 'timetable') renderTimetable();
  if (page === 'simulator') renderSimulator();
  if (page === 'subjects') renderSubjectsPage();
}
document.querySelectorAll('.bottom-nav [data-page]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.page)));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.go)));
$('settingsShortcut').addEventListener('click', () => setPage('settings'));

/* Subject management */
function resetSubjectForm() {
  editingSubjectId = null;
  $('subjectName').value = '';
  $('subjectShort').value = '';
  $('subjectColor').value = '#9875ff';
  $('subjectFormHeading').textContent = 'Add a subject';
  $('saveSubjectBtn').textContent = '＋ Save subject';
  $('cancelSubjectEdit').hidden = true;
}
function saveSubject() {
  const name = $('subjectName').value.trim();
  if (!name) { showToast('Enter a subject name first.'); $('subjectName').focus(); return; }
  const duplicate = state.subjects.find(s => s.name.toLocaleLowerCase() === name.toLocaleLowerCase() && s.id !== editingSubjectId);
  if (duplicate) { showToast('That subject already exists. Edit the existing subject instead.'); return; }
  const fields = {
    name,
    short: $('subjectShort').value.trim(),
    color: /^#[0-9a-f]{6}$/i.test($('subjectColor').value) ? $('subjectColor').value : '#9875ff'
  };
  if (editingSubjectId) {
    const existing = subjectById(editingSubjectId);
    if (!existing) { showToast('Subject no longer exists. Please add it again.'); resetSubjectForm(); return; }
    Object.assign(existing, fields);
  } else {
    state.subjects.push({ id: makeId(), ...fields });
  }
  resetSubjectForm();
  if (saveState()) showToast('Subject saved successfully.');
}
$('saveSubjectBtn').addEventListener('click', saveSubject);
$('cancelSubjectEdit').addEventListener('click', resetSubjectForm);
$('subjectName').addEventListener('keydown', event => { if (event.key === 'Enter') saveSubject(); });
function beginEditSubject(id) {
  const subject = subjectById(id);
  if (!subject) return;
  editingSubjectId = id;
  $('subjectName').value = subject.name;
  $('subjectShort').value = subject.short || '';
  $('subjectColor').value = subject.color || '#9875ff';
  $('subjectFormHeading').textContent = 'Edit subject';
  $('saveSubjectBtn').textContent = 'Save changes';
  $('cancelSubjectEdit').hidden = false;
  window.scrollTo({ top:0, behavior:'smooth' });
}
function deleteSubject(id) {
  const subject = subjectById(id);
  if (!subject) return;
  if (!confirm(`Delete "${subject.name}" and all of its attendance records? This cannot be undone. Export a backup first if needed.`)) return;
  state.subjects = state.subjects.filter(s => s.id !== id);
  delete state.baseline[id];
  for (const day of Object.keys(state.timetable)) {
    state.timetable[day] = (state.timetable[day] || []).filter(entry => entry.subjectId !== id);
  }
  for (const record of Object.values(state.records)) {
    if (record?.classes) record.classes = record.classes.filter(entry => entry.subjectId !== id);
  }
  resetSubjectForm();
  saveState();
  showToast('Subject and its records deleted.');
}
function savePreviousTotals(id) {
  const read = field => Math.max(0, Math.floor(Number($(field).value) || 0));
  state.baseline[id] = {
    present: read(`basePresent_${id}`),
    absent: read(`baseAbsent_${id}`),
    cancelled: read(`baseCancelled_${id}`)
  };
  saveState();
  const subject = subjectById(id);
  showToast(`Previous totals saved${subject ? ' for ' + subject.name : ''}.`);
}
function renderBaselineEditors() {
  const host = $('baselineEditors');
  if (!state.subjects.length) {
    host.innerHTML = '<div class="empty">Add a subject first. Its previous totals form will appear here.</div>';
    return;
  }
  host.innerHTML = state.subjects.map(subject => {
    const base = normalizeCounts(state.baseline[subject.id] || {});
    return `<div class="subject-item">
      <h3><span class="subject-dot" style="background:${subject.color}"></span>${escapeHtml(subject.name)}</h3>
      <div class="form-grid">
        <div class="field"><label for="basePresent_${subject.id}">Previously present</label><input id="basePresent_${subject.id}" type="number" min="0" step="1" inputmode="numeric" value="${base.present}"></div>
        <div class="field"><label for="baseAbsent_${subject.id}">Previously absent</label><input id="baseAbsent_${subject.id}" type="number" min="0" step="1" inputmode="numeric" value="${base.absent}"></div>
      </div>
      <div class="field"><label for="baseCancelled_${subject.id}">Previously cancelled</label><input id="baseCancelled_${subject.id}" type="number" min="0" step="1" inputmode="numeric" value="${base.cancelled}"></div>
      <button class="btn secondary full" data-action="save-baseline" data-id="${escapeHtml(subject.id)}">Save previous totals</button>
      <p class="hint">Currently saved: ${base.present} present · ${base.absent} absent · ${base.cancelled} cancelled</p>
    </div>`;
  }).join('');
}

/* Timetable management */
function renderSubjectSelect(select, placeholder) {
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` +
    state.subjects.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
  if (state.subjects.some(s => s.id === current)) select.value = current;
  select.disabled = state.subjects.length === 0;
}
function saveTimetableEntry() {
  const day = $('ttDay').value;
  const subjectId = $('ttSubject').value;
  const periods = Math.max(1, Math.min(15, Math.floor(Number($('ttPeriods').value) || 1)));
  if (!subjectById(subjectId)) { showToast('Add a subject before making a timetable.'); setPage('subjects'); return; }
  state.timetable[day] ||= [];
  const existing = state.timetable[day].find(entry => entry.subjectId === subjectId);
  if (existing) existing.periods = periods;
  else state.timetable[day].push({ subjectId, periods });
  saveState();
  showToast(`${subjectById(subjectId).name} saved for ${day}.`);
}
$('saveTimetableBtn').addEventListener('click', saveTimetableEntry);
function removeTimetableEntry(day, subjectId) {
  state.timetable[day] = (state.timetable[day] || []).filter(entry => entry.subjectId !== subjectId);
  saveState();
  showToast('Timetable entry removed. Existing dated records are unchanged.');
}
function renderTimetable() {
  renderSubjectSelect($('ttSubject'), state.subjects.length ? 'Choose a subject' : 'Add a subject first');
  const host = $('weeklyTimetable');
  host.innerHTML = WEEKDAYS.map(day => {
    const entries = state.timetable[day] || [];
    const content = entries.length ? entries.map(entry => {
      const subject = subjectById(entry.subjectId);
      if (!subject) return '';
      return `<div class="list-item row between">
        <div><strong><span class="subject-dot" style="background:${subject.color}"></span>${escapeHtml(subject.name)}</strong><div class="small muted">${entry.periods} period${entry.periods === 1 ? '' : 's'}</div></div>
        <button class="btn danger sm" data-action="remove-timetable" data-day="${day}" data-id="${escapeHtml(subject.id)}">Remove</button>
      </div>`;
    }).join('') : '<div class="empty">No classes scheduled.</div>';
    return `<div class="card"><div class="card-head"><h2 style="margin:0">${day}</h2><span class="pill">${entries.reduce((sum,e)=>sum+e.periods,0)} periods</span></div>${content}</div>`;
  }).join('');
}

/* Daily attendance: each date stores a snapshot of its classes. Later timetable edits
   do not rewrite past records. A holiday is a separate record with no counted classes. */
function loadScheduledDay(key) {
  if (!state.subjects.length) { showToast('Add subjects first.'); setPage('subjects'); return; }
  const existing = state.records[key];
  if (existing && existing.kind === 'college') {
    showToast('This date already has a record. You can edit its periods below.');
    renderAttendancePage();
    return;
  }
  if (existing && existing.kind === 'holiday') {
    if (!confirm('This date is marked as a holiday. Replace it with the timetable?')) return;
  }
  const record = makeRecordFromTimetable(key);
  if (!record) {
    showToast(`No timetable entries for ${weekdayFor(key)}. Add classes to the timetable or add a class manually below.`);
    state.records[key] = { kind:'college', attendanceIntent:'not-marked', classes:[], note:'' };
    saveState();
    renderAttendancePage();
    return;
  }
  state.records[key] = record;
  saveState();
  renderAttendancePage();
  showToast(`Loaded ${record.classes.length} subject(s) for ${prettyDate(key)}.`);
}
function markTodayGoing() {
  const key = dateKey();
  if (!scheduleForDate(key).length && !state.records[key]) {
    showToast(`No classes are scheduled for ${weekdayFor(key)}. Add today's classes in Timetable first.`);
    setPage('timetable');
    return;
  }
  if (!state.records[key] || state.records[key].kind !== 'college') {
    if (state.records[key]?.kind === 'holiday' && !confirm('Today is marked as a holiday. Replace it with college attendance?')) return;
    state.records[key] = makeRecordFromTimetable(key) || { kind:'college', attendanceIntent:'going', classes:[], note:'' };
  }
  state.records[key].attendanceIntent = 'going';
  saveState();
  setPage('attendance');
  $('attendanceDate').value = key;
  renderAttendancePage();
  showToast('Mark each period Present, Absent or Cancelled.');
}
function markTodayNotGoing() {
  const key = dateKey();
  const existing = state.records[key];
  if (existing?.kind === 'college' && existing.classes?.some(c => c.marks?.some(m => m))) {
    if (!confirm('Replace today’s existing marks with Absent for every scheduled period?')) return;
  }
  let record = makeRecordFromTimetable(key);
  if (!record && existing?.kind === 'college') record = existing;
  if (!record) {
    showToast(`No classes are scheduled for ${weekdayFor(key)}. Nothing to mark absent.`);
    setPage('timetable'); return;
  }
  record.attendanceIntent = 'not-going';
  record.classes.forEach(entry => { entry.marks = Array(entry.periods).fill('A'); });
  state.records[key] = record;
  saveState();
  setPage('attendance');
  $('attendanceDate').value = key;
  renderAttendancePage();
  showToast('Today’s scheduled periods marked Absent. You can change them anytime.');
}
$('todayYes').addEventListener('click', markTodayGoing);
$('todayNo').addEventListener('click', () => {
  if (confirm('Mark every scheduled period today as Absent? You can edit each period afterwards.')) markTodayNotGoing();
});
function setPeriodMark(key, classIndex, periodIndex, mark) {
  const record = state.records[key];
  if (!record || record.kind !== 'college' || !record.classes[classIndex]) return;
  const entry = record.classes[classIndex];
  if (periodIndex < 0 || periodIndex >= entry.periods) return;
  entry.marks[periodIndex] = mark;
  record.attendanceIntent = 'custom';
  saveState();
  renderAttendancePage();
}
function addManualClass(key) {
  const subjectId = $('manualSubject').value;
  const subject = subjectById(subjectId);
  const periods = Math.max(1, Math.min(15, Math.floor(Number($('manualPeriods').value) || 1)));
  if (!subject) { showToast('Choose a subject first.'); return; }
  let record = state.records[key];
  if (!record || record.kind !== 'college') {
    record = { kind:'college', attendanceIntent:'custom', classes:[], note:'' };
    state.records[key] = record;
  }
  const found = record.classes.find(item => item.subjectId === subjectId);
  if (found) {
    if (!confirm(`${subject.name} already exists on this date. Add ${periods} more period(s) to it?`)) return;
    found.periods += periods;
    found.marks.push(...Array(periods).fill(''));
  } else {
    record.classes.push({ subjectId, periods, marks:Array(periods).fill('') });
  }
  saveState();
  renderAttendancePage();
  showToast('Class added to this date.');
}
function removeClassFromRecord(key, classIndex) {
  const record = state.records[key];
  if (!record || !record.classes[classIndex]) return;
  if (!confirm('Remove this subject’s periods from this date? Its attendance marks will be removed too.')) return;
  record.classes.splice(classIndex, 1);
  saveState();
  renderAttendancePage();
}
function markHoliday(key) {
  const existing = state.records[key];
  if (existing?.kind === 'college' && existing.classes?.some(c => c.marks?.some(m => m))) {
    if (!confirm('This date already has attendance marks. Replace them with a holiday record?')) return;
  }
  state.records[key] = { kind:'holiday', note:'Holiday', classes:[] };
  saveState();
  renderAttendancePage();
  showToast(`${prettyDate(key)} marked as a holiday.`);
}
function clearDateRecord(key) {
  if (!state.records[key]) return;
  if (!confirm('Delete this date’s record? This removes all marks entered for that date.')) return;
  delete state.records[key];
  saveState();
  renderAttendancePage();
}
function renderAttendancePage() {
  const key = $('attendanceDate').value || dateKey();
  const record = getDateRecord(key);
  const host = $('dateRecordPanel');
  if (!record) {
    const hasSchedule = scheduleForDate(key).length > 0;
    host.innerHTML = `<div class="inline-note">${hasSchedule ? `Timetable found for ${weekdayFor(key)}. Load it to mark this date.` : `No saved attendance record and no timetable for ${weekdayFor(key)}.`}</div>
      <button class="btn full" id="loadDateSchedule" style="margin-top:12px">${hasSchedule ? 'Load this date’s timetable' : 'Create an empty day record'}</button>
      <button class="btn secondary full" id="holidayDateBtn" style="margin-top:8px">Mark as holiday / no college</button>
      <p class="hint">You can also add a subject and its periods manually after creating the day record.</p>`;
    $('loadDateSchedule').addEventListener('click', () => loadScheduledDay(key));
    $('holidayDateBtn').addEventListener('click', () => markHoliday(key));
  } else if (record.kind === 'holiday') {
    host.innerHTML = `<div class="inline-note">🌤️ This date is marked as a holiday / no college. It does not add present or absent classes.</div>
      <button class="btn secondary full" id="replaceHolidayBtn" style="margin-top:12px">Replace with this weekday’s timetable</button>
      <button class="btn danger full" id="deleteDateBtn" style="margin-top:8px">Delete holiday record</button>`;
    $('replaceHolidayBtn').addEventListener('click', () => loadScheduledDay(key));
    $('deleteDateBtn').addEventListener('click', () => clearDateRecord(key));
  } else {
    const items = (record.classes || []).map((entry, classIndex) => {
      const subject = subjectById(entry.subjectId);
      if (!subject) return '';
      const marks = Array.isArray(entry.marks) ? entry.marks : [];
      let periods = '';
      for (let periodIndex=0; periodIndex<entry.periods; periodIndex++) {
        const mark = marks[periodIndex] || '';
        const label = mark === 'P' ? 'Present' : mark === 'A' ? 'Absent' : mark === 'C' ? 'Cancelled' : 'Not marked';
        periods += `<div class="period-card">
          <div class="row between"><span class="small">Period ${periodIndex+1}</span><span class="status ${mark || 'empty'}">${label}</span></div>
          <div class="actions">
            <button class="${mark==='P'?'active-p':''}" data-action="mark-period" data-date="${key}" data-class="${classIndex}" data-period="${periodIndex}" data-mark="P">✓ Present</button>
            <button class="${mark==='A'?'active-a':''}" data-action="mark-period" data-date="${key}" data-class="${classIndex}" data-period="${periodIndex}" data-mark="A">✕ Absent</button>
            <button class="${mark==='C'?'active-c':''}" data-action="mark-period" data-date="${key}" data-class="${classIndex}" data-period="${periodIndex}" data-mark="C">— Cancelled</button>
          </div>
        </div>`;
      }
      return `<div class="subject-item">
        <div class="row between"><h3><span class="subject-dot" style="background:${subject.color}"></span>${escapeHtml(subject.name)}</h3><button class="btn danger sm" data-action="remove-date-class" data-date="${key}" data-class="${classIndex}">Remove</button></div>
        <p class="hint">${entry.periods} period(s)</p>${periods}
      </div>`;
    }).join('');
    host.innerHTML = `<div class="row between wrap"><strong>${prettyDate(key)}</strong><span class="pill">${record.attendanceIntent === 'not-going' ? 'Not going' : record.attendanceIntent === 'going' ? 'Going' : 'Attendance record'}</span></div>
      ${items || '<div class="empty">No classes are attached to this date yet.</div>'}
      <div class="divider"></div>
      <h3>Add a class to this date</h3>
      <div class="form-grid"><div class="field"><label for="manualSubject">Subject</label><select id="manualSubject"></select></div><div class="field"><label for="manualPeriods">Periods</label><input type="number" id="manualPeriods" min="1" max="15" value="1" inputmode="numeric"></div></div>
      <button class="btn secondary full" id="addManualClassBtn">＋ Add class</button>
      <button class="btn secondary full" id="markHolidayBtn" style="margin-top:8px">Mark as holiday / no college</button>
      <button class="btn danger full" id="deleteDateBtn" style="margin-top:8px">Delete this date’s record</button>
      <p class="hint">Cancelled periods are excluded from the attendance percentage. Unmarked periods do not count until you mark them.</p>`;
    renderSubjectSelect($('manualSubject'), 'Choose a subject');
    $('addManualClassBtn').addEventListener('click', () => addManualClass(key));
    $('markHolidayBtn').addEventListener('click', () => markHoliday(key));
    $('deleteDateBtn').addEventListener('click', () => clearDateRecord(key));
  }
  renderCalendar();
  renderRecentRecords();
}
$('attendanceDate').addEventListener('change', renderAttendancePage);

/* Calendar and recent records */
function renderCalendar() {
  const host = $('calendarGrid');
  const value = $('calendarMonth').value || dateKey().slice(0,7);
  const [year, month] = value.split('-').map(Number);
  const first = new Date(year, month-1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
  const dayNames = ['M','T','W','T','F','S','S'];
  let out = dayNames.map(day => `<div class="calendar-dayname">${day}</div>`).join('');
  for (let i=0; i<mondayOffset; i++) out += '<div></div>';
  for (let day=1; day<=daysInMonth; day++) {
    const key = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const record = state.records[key];
    let cls = 'calendar-day';
    if (record) {
      cls += ' has-record';
      if (record.kind === 'holiday') cls += ' holiday';
      else {
        const marks = (record.classes || []).flatMap(entry => entry.marks || []);
        if (marks.includes('A')) cls += ' absent-day';
        else if (marks.includes('P')) cls += ' present-day';
      }
    }
    if ($('attendanceDate').value === key) cls += ' selected';
    out += `<button class="${cls}" data-calendar-date="${key}" aria-label="${key}">${day}</button>`;
  }
  host.innerHTML = out;
  host.querySelectorAll('[data-calendar-date]').forEach(button => button.addEventListener('click', () => {
    $('attendanceDate').value = button.dataset.calendarDate;
    renderAttendancePage();
    window.scrollTo({ top:0, behavior:'smooth' });
  }));
}
$('calendarMonth').value = dateKey().slice(0,7);
$('calendarMonth').addEventListener('change', renderCalendar);
function renderRecentRecords() {
  const host = $('recentRecords');
  const keys = Object.keys(state.records).sort().reverse().slice(0,8);
  if (!keys.length) { host.innerHTML = '<div class="empty">No daily records yet.</div>'; return; }
  host.innerHTML = keys.map(key => {
    const record = state.records[key];
    if (record.kind === 'holiday') return `<div class="table-row"><span>${prettyDate(key)}</span><span class="status C">Holiday</span><button class="btn secondary sm" data-open-date="${key}">Open</button></div>`;
    const marks = (record.classes || []).flatMap(entry => entry.marks || []);
    const p = marks.filter(m=>m==='P').length, a = marks.filter(m=>m==='A').length;
    return `<div class="table-row"><span>${prettyDate(key)}</span><span class="muted">${p} present · ${a} absent</span><button class="btn secondary sm" data-open-date="${key}">Edit</button></div>`;
  }).join('');
  host.querySelectorAll('[data-open-date]').forEach(button => button.addEventListener('click', () => {
    $('attendanceDate').value = button.dataset.openDate;
    renderAttendancePage();
  }));
}

/* Simulator */
function renderSimulator() {
  renderSubjectSelect($('simSubject'), state.subjects.length ? 'Choose a subject' : 'Add subjects first');
  updateSimulator();
}
function updateSimulator() {
  const subject = subjectById($('simSubject').value);
  if (!subject) {
    $('simProjected').textContent = '—'; $('simBar').style.width = '0%';
    $('simExplanation').textContent = 'Add a subject, then select it here.';
    $('maxBunks').textContent = '—'; $('classesNeeded').textContent = '—';
    return;
  }
  const stats = totalForSubject(subject.id);
  const misses = Math.max(0, Math.min(200, Math.floor(Number($('simMiss').value) || 0)));
  const attends = Math.max(0, Math.min(200, Math.floor(Number($('simAttend').value) || 0)));
  const projectedTotal = stats.counted + misses + attends;
  const projected = projectedTotal ? (stats.present + attends) / projectedTotal * 100 : 0;
  const target = Math.min(100, Math.max(1, Number(state.target) || 75));
  $('simProjected').textContent = formatPct(projected);
  $('simBar').style.width = `${Math.min(100, projected)}%`;
  $('simExplanation').textContent = `After attending ${attends} and bunking ${misses} upcoming class(es), projected attendance is ${formatPct(projected)} (${stats.present + attends} present out of ${projectedTotal} counted). ${projected < DANGER_LIMIT ? 'DANGER ZONE — avoid further absences.' : projected < SAFE_LIMIT ? 'WARNING ZONE — attendance is below 75%.' : projected < target ? 'Above danger level, but still below your target.' : 'SAFE — target achieved.'}`;
  let maxMisses;
  if (stats.counted === 0) maxMisses = 'No history';
  else if (stats.percentage + 1e-9 < target) maxMisses = '0 (below target)';
  else maxMisses = String(Math.max(0, Math.floor((stats.present / (target/100)) - stats.counted + 1e-9)));
  $('maxBunks').textContent = maxMisses;
  if (stats.percentage >= target) {
    const need = 0;
    $('classesNeeded').textContent = need;
  } else if (target >= 100) {
    $('classesNeeded').textContent = stats.absent === 0 ? 0 : 'Not possible with 100% target';
  } else {
    const needed = Math.ceil(((target/100)*stats.counted - stats.present) / (1 - target/100));
    $('classesNeeded').textContent = Math.max(0, needed);
  }
}
$('simSubject').addEventListener('change', updateSimulator);
$('simMiss').addEventListener('input', updateSimulator);
$('simAttend').addEventListener('input', updateSimulator);

/* Home, subject lists and aggregate UI */
function renderSubjectLists() {
  const list = $('subjectList'), home = $('homeSubjectList');
  if (!state.subjects.length) {
    list.innerHTML = '<div class="empty">No subjects yet. Add your first subject using the form above.</div>';
    home.innerHTML = '<div class="empty">Add your subjects to see subject-wise attendance here.</div>';
    return;
  }
  list.innerHTML = state.subjects.map(subject => {
    const stats = totalForSubject(subject.id);
    return `<div class="subject-item">
      <div class="row between"><strong><span class="subject-dot" style="background:${subject.color}"></span>${escapeHtml(subject.name)}</strong><strong>${formatPct(stats.percentage)} <span class="zone-badge ${attendanceZone(stats.percentage)}">${zoneLabel(stats.percentage)}</span></strong></div>
      <div class="progress"><span style="width:${Math.min(100,stats.percentage)}%;background:${subject.color}"></span></div>
      <div class="row between wrap"><span class="small muted">${stats.present} present · ${stats.absent} absent · ${stats.cancelled} cancelled</span><span><button class="btn secondary sm" data-action="edit-subject" data-id="${escapeHtml(subject.id)}">Edit</button> <button class="btn danger sm" data-action="delete-subject" data-id="${escapeHtml(subject.id)}">Delete</button></span></div>
    </div>`;
  }).join('');
  home.innerHTML = state.subjects.slice(0,5).map(subject => {
    const stats = totalForSubject(subject.id);
    return `<div class="subject-item"><div class="row between"><span><span class="subject-dot" style="background:${subject.color}"></span>${escapeHtml(subject.name)}</span><strong>${formatPct(stats.percentage)} <span class="zone-badge ${attendanceZone(stats.percentage)}">${zoneLabel(stats.percentage)}</span></strong></div><div class="progress"><span style="width:${Math.min(100,stats.percentage)}%;background:${subject.color}"></span></div><div class="small muted">${stats.present} present / ${stats.counted} counted</div></div>`;
  }).join('');
}
function renderHome() {
  const totals = overallStats();
  const counted = totals.present + totals.absent;
  const percentage = counted ? totals.present / counted * 100 : 0;
  $('overallPct').textContent = formatPct(percentage);
  $('overallBar').style.width = `${Math.min(100,percentage)}%`;
  $('overallPresent').textContent = `${totals.present} present`;
  $('overallCounted').textContent = `${counted} counted classes`;
  $('homePresent').textContent = totals.present;
  $('homeAbsent').textContent = totals.absent;
  $('homeSubjects').textContent = state.subjects.length;
  $('targetPill').textContent = `Target ${state.target}%`;
  $('homeDateLabel').textContent = new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
  $('todayPill').textContent = new Date().toLocaleDateString(undefined,{day:'numeric',month:'short'});
  $('overallAdvice').textContent = counted === 0 ? 'Add subjects and enter your previous attendance totals or start marking daily classes.' :
    percentage < DANGER_LIMIT ? `DANGER ZONE: Overall attendance is below ${DANGER_LIMIT}%. Prioritize attending every upcoming class. Your target is ${state.target}%.` :
    percentage < SAFE_LIMIT ? `WARNING ZONE: Overall attendance is below ${SAFE_LIMIT}%. Be careful with absences; aim for at least ${state.target}%.` :
    percentage >= state.target ? `SAFE ZONE: You are meeting your ${state.target}% attendance target. Keep it up!` :
    `You are above ${SAFE_LIMIT}% but below your ${state.target}% target. Attend upcoming classes to improve.`;
  const todayRecord = state.records[dateKey()];
  if (!todayRecord) $('todayQuickStatus').innerHTML = '';
  else if (todayRecord.kind === 'holiday') $('todayQuickStatus').innerHTML = '<p class="hint">Today is marked as a holiday.</p>';
  else {
    const marks = (todayRecord.classes || []).flatMap(entry => entry.marks || []);
    const done = marks.filter(Boolean).length;
    $('todayQuickStatus').innerHTML = `<div class="divider"></div><p class="small muted">${done} of ${marks.length} periods marked. <button class="btn secondary sm" id="reviewTodayBtn">Review today</button></p>`;
    $('reviewTodayBtn').addEventListener('click', () => { setPage('attendance'); $('attendanceDate').value = dateKey(); renderAttendancePage(); });
  }
}
function renderSubjectsPage() {
  renderSubjectLists();
  renderBaselineEditors();
}
function renderAll() {
  renderHome();
  renderSubjectLists();
  renderBaselineEditors();
  renderTimetable();
  renderSimulator();
  $('targetInput').value = state.target;
  if ($('page-attendance').classList.contains('active')) renderAttendancePage();
}
$('saveTargetBtn').addEventListener('click', () => {
  const value = Math.floor(Number($('targetInput').value) || 75);
  state.target = Math.max(1, Math.min(100, value));
  saveState();
  showToast(`Attendance target set to ${state.target}%.`);
});

/* Backup, restore and CSV report */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('exportJsonBtn').addEventListener('click', () => {
  const backup = { ...state, exportedAt:new Date().toISOString(), app:'AttendAI', schemaVersion:3 };
  downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}), `attendai-backup-${dateKey()}.json`);
  showToast('Full backup downloaded.');
});
$('exportCsvBtn').addEventListener('click', () => {
  const rows = [['Subject','Present','Absent','Cancelled','Counted','Attendance %']];
  state.subjects.forEach(subject => {
    const stats = totalForSubject(subject.id);
    rows.push([subject.name,stats.present,stats.absent,stats.cancelled,stats.counted,formatPct(stats.percentage)]);
  });
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  downloadBlob(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}), `attendai-report-${dateKey()}.csv`);
  showToast('CSV report downloaded.');
});
$('importJsonBtn').addEventListener('click', () => {
  const file = $('importFile').files[0];
  if (!file) { showToast('Choose a JSON backup file first.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!incoming || !Array.isArray(incoming.subjects) || typeof incoming.records !== 'object' || typeof incoming.timetable !== 'object') {
        throw new Error('Not an AttendAI backup.');
      }
      if (!confirm('Importing replaces the data currently in this browser. Export a backup of current data first. Continue?')) return;
      state = incoming.schemaVersion === 3 ? { ...freshState(), ...incoming } : migrateLegacy(incoming);
      state.baseline ||= {};
      saveState();
      showToast('Backup restored successfully.');
    } catch (error) {
      console.error(error);
      showToast('This file is not a valid AttendAI backup.');
    }
  };
  reader.onerror = () => showToast('Could not read that file.');
  reader.readAsText(file);
});
$('clearDataBtn').addEventListener('click', () => {
  if (!confirm('Permanently delete all AttendAI subjects, timetable and attendance from this browser? Export a backup first.')) return;
  state = freshState();
  localStorage.removeItem(STORAGE_KEY);
  saveState();
  showToast('All AttendAI data cleared.');
});

/* Delegated controls for dynamically rendered cards. */
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'edit-subject') beginEditSubject(button.dataset.id);
  else if (action === 'delete-subject') deleteSubject(button.dataset.id);
  else if (action === 'save-baseline') savePreviousTotals(button.dataset.id);
  else if (action === 'remove-timetable') removeTimetableEntry(button.dataset.day, button.dataset.id);
  else if (action === 'mark-period') setPeriodMark(button.dataset.date, Number(button.dataset.class), Number(button.dataset.period), button.dataset.mark);
  else if (action === 'remove-date-class') removeClassFromRecord(button.dataset.date, Number(button.dataset.class));
});

/* Start-up and daily date defaults */
$('attendanceDate').value = dateKey();
$('calendarMonth').value = dateKey().slice(0,7);
renderAll();
