/* app.js — לוגיקת האפליקציה: ניתוב, רינדור מסכים וטיפול בטפסים.
   כל המידע נשמר מקומית במכשיר (IndexedDB) בלבד. */

const EVENT_CATEGORIES = ['לימודי', 'התנהגותי', 'חברתי', 'רגשי', 'משמעתי', 'חיובי'];
const FOLLOW_UP_STATUSES = ['פתוח', 'סגור'];
const CONVERSATION_METHODS = ['טלפון', 'פגישה', 'הודעה'];
const PEDAGOGICAL_DOMAINS = ['לימודי', 'רגשי', 'חברתי'];
const TASK_STATUSES = ['פתוח', 'הושלם'];
const CLASS_NAMES = ["ה'", "ו'"];
const DEFAULT_SCHOOL_YEAR = 'תשפ"ז';
const WEEK_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

const app = document.getElementById('app');
let studentsCache = [];
let enrollmentsCache = [];

/* ---------- עזרי-על ---------- */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v == null) return;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function studentLabel(student) {
  if (!student) return 'תלמיד/ה לא ידוע/ה';
  return `${student.firstName} ${student.lastNameInitial || ''}'`.trim();
}

function currentEnrollment(studentId) {
  const list = enrollmentsCache.filter((e) => e.studentId === studentId);
  return list[list.length - 1] || null;
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function refreshCaches() {
  studentsCache = await DB.getAll('students');
  enrollmentsCache = await DB.getAll('enrollments');
}

/* ---------- ניתוב ---------- */
function parseHash() {
  const hash = location.hash.replace(/^#/, '') || '/home';
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query || '');
  return { path, params };
}

async function router() {
  await refreshCaches();
  const { path, params } = parseHash();
  setActiveNav(path);
  app.innerHTML = '';
  if (path === '/home') return renderHome();
  if (path === '/students') return renderStudents();
  if (path.startsWith('/student/')) return renderStudentProfile(Number(path.split('/')[2]));
  if (path === '/add') return renderAddRecord(params);
  if (path === '/search') return renderSearch();
  if (path === '/schedule') return renderSchedule();
  return renderHome();
}

function setActiveNav(path) {
  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('data-path') === '/' + path.split('/')[1]);
  });
}

window.addEventListener('hashchange', router);

/* ---------- מסך הבית ---------- */
async function renderHome() {
  const events = (await DB.getAll('events')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const eventStudents = await DB.getAll('eventStudents');
  const tasks = (await DB.getAll('tasks')).filter((t) => t.status !== 'הושלם')
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  const section = el('section', { class: 'screen active' });
  section.appendChild(el('h1', {}, 'שלום 👋'));
  section.appendChild(el('div', { class: 'stat-row' }, [
    el('div', { class: 'stat-card' }, [el('div', { class: 'stat-num' }, String(studentsCache.length)), el('div', {}, 'תלמידים')]),
    el('div', { class: 'stat-card' }, [el('div', { class: 'stat-num' }, String(tasks.length)), el('div', {}, 'משימות פתוחות')]),
  ]));

  section.appendChild(el('h2', {}, 'תיעודים אחרונים'));
  const list = el('div', { class: 'list' });
  if (events.length === 0) list.appendChild(el('p', { class: 'muted' }, 'עדיין אין תיעודים.'));
  events.forEach((ev) => {
    const studentIds = eventStudents.filter((es) => es.eventId === ev.id).map((es) => es.studentId);
    const names = studentIds.map((id) => studentLabel(studentsCache.find((s) => s.id === id))).join(', ');
    list.appendChild(el('a', { class: 'list-item', href: `#/student/${studentIds[0] || ''}` }, [
      el('span', { class: `badge cat-${ev.category}` }, ev.category),
      el('div', { class: 'list-item-body' }, [
        el('div', {}, ev.description ? ev.description.slice(0, 60) : ''),
        el('div', { class: 'muted small' }, `${names} · ${formatDate(ev.date)}`),
      ]),
    ]));
  });
  section.appendChild(list);

  section.appendChild(el('h2', {}, 'משימות פתוחות'));
  const taskList = el('div', { class: 'list' });
  if (tasks.length === 0) taskList.appendChild(el('p', { class: 'muted' }, 'אין משימות פתוחות.'));
  tasks.forEach((t) => {
    const row = el('div', { class: 'list-item' }, [
      el('input', {
        type: 'checkbox', onchange: async (e) => {
          t.status = e.target.checked ? 'הושלם' : 'פתוח';
          await DB.put('tasks', t);
          router();
        },
      }),
      el('div', { class: 'list-item-body' }, [
        el('div', {}, t.description),
        el('div', { class: 'muted small' }, t.dueDate ? formatDate(t.dueDate) : ''),
      ]),
    ]);
    taskList.appendChild(row);
  });
  section.appendChild(taskList);

  app.appendChild(section);
  app.appendChild(el('a', { class: 'fab', href: '#/add', title: 'הוספת תיעוד' }, '+'));
}

/* ---------- רשימת תלמידים ---------- */
async function renderStudents() {
  const section = el('section', { class: 'screen active' });
  section.appendChild(el('h1', {}, 'תלמידים'));

  const controls = el('div', { class: 'row' });
  const search = el('input', { type: 'search', placeholder: 'חיפוש לפי שם…', class: 'input' });
  const classFilter = el('select', { class: 'input' }, [
    el('option', { value: '' }, 'כל הכיתות'),
    ...CLASS_NAMES.map((c) => el('option', { value: c }, c)),
  ]);
  controls.appendChild(search);
  controls.appendChild(classFilter);
  section.appendChild(controls);

  const addBtn = el('button', { class: 'btn primary', onclick: () => openStudentForm() }, '+ הוספת תלמיד/ה');
  const importBtn = el('button', { class: 'btn', onclick: () => openImportForm() }, 'ייבוא מ-CSV');
  section.appendChild(el('div', { class: 'row' }, [addBtn, importBtn]));

  const list = el('div', { class: 'list' });
  section.appendChild(list);

  function draw() {
    list.innerHTML = '';
    const term = search.value.trim();
    const cls = classFilter.value;
    const rows = studentsCache
      .map((s) => ({ s, enr: currentEnrollment(s.id) }))
      .filter(({ s, enr }) => {
        if (term && !`${s.firstName} ${s.lastNameInitial}`.includes(term)) return false;
        if (cls && (!enr || enr.className !== cls)) return false;
        return true;
      })
      .sort((a, b) => a.s.firstName.localeCompare(b.s.firstName, 'he'));
    if (rows.length === 0) list.appendChild(el('p', { class: 'muted' }, 'לא נמצאו תלמידים.'));
    rows.forEach(({ s, enr }) => {
      list.appendChild(el('a', { class: 'list-item', href: `#/student/${s.id}` }, [
        el('div', { class: 'avatar' }, s.firstName ? s.firstName[0] : '?'),
        el('div', { class: 'list-item-body' }, [
          el('div', {}, studentLabel(s)),
          el('div', { class: 'muted small' }, enr ? `כיתה ${enr.className} · ${enr.schoolYear}` : 'ללא שיוך כיתה'),
        ]),
      ]));
    });
  }
  search.addEventListener('input', draw);
  classFilter.addEventListener('change', draw);
  draw();

  app.appendChild(section);
}

function openStudentForm(existing) {
  const overlay = buildModal(existing ? 'עריכת תלמיד/ה' : 'הוספת תלמיד/ה');
  const firstName = el('input', { class: 'input', placeholder: 'שם פרטי', value: existing?.firstName || '' });
  const lastInitial = el('input', { class: 'input', placeholder: "אות ראשונה של שם המשפחה", maxlength: '1', value: existing?.lastNameInitial || '' });
  const classSel = el('select', { class: 'input' }, CLASS_NAMES.map((c) => el('option', { value: c }, c)));
  const yearInput = el('input', { class: 'input', placeholder: 'שנת לימודים', value: currentEnrollment(existing?.id)?.schoolYear || DEFAULT_SCHOOL_YEAR });
  const medical = el('textarea', { class: 'input', placeholder: 'רגישויות רפואיות (אופציונלי)' }, existing?.medicalNotes || '');
  const background = el('textarea', { class: 'input', placeholder: 'רקע לימודי (אופציונלי)' }, existing?.academicBackground || '');
  if (existing) {
    const enr = currentEnrollment(existing.id);
    if (enr) classSel.value = enr.className;
  }

  const form = el('div', { class: 'form' }, [
    el('label', {}, 'שם פרטי'), firstName,
    el('label', {}, 'אות ראשונה של שם המשפחה'), lastInitial,
    el('label', {}, 'כיתה'), classSel,
    el('label', {}, 'שנת לימודים'), yearInput,
    el('label', {}, 'רגישויות רפואיות'), medical,
    el('label', {}, 'רקע לימודי'), background,
    el('button', {
      class: 'btn primary', onclick: async () => {
        if (!firstName.value.trim()) { alert('נא להזין שם פרטי'); return; }
        let student = existing || {};
        student.firstName = firstName.value.trim();
        student.lastNameInitial = lastInitial.value.trim();
        student.medicalNotes = medical.value.trim();
        student.academicBackground = background.value.trim();
        const id = existing ? (await DB.put('students', student), student.id) : await DB.add('students', student);
        const enr = currentEnrollment(id);
        if (!enr || enr.className !== classSel.value || enr.schoolYear !== yearInput.value) {
          await DB.add('enrollments', { studentId: id, className: classSel.value, schoolYear: yearInput.value.trim() || DEFAULT_SCHOOL_YEAR, status: 'פעיל' });
        }
        closeModal();
        router();
      },
    }, existing ? 'שמירה' : 'הוספה'),
  ]);
  overlay.querySelector('.modal-body').appendChild(form);
}

function openImportForm() {
  const overlay = buildModal('ייבוא תלמידים מקובץ CSV');
  const help = el('p', { class: 'muted small' }, 'הקובץ צריך להכיל עמודות: שם פרטי, אות משפחה, כיתה. ניתן לשמור קובץ אקסל בפורמט CSV (שמירה בשם → CSV).');
  const classSel = el('select', { class: 'input' }, CLASS_NAMES.map((c) => el('option', { value: c }, c)));
  const yearInput = el('input', { class: 'input', value: DEFAULT_SCHOOL_YEAR });
  const fileInput = el('input', { type: 'file', accept: '.csv,text/csv', class: 'input' });
  const status = el('p', { class: 'muted small' }, '');
  const form = el('div', { class: 'form' }, [
    help,
    el('label', {}, 'כיתה לייבוא'), classSel,
    el('label', {}, 'שנת לימודים'), yearInput,
    el('label', {}, 'קובץ CSV'), fileInput,
    status,
    el('button', {
      class: 'btn primary', onclick: async () => {
        const file = fileInput.files[0];
        if (!file) { alert('נא לבחור קובץ'); return; }
        const text = await file.text();
        const rows = text.split(/\r?\n/).map((r) => r.split(',')).filter((r) => r.length >= 2 && r[0].trim());
        let count = 0;
        for (const row of rows) {
          const first = row[0].trim();
          if (!first || first === 'שם פרטי') continue;
          const last = (row[1] || '').trim().slice(0, 1);
          const id = await DB.add('students', { firstName: first, lastNameInitial: last, medicalNotes: '', academicBackground: '' });
          await DB.add('enrollments', { studentId: id, className: classSel.value, schoolYear: yearInput.value.trim() || DEFAULT_SCHOOL_YEAR, status: 'פעיל' });
          count += 1;
        }
        status.textContent = `יובאו ${count} תלמידים בהצלחה.`;
        await refreshCaches();
        setTimeout(() => { closeModal(); router(); }, 800);
      },
    }, 'ייבוא'),
  ]);
  overlay.querySelector('.modal-body').appendChild(form);
}

/* ---------- תיק תלמיד ---------- */
async function renderStudentProfile(studentId) {
  const student = studentsCache.find((s) => s.id === studentId);
  const section = el('section', { class: 'screen active' });
  if (!student) {
    section.appendChild(el('p', {}, 'תלמיד/ה לא נמצא/ה.'));
    app.appendChild(section);
    return;
  }
  const enr = currentEnrollment(studentId);
  section.appendChild(el('h1', {}, studentLabel(student)));
  section.appendChild(el('p', { class: 'muted' }, enr ? `כיתה ${enr.className} · ${enr.schoolYear}` : ''));
  section.appendChild(el('div', { class: 'row' }, [
    el('button', { class: 'btn', onclick: () => openStudentForm(student) }, 'עריכת פרטים'),
    el('a', { class: 'btn primary', href: `#/add?student=${studentId}` }, '+ הוספת תיעוד'),
  ]));

  if (student.medicalNotes) section.appendChild(el('p', {}, [el('b', {}, 'רגישויות רפואיות: '), student.medicalNotes]));
  if (student.academicBackground) section.appendChild(el('p', {}, [el('b', {}, 'רקע לימודי: '), student.academicBackground]));

  const [events, eventStudents, conversations, needs, tasks, attachments] = await Promise.all([
    DB.getAll('events'),
    DB.getByIndex('eventStudents', 'studentId', studentId),
    DB.getByIndex('parentConversations', 'studentId', studentId),
    DB.getByIndex('pedagogicalNeeds', 'studentId', studentId),
    DB.getByIndex('tasks', 'studentId', studentId),
    DB.getByIndex('attachments', 'studentId', studentId),
  ]);
  const myEvents = eventStudents
    .map((es) => events.find((e) => e.id === es.eventId))
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));

  section.appendChild(el('h2', {}, 'ציר זמן — אירועים ותיעודים'));
  const evList = el('div', { class: 'list' });
  if (myEvents.length === 0) evList.appendChild(el('p', { class: 'muted' }, 'אין עדיין אירועים מתועדים.'));
  myEvents.forEach((ev) => {
    const evAttachments = attachments.filter((a) => a.eventId === ev.id);
    evList.appendChild(el('div', { class: 'list-item static' }, [
      el('span', { class: `badge cat-${ev.category}` }, ev.category),
      el('div', { class: 'list-item-body' }, [
        el('div', {}, ev.description),
        el('div', { class: 'muted small' }, `${formatDate(ev.date)} · סטטוס: ${ev.followUpStatus}${ev.actions ? ' · פעולות: ' + ev.actions : ''}`),
        evAttachments.length ? el('div', { class: 'attach-row' }, evAttachments.map((a) => el('a', { href: a.dataUrl, target: '_blank', class: 'chip' }, '📎 ' + a.fileName))) : null,
      ]),
    ]));
  });
  section.appendChild(evList);

  section.appendChild(el('h2', {}, 'שיחות עם הורים'));
  const convList = el('div', { class: 'list' });
  if (conversations.length === 0) convList.appendChild(el('p', { class: 'muted' }, 'אין תיעוד שיחות.'));
  conversations.sort((a, b) => b.date.localeCompare(a.date)).forEach((c) => {
    convList.appendChild(el('div', { class: 'list-item static' }, [
      el('div', { class: 'list-item-body' }, [
        el('div', {}, `${c.topic} (${c.method})`),
        el('div', { class: 'muted small' }, `${formatDate(c.date)} · סיכום: ${c.summary || '-'}`),
        c.decisions ? el('div', { class: 'muted small' }, `החלטות: ${c.decisions}`) : null,
        c.followUp ? el('div', { class: 'muted small' }, `המשך: ${c.followUp}`) : null,
      ]),
    ]));
  });
  section.appendChild(convList);

  section.appendChild(el('h2', {}, 'מעקב פדגוגי'));
  const needList = el('div', { class: 'list' });
  if (needs.length === 0) needList.appendChild(el('p', { class: 'muted' }, 'אין תיעוד מעקב פדגוגי.'));
  needs.forEach((n) => {
    needList.appendChild(el('div', { class: 'list-item static' }, [
      el('div', { class: 'list-item-body' }, [
        el('div', {}, `${n.domain}: ${n.description}`),
        n.goal ? el('div', { class: 'muted small' }, `יעד: ${n.goal}`) : null,
        n.progress ? el('div', { class: 'muted small' }, `התקדמות: ${n.progress}`) : null,
      ]),
    ]));
  });
  section.appendChild(needList);

  if (tasks.length) {
    section.appendChild(el('h2', {}, 'משימות הקשורות לתלמיד/ה'));
    const tList = el('div', { class: 'list' });
    tasks.forEach((t) => tList.appendChild(el('div', { class: 'list-item static' }, [
      el('div', { class: 'list-item-body' }, [el('div', {}, t.description), el('div', { class: 'muted small' }, `${t.status} · ${formatDate(t.dueDate)}`)]),
    ])));
    section.appendChild(tList);
  }

  app.appendChild(section);
}

/* ---------- הוספת תיעוד ---------- */
async function renderAddRecord(params) {
  const preStudent = params.get('student') ? Number(params.get('student')) : null;
  const section = el('section', { class: 'screen active' });
  section.appendChild(el('h1', {}, 'הוספת תיעוד'));

  const typeSel = el('select', { class: 'input' }, [
    el('option', { value: 'event' }, 'אירוע'),
    el('option', { value: 'conversation' }, 'שיחה עם הורה'),
    el('option', { value: 'need' }, 'מעקב פדגוגי'),
  ]);
  section.appendChild(el('label', {}, 'סוג תיעוד'));
  section.appendChild(typeSel);

  const formHost = el('div', { class: 'form' });
  section.appendChild(formHost);
  app.appendChild(section);

  function studentCheckboxes(multi) {
    const wrap = el('div', { class: 'checkbox-list' });
    studentsCache.forEach((s) => {
      const input = el('input', { type: multi ? 'checkbox' : 'radio', name: 'studentPick', value: String(s.id) });
      if (preStudent === s.id) input.checked = true;
      wrap.appendChild(el('label', { class: 'checkbox-row' }, [input, ' ' + studentLabel(s)]));
    });
    return wrap;
  }

  function drawEventForm() {
    formHost.innerHTML = '';
    const students = studentCheckboxes(true);
    const category = el('select', { class: 'input' }, EVENT_CATEGORIES.map((c) => el('option', { value: c }, c)));
    const date = el('input', { type: 'date', class: 'input', value: todayISO() });
    const desc = el('textarea', { class: 'input', placeholder: 'תיאור האירוע' });
    const actions = el('textarea', { class: 'input', placeholder: 'פעולות שננקטו (אופציונלי)' });
    const status = el('select', { class: 'input' }, FOLLOW_UP_STATUSES.map((s) => el('option', { value: s }, s)));
    const file = el('input', { type: 'file', class: 'input', accept: 'image/*,.pdf' });
    formHost.append(
      el('label', {}, 'תלמיד/ים מעורב/ים'), students,
      el('label', {}, 'קטגוריה'), category,
      el('label', {}, 'תאריך'), date,
      el('label', {}, 'תיאור'), desc,
      el('label', {}, 'פעולות שננקטו'), actions,
      el('label', {}, 'סטטוס המשך טיפול'), status,
      el('label', {}, 'צירוף תמונה/קובץ (אופציונלי)'), file,
      el('button', {
        class: 'btn primary', onclick: async () => {
          const ids = Array.from(students.querySelectorAll('input:checked')).map((i) => Number(i.value));
          if (ids.length === 0) { alert('נא לבחור לפחות תלמיד/ה אחד/ת'); return; }
          const eventId = await DB.add('events', { date: date.value || todayISO(), category: category.value, description: desc.value.trim(), actions: actions.value.trim(), followUpStatus: status.value });
          for (const sid of ids) await DB.add('eventStudents', { eventId, studentId: sid });
          if (file.files[0]) {
            const dataUrl = await fileToDataURL(file.files[0]);
            await DB.add('attachments', { eventId, studentId: ids[0], fileName: file.files[0].name, dataUrl, uploadedAt: todayISO() });
          }
          location.hash = ids.length === 1 ? `#/student/${ids[0]}` : '#/home';
        },
      }, 'שמירה'),
    );
  }

  function drawConversationForm() {
    formHost.innerHTML = '';
    const students = studentCheckboxes(false);
    const date = el('input', { type: 'date', class: 'input', value: todayISO() });
    const method = el('select', { class: 'input' }, CONVERSATION_METHODS.map((m) => el('option', { value: m }, m)));
    const topic = el('input', { class: 'input', placeholder: 'נושא השיחה' });
    const summary = el('textarea', { class: 'input', placeholder: 'סיכום' });
    const decisions = el('textarea', { class: 'input', placeholder: 'החלטות (אופציונלי)' });
    const followUp = el('input', { class: 'input', placeholder: 'משימת המשך (אופציונלי)' });
    formHost.append(
      el('label', {}, 'תלמיד/ה'), students,
      el('label', {}, 'תאריך'), date,
      el('label', {}, 'אופן השיחה'), method,
      el('label', {}, 'נושא'), topic,
      el('label', {}, 'סיכום'), summary,
      el('label', {}, 'החלטות'), decisions,
      el('label', {}, 'משימת המשך'), followUp,
      el('button', {
        class: 'btn primary', onclick: async () => {
          const picked = students.querySelector('input:checked');
          if (!picked) { alert('נא לבחור תלמיד/ה'); return; }
          const studentId = Number(picked.value);
          await DB.add('parentConversations', { studentId, date: date.value || todayISO(), method: method.value, topic: topic.value.trim(), summary: summary.value.trim(), decisions: decisions.value.trim(), followUp: followUp.value.trim() });
          location.hash = `#/student/${studentId}`;
        },
      }, 'שמירה'),
    );
  }

  function drawNeedForm() {
    formHost.innerHTML = '';
    const students = studentCheckboxes(false);
    const domain = el('select', { class: 'input' }, PEDAGOGICAL_DOMAINS.map((d) => el('option', { value: d }, d)));
    const desc = el('textarea', { class: 'input', placeholder: 'תיאור הצורך / ההתאמה' });
    const goal = el('input', { class: 'input', placeholder: 'יעד (אופציונלי)' });
    const progress = el('textarea', { class: 'input', placeholder: 'התקדמות מתועדת (אופציונלי)' });
    formHost.append(
      el('label', {}, 'תלמיד/ה'), students,
      el('label', {}, 'תחום'), domain,
      el('label', {}, 'תיאור'), desc,
      el('label', {}, 'יעד'), goal,
      el('label', {}, 'התקדמות'), progress,
      el('button', {
        class: 'btn primary', onclick: async () => {
          const picked = students.querySelector('input:checked');
          if (!picked) { alert('נא לבחור תלמיד/ה'); return; }
          const studentId = Number(picked.value);
          await DB.add('pedagogicalNeeds', { studentId, domain: domain.value, description: desc.value.trim(), goal: goal.value.trim(), progress: progress.value.trim(), updatedAt: todayISO() });
          location.hash = `#/student/${studentId}`;
        },
      }, 'שמירה'),
    );
  }

  function draw() {
    if (typeSel.value === 'event') drawEventForm();
    else if (typeSel.value === 'conversation') drawConversationForm();
    else drawNeedForm();
  }
  typeSel.addEventListener('change', draw);
  draw();
}

/* ---------- חיפוש מתקדם ---------- */
async function renderSearch() {
  const section = el('section', { class: 'screen active' });
  section.appendChild(el('h1', {}, 'חיפוש מתקדם'));

  const studentSel = el('select', { class: 'input' }, [el('option', { value: '' }, 'כל התלמידים'), ...studentsCache.map((s) => el('option', { value: s.id }, studentLabel(s)))]);
  const categorySel = el('select', { class: 'input' }, [el('option', { value: '' }, 'כל הקטגוריות'), ...EVENT_CATEGORIES.map((c) => el('option', { value: c }, c))]);
  const fromDate = el('input', { type: 'date', class: 'input' });
  const toDate = el('input', { type: 'date', class: 'input' });
  const keyword = el('input', { type: 'search', class: 'input', placeholder: 'מילת מפתח' });
  const btn = el('button', { class: 'btn primary' }, 'חיפוש');
  section.append(
    el('label', {}, 'תלמיד/ה'), studentSel,
    el('label', {}, 'קטגוריה'), categorySel,
    el('div', { class: 'row' }, [el('div', {}, [el('label', {}, 'מתאריך'), fromDate]), el('div', {}, [el('label', {}, 'עד תאריך'), toDate])]),
    el('label', {}, 'מילת מפתח'), keyword,
    btn,
  );
  const results = el('div', { class: 'list' });
  section.appendChild(el('h2', {}, 'תוצאות'));
  section.appendChild(results);
  app.appendChild(section);

  btn.addEventListener('click', async () => {
    results.innerHTML = '';
    const events = await DB.getAll('events');
    const eventStudents = await DB.getAll('eventStudents');
    const conversations = await DB.getAll('parentConversations');
    let matches = [];

    events.forEach((ev) => {
      const ids = eventStudents.filter((es) => es.eventId === ev.id).map((es) => es.studentId);
      if (studentSel.value && !ids.includes(Number(studentSel.value))) return;
      if (categorySel.value && ev.category !== categorySel.value) return;
      if (fromDate.value && ev.date < fromDate.value) return;
      if (toDate.value && ev.date > toDate.value) return;
      if (keyword.value && !(ev.description || '').includes(keyword.value)) return;
      matches.push({ type: 'אירוע', date: ev.date, text: ev.description, studentId: ids[0] });
    });
    conversations.forEach((c) => {
      if (studentSel.value && c.studentId !== Number(studentSel.value)) return;
      if (categorySel.value) return; // conversations have no category
      if (fromDate.value && c.date < fromDate.value) return;
      if (toDate.value && c.date > toDate.value) return;
      if (keyword.value && !`${c.topic} ${c.summary}`.includes(keyword.value)) return;
      matches.push({ type: 'שיחת הורים', date: c.date, text: `${c.topic} — ${c.summary}`, studentId: c.studentId });
    });

    matches.sort((a, b) => b.date.localeCompare(a.date));
    if (matches.length === 0) results.appendChild(el('p', { class: 'muted' }, 'לא נמצאו תוצאות.'));
    matches.forEach((m) => {
      const student = studentsCache.find((s) => s.id === m.studentId);
      results.appendChild(el('a', { class: 'list-item', href: `#/student/${m.studentId}` }, [
        el('span', { class: 'badge' }, m.type),
        el('div', { class: 'list-item-body' }, [el('div', {}, m.text), el('div', { class: 'muted small' }, `${studentLabel(student)} · ${formatDate(m.date)}`)]),
      ]));
    });
  });
}

/* ---------- מערכת ומשימות ---------- */
async function renderSchedule() {
  const section = el('section', { class: 'screen active' });
  section.appendChild(el('h1', {}, 'מערכת ומשימות'));

  section.appendChild(el('h2', {}, 'מערכת שעות אישית'));
  const schedule = (await DB.getAll('schedule')).sort((a, b) => WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day) || (a.time || '').localeCompare(b.time || ''));
  const schedList = el('div', { class: 'list' });
  schedule.forEach((s) => schedList.appendChild(el('div', { class: 'list-item static' }, [el('div', { class: 'list-item-body' }, [el('div', {}, `${s.day} · ${s.time}`), el('div', { class: 'muted small' }, s.activity)])])));
  section.appendChild(schedList);

  const daySel = el('select', { class: 'input' }, WEEK_DAYS.map((d) => el('option', { value: d }, d)));
  const timeInput = el('input', { class: 'input', placeholder: 'שעה, למשל 08:00' });
  const activityInput = el('input', { class: 'input', placeholder: 'פעילות' });
  section.appendChild(el('div', { class: 'row' }, [daySel, timeInput, activityInput, el('button', {
    class: 'btn primary', onclick: async () => {
      if (!activityInput.value.trim()) return;
      await DB.add('schedule', { day: daySel.value, time: timeInput.value.trim(), activity: activityInput.value.trim() });
      router();
    },
  }, 'הוספה')]));

  section.appendChild(el('h2', {}, 'משימות פתוחות'));
  const tasks = (await DB.getAll('tasks')).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const tList = el('div', { class: 'list' });
  tasks.forEach((t) => {
    const student = studentsCache.find((s) => s.id === t.studentId);
    tList.appendChild(el('div', { class: 'list-item' }, [
      el('input', { type: 'checkbox', checked: t.status === 'הושלם' ? 'checked' : null, onchange: async (e) => { t.status = e.target.checked ? 'הושלם' : 'פתוח'; await DB.put('tasks', t); router(); } }),
      el('div', { class: 'list-item-body' }, [el('div', {}, t.description), el('div', { class: 'muted small' }, `${student ? studentLabel(student) + ' · ' : ''}${formatDate(t.dueDate)} · ${t.status}`)]),
    ]));
  });
  section.appendChild(tList);

  const taskDesc = el('input', { class: 'input', placeholder: 'תיאור המשימה' });
  const taskDue = el('input', { type: 'date', class: 'input' });
  const taskStudent = el('select', { class: 'input' }, [el('option', { value: '' }, 'ללא שיוך תלמיד/ה'), ...studentsCache.map((s) => el('option', { value: s.id }, studentLabel(s)))]);
  section.appendChild(el('div', { class: 'row' }, [taskDesc, taskDue, taskStudent, el('button', {
    class: 'btn primary', onclick: async () => {
      if (!taskDesc.value.trim()) return;
      await DB.add('tasks', { description: taskDesc.value.trim(), dueDate: taskDue.value, status: 'פתוח', studentId: taskStudent.value ? Number(taskStudent.value) : null });
      router();
    },
  }, 'הוספת משימה')]));

  app.appendChild(section);
}

/* ---------- מודאל כללי ---------- */
function buildModal(title) {
  closeModal();
  const overlay = el('div', { class: 'modal-overlay', id: 'modal-overlay', onclick: (e) => { if (e.target.id === 'modal-overlay') closeModal(); } });
  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-header' }, [el('h3', {}, title), el('button', { class: 'btn-close', onclick: closeModal }, '×')]),
    el('div', { class: 'modal-body' }),
  ]);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return overlay;
}
function closeModal() {
  const existing = document.getElementById('modal-overlay');
  if (existing) existing.remove();
}

/* ---------- גיבוי / ייבוא ---------- */
async function exportBackup() {
  const data = await DB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `גיבוי-ניהול-כיתה-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function openBackupModal() {
  const overlay = buildModal('גיבוי וייבוא נתונים');
  const body = overlay.querySelector('.modal-body');
  body.appendChild(el('p', { class: 'muted small' }, 'מומלץ לייצא גיבוי ולהעלות אותו למאגר GitHub הפרטי שלך מדי פעם, ולפני מעבר בין המכשיר הנייד למחשב.'));
  body.appendChild(el('button', { class: 'btn primary', onclick: exportBackup }, 'ייצוא גיבוי (הורדת קובץ)'));
  const fileInput = el('input', { type: 'file', accept: '.json', class: 'input' });
  const status = el('p', { class: 'muted small' }, '');
  body.appendChild(el('label', {}, 'שחזור מקובץ גיבוי'));
  body.appendChild(fileInput);
  body.appendChild(el('button', {
    class: 'btn', onclick: async () => {
      const file = fileInput.files[0];
      if (!file) { alert('נא לבחור קובץ גיבוי'); return; }
      if (!confirm('שחזור יחליף את כל הנתונים הקיימים באפליקציה. להמשיך?')) return;
      const text = await file.text();
      const data = JSON.parse(text);
      await DB.importAll(data, { replace: true });
      status.textContent = 'השחזור הושלם בהצלחה.';
      setTimeout(() => { closeModal(); router(); }, 800);
    },
  }, 'שחזור מגיבוי'));
  body.appendChild(status);
}

/* ---------- אתחול ---------- */
async function init() {
  document.getElementById('backup-btn').addEventListener('click', openBackupModal);
  await router();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
