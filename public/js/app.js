'use strict';

/* =========================================================================
   Agenda Compartilhada — interface da equipe.
   Todo membro autenticado pode criar, editar e comentar qualquer evento.
   ========================================================================= */

const COLORS = [
  { value: '#2f6fed', label: 'Azul' },
  { value: '#2f9e6f', label: 'Verde' },
  { value: '#e0602f', label: 'Laranja' },
  { value: '#d63384', label: 'Rosa' },
  { value: '#8b5cf6', label: 'Roxo' },
  { value: '#0d9488', label: 'Turquesa' },
  { value: '#b45309', label: 'Âmbar' },
  { value: '#475569', label: 'Cinza' },
];

const state = {
  user: null,
  view: 'month',
  cursor: startOfMonth(new Date()),
  events: [],
  search: '',
  current: null, // { event, comments, activity }
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ------------------------------------------------------------------ util */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function pad(n) { return String(n).padStart(2, '0'); }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

const fmtTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fmtFull = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

function relative(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `há ${days} d`;
  return fmtShort.format(new Date(iso));
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

let toastTimer;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível completar a ação.');
  return data;
}

/* ------------------------------------------------------------------ login */

function showError(node, message) {
  node.textContent = message;
  node.classList.remove('hidden');
}

async function boot() {
  const config = await api('/api/auth/config').catch(() => ({ inviteRequired: false, hasUsers: true }));
  if (config.inviteRequired) $('#invite-field').classList.remove('hidden');
  $('#auth-hint').textContent = config.hasUsers
    ? 'Use o e-mail cadastrado pela equipe. Ainda não tem conta? Crie uma com o código de convite.'
    : 'Você será o primeiro a entrar e ficará como administrador da agenda.';

  const { user } = await api('/api/auth/me').catch(() => ({ user: null }));
  if (user) enterApp(user);
  else $('#auth-screen').classList.remove('hidden');
}

$$('[data-auth-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('[data-auth-tab]').forEach((t) => t.classList.toggle('is-active', t === tab));
    const isLogin = tab.dataset.authTab === 'login';
    $('#login-form').classList.toggle('hidden', !isLogin);
    $('#register-form').classList.toggle('hidden', isLogin);
    $('#auth-error').classList.add('hidden');
  });
});

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      body: { email: form.get('email'), password: form.get('password') },
    });
    $('#auth-screen').classList.add('hidden');
    enterApp(user);
  } catch (error) {
    showError($('#auth-error'), error.message);
  }
});

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const { user } = await api('/api/auth/register', {
      method: 'POST',
      body: {
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
        invite: form.get('invite') || '',
      },
    });
    $('#auth-screen').classList.add('hidden');
    enterApp(user);
  } catch (error) {
    showError($('#auth-error'), error.message);
  }
});

function enterApp(user) {
  state.user = user;
  $('#app-screen').classList.remove('hidden');
  const avatar = $('#user-btn');
  avatar.textContent = initials(user.name);
  avatar.style.background = user.color;
  $('#menu-name').textContent = user.name;
  $('#menu-email').textContent = user.email;
  $('#menu-role').textContent = user.role === 'admin' ? 'Administrador' : 'Membro da equipe';
  fillColorSelect();
  refresh();
}

/* ------------------------------------------------------------- navegação */

$('#prev-btn').addEventListener('click', () => {
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1);
  refresh();
});
$('#next-btn').addEventListener('click', () => {
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1);
  refresh();
});
$('#today-btn').addEventListener('click', () => {
  state.cursor = startOfMonth(new Date());
  refresh();
});

$$('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    state.view = button.dataset.view;
    $$('[data-view]').forEach((b) => b.classList.toggle('is-active', b === button));
    render();
  });
});

let searchTimer;
$('#search-input').addEventListener('input', (event) => {
  clearTimeout(searchTimer);
  const value = event.target.value.trim();
  searchTimer = setTimeout(() => {
    state.search = value;
    refresh();
  }, 250);
});

$('#user-btn').addEventListener('click', (event) => {
  event.stopPropagation();
  $('#user-menu').classList.toggle('hidden');
});
document.addEventListener('click', () => $('#user-menu').classList.add('hidden'));

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

$('#team-btn').addEventListener('click', openTeam);
$('#password-btn').addEventListener('click', () => $('#password-modal').classList.remove('hidden'));

$$('[data-close-modal]').forEach((btn) =>
  btn.addEventListener('click', () => btn.closest('.overlay').classList.add('hidden'))
);
$$('.overlay').forEach((overlay) =>
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.classList.add('hidden');
  })
);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') $$('.overlay').forEach((o) => o.classList.add('hidden'));
});

/* ------------------------------------------------------------- carregar */

function visibleRange() {
  const first = startOfMonth(state.cursor);
  const gridStart = addDays(first, -first.getDay());
  return { start: gridStart, end: addDays(gridStart, 42) };
}

async function refresh() {
  try {
    if (state.search) {
      const { events } = await api(`/api/events?search=${encodeURIComponent(state.search)}`);
      state.events = events;
    } else {
      const { start, end } = visibleRange();
      const { events } = await api(`/api/events?from=${start.toISOString()}&to=${end.toISOString()}`);
      state.events = events;
    }
    render();
  } catch (error) {
    toast(error.message);
  }
}

/* ------------------------------------------------------------- renderizar */

function render() {
  $('#period-label').textContent = state.search
    ? `Busca: "${state.search}"`
    : fmtMonth.format(state.cursor);

  const showList = state.view === 'list' || Boolean(state.search);
  $('#month-view').classList.toggle('hidden', showList);
  $('#list-view').classList.toggle('hidden', !showList);
  if (showList) renderList();
  else renderMonth();
}

function eventsOfDay(key) {
  return state.events.filter((event) => {
    const start = dayKey(new Date(event.startAt));
    const end = dayKey(new Date(event.endAt));
    return key >= start && key <= end;
  });
}

function chipFor(event, key) {
  const start = new Date(event.startAt);
  const multiDay = dayKey(start) !== dayKey(new Date(event.endAt));
  const label = [];
  if (!event.allDay && dayKey(start) === key) {
    label.push(el('span', { class: 'chip-time', text: fmtTime.format(start) }));
  }
  label.push(el('span', { text: event.title }));
  if (multiDay) label.push(el('span', { class: 'chip-note', text: '→' }));
  if (event.commentCount > 0) label.push(el('span', { class: 'chip-note', text: `💬${event.commentCount}` }));

  return el(
    'button',
    {
      class: 'chip',
      style: { background: event.color },
      title: event.title,
      onclick: (e) => { e.stopPropagation(); openEvent(event.id); },
    },
    label
  );
}

function renderMonth() {
  const grid = $('#month-grid');
  grid.textContent = '';
  const { start } = visibleRange();
  const todayKey = dayKey(new Date());
  const month = state.cursor.getMonth();

  for (let i = 0; i < 42; i += 1) {
    const date = addDays(start, i);
    const key = dayKey(date);
    const cell = el('div', {
      class: `day${date.getMonth() !== month ? ' is-outside' : ''}${key === todayKey ? ' is-today' : ''}`,
      onclick: () => openNewEvent(key),
    });
    cell.appendChild(el('span', { class: 'day-number', text: String(date.getDate()) }));

    const dayEvents = eventsOfDay(key);
    dayEvents.slice(0, 3).forEach((event) => cell.appendChild(chipFor(event, key)));
    if (dayEvents.length > 3) {
      cell.appendChild(
        el('button', {
          class: 'more',
          text: `+${dayEvents.length - 3} evento(s)`,
          onclick: (e) => {
            e.stopPropagation();
            state.view = 'list';
            state.cursor = new Date(date.getFullYear(), date.getMonth(), 1);
            $$('[data-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.view === 'list'));
            refresh();
          },
        })
      );
    }
    grid.appendChild(cell);
  }
}

function renderList() {
  const body = $('#list-body');
  body.textContent = '';

  const events = [...state.events].sort((a, b) => a.startAt.localeCompare(b.startAt));
  if (!events.length) {
    body.appendChild(
      el('p', {
        class: 'empty',
        text: state.search ? 'Nenhum evento encontrado para essa busca.' : 'Nenhum evento neste período. Clique em "+ Novo evento".',
      })
    );
    return;
  }

  let lastKey = null;
  for (const event of events) {
    const start = new Date(event.startAt);
    const key = dayKey(start);
    if (key !== lastKey) {
      body.appendChild(el('h3', { class: 'list-day', text: fmtFull.format(start) }));
      lastKey = key;
    }

    const when = event.allDay
      ? 'Dia inteiro'
      : `${fmtTime.format(start)} — ${fmtTime.format(new Date(event.endAt))}`;
    const details = [when, event.location, `criado por ${event.createdByName}`].filter(Boolean).join(' · ');

    body.appendChild(
      el('button', { class: 'list-item', onclick: () => openEvent(event.id) }, [
        el('span', { class: 'list-dot', style: { background: event.color } }),
        el('span', { class: 'list-main' }, [
          el('strong', { text: event.title }),
          el('span', { class: 'muted small', text: details }),
        ]),
        event.commentCount > 0 ? el('span', { class: 'muted small', text: `💬 ${event.commentCount}` }) : null,
      ])
    );
  }
}

/* ------------------------------------------------------------- formulário */

function fillColorSelect() {
  const select = $('#color-select');
  select.textContent = '';
  COLORS.forEach((color) => select.appendChild(el('option', { value: color.value, text: color.label })));
}

function toInput(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function applyAllDayMode(allDay) {
  const form = $('#event-form');
  [form.elements.startAt, form.elements.endAt].forEach((input) => {
    const value = input.value;
    input.type = allDay ? 'date' : 'datetime-local';
    if (!value) return;
    input.value = allDay ? value.slice(0, 10) : (value.length === 10 ? `${value}T09:00` : value);
  });
}

$('#event-form').elements.allDay.addEventListener('change', (event) => applyAllDayMode(event.target.checked));

function openModalForm({ title, event }) {
  const form = $('#event-form');
  form.reset();
  $('#event-error').classList.add('hidden');
  $('#event-title').textContent = title;
  $('#event-view').classList.add('hidden');
  form.classList.remove('hidden');

  form.dataset.eventId = event?.id || '';
  form.elements.allDay.checked = Boolean(event?.allDay);
  applyAllDayMode(form.elements.allDay.checked);

  if (event) {
    form.elements.title.value = event.title;
    form.elements.description.value = event.description;
    form.elements.location.value = event.location;
    form.elements.color.value = COLORS.some((c) => c.value === event.color) ? event.color : COLORS[0].value;
    form.elements.startAt.value = event.allDay ? toInput(event.startAt).slice(0, 10) : toInput(event.startAt);
    form.elements.endAt.value = event.allDay ? toInput(event.endAt).slice(0, 10) : toInput(event.endAt);
  }
  $('#event-modal').classList.remove('hidden');
  form.elements.title.focus();
}

function openNewEvent(key) {
  const form = $('#event-form');
  const dateKey = key || dayKey(new Date());
  state.current = null;
  openModalForm({ title: 'Novo evento' });
  form.elements.color.value = state.user.color && COLORS.some((c) => c.value === state.user.color)
    ? state.user.color
    : COLORS[0].value;
  form.elements.startAt.value = `${dateKey}T09:00`;
  form.elements.endAt.value = `${dateKey}T10:00`;
}

$('#new-event-btn').addEventListener('click', () => openNewEvent(null));
$('#cancel-edit-btn').addEventListener('click', () => {
  if (state.current) showEventView();
  else $('#event-modal').classList.add('hidden');
});

$('#event-form').addEventListener('submit', async (submitEvent) => {
  submitEvent.preventDefault();
  const form = submitEvent.target;
  const allDay = form.elements.allDay.checked;
  const startValue = allDay ? `${form.elements.startAt.value}T00:00` : form.elements.startAt.value;
  const endValue = allDay ? `${form.elements.endAt.value}T23:59` : form.elements.endAt.value;

  if (!startValue || !endValue || startValue.startsWith('T') || endValue.startsWith('T')) {
    return showError($('#event-error'), 'Preencha as datas de início e término.');
  }

  const payload = {
    title: form.elements.title.value,
    description: form.elements.description.value,
    location: form.elements.location.value,
    color: form.elements.color.value,
    allDay,
    startAt: new Date(startValue).toISOString(),
    endAt: new Date(endValue).toISOString(),
  };

  const id = form.dataset.eventId;
  try {
    const result = id
      ? await api(`/api/events/${id}`, { method: 'PUT', body: payload })
      : await api('/api/events', { method: 'POST', body: payload });
    toast(id ? 'Evento atualizado para toda a equipe.' : 'Evento adicionado a agenda.');
    await refresh();
    await openEvent(result.event.id);
  } catch (error) {
    showError($('#event-error'), error.message);
  }
});

/* ------------------------------------------------------------- detalhes */

async function openEvent(id) {
  try {
    state.current = await api(`/api/events/${id}`);
    showEventView();
    $('#event-modal').classList.remove('hidden');
  } catch (error) {
    toast(error.message);
  }
}

function showEventView() {
  const { event, comments, activity } = state.current;
  $('#event-form').classList.add('hidden');
  $('#event-view').classList.remove('hidden');
  $('#event-title').textContent = event.title;

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const when = event.allDay
    ? (dayKey(start) === dayKey(end)
        ? `${fmtFull.format(start)} · dia inteiro`
        : `${fmtShort.format(start)} até ${fmtShort.format(end)} · dia inteiro`)
    : (dayKey(start) === dayKey(end)
        ? `${fmtFull.format(start)}, ${fmtTime.format(start)} — ${fmtTime.format(end)}`
        : `${fmtShort.format(start)} ${fmtTime.format(start)} até ${fmtShort.format(end)} ${fmtTime.format(end)}`);

  const meta = $('#event-meta');
  meta.textContent = '';
  const rows = [['Quando', when]];
  if (event.location) rows.push(['Local', event.location]);
  rows.push(['Criado por', `${event.createdByName} · ${relative(event.createdAt)}`]);
  if (event.updatedByName && event.updatedAt !== event.createdAt) {
    rows.push(['Última edição', `${event.updatedByName} · ${relative(event.updatedAt)}`]);
  }
  rows.forEach(([key, value]) =>
    meta.appendChild(
      el('div', { class: 'meta-row' }, [
        el('span', { class: 'meta-key', text: key }),
        el('span', { text: value }),
      ])
    )
  );

  const description = $('#event-description');
  description.textContent = event.description || 'Sem descrição.';
  description.classList.toggle('muted', !event.description);

  const canDelete = state.user.id === event.createdBy || state.user.role === 'admin';
  $('#delete-event-btn').classList.toggle('hidden', !canDelete);

  $('#comment-count').textContent = comments.length ? `(${comments.length})` : '';
  renderComments(comments);

  const list = $('#activity-list');
  list.textContent = '';
  if (!activity.length) list.appendChild(el('li', { text: 'Sem alterações registradas.' }));
  activity.forEach((item) =>
    list.appendChild(
      el('li', { text: `${item.author} ${item.action}${item.detail ? ` (${item.detail})` : ''} · ${relative(item.createdAt)}` })
    )
  );
}

function renderComments(comments) {
  const container = $('#comment-list');
  container.textContent = '';
  if (!comments.length) {
    container.appendChild(el('p', { class: 'muted small', text: 'Ninguém comentou ainda. Comece a conversa.' }));
    return;
  }

  comments.forEach((comment) => {
    const body = el('p', { class: 'comment-body', text: comment.body });
    const main = el('div', { class: 'comment-main' }, [
      el('div', { class: 'comment-head' }, [
        el('strong', { text: comment.author }),
        el('span', { class: 'muted small', text: relative(comment.createdAt) }),
        comment.updatedAt !== comment.createdAt ? el('span', { class: 'muted small', text: '(editado)' }) : null,
      ]),
      body,
    ]);

    const canEdit = comment.userId === state.user.id;
    const canDelete = canEdit || state.user.role === 'admin';
    if (canEdit || canDelete) {
      const actions = el('div', { class: 'comment-actions' });
      if (canEdit) {
        actions.appendChild(
          el('button', {
            class: 'link-btn',
            text: 'Editar',
            onclick: () => startCommentEdit(comment, main, body, actions),
          })
        );
      }
      if (canDelete) {
        actions.appendChild(
          el('button', {
            class: 'link-btn',
            text: 'Excluir',
            onclick: async () => {
              if (!confirm('Excluir este comentário?')) return;
              try {
                await api(`/api/comments/${comment.id}`, { method: 'DELETE' });
                await openEvent(state.current.event.id);
                await refresh();
              } catch (error) { toast(error.message); }
            },
          })
        );
      }
      main.appendChild(actions);
    }

    container.appendChild(
      el('div', { class: 'comment' }, [
        el('div', { class: 'comment-avatar', style: { background: comment.authorColor }, text: initials(comment.author) }),
        main,
      ])
    );
  });
}

function startCommentEdit(comment, main, body, actions) {
  const textarea = el('textarea', { rows: '3' });
  textarea.value = comment.body;
  const save = el('button', {
    class: 'btn btn-primary',
    text: 'Salvar',
    onclick: async () => {
      try {
        await api(`/api/comments/${comment.id}`, { method: 'PUT', body: { body: textarea.value } });
        await openEvent(state.current.event.id);
      } catch (error) { toast(error.message); }
    },
  });
  const cancel = el('button', { class: 'btn', text: 'Cancelar', onclick: () => openEvent(state.current.event.id) });

  body.replaceWith(textarea);
  actions.replaceWith(el('div', { class: 'row-actions', style: { marginTop: '8px' } }, [save, cancel]));
  textarea.focus();
}

$('#comment-form').addEventListener('submit', async (submitEvent) => {
  submitEvent.preventDefault();
  const textarea = submitEvent.target.elements.body;
  const value = textarea.value.trim();
  if (!value) return;
  try {
    await api(`/api/events/${state.current.event.id}/comments`, { method: 'POST', body: { body: value } });
    textarea.value = '';
    await openEvent(state.current.event.id);
    await refresh();
  } catch (error) {
    toast(error.message);
  }
});

$('#edit-event-btn').addEventListener('click', () =>
  openModalForm({ title: 'Editar evento', event: state.current.event })
);

$('#delete-event-btn').addEventListener('click', async () => {
  const { event } = state.current;
  if (!confirm(`Excluir "${event.title}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await api(`/api/events/${event.id}`, { method: 'DELETE' });
    $('#event-modal').classList.add('hidden');
    state.current = null;
    toast('Evento excluido.');
    refresh();
  } catch (error) {
    toast(error.message);
  }
});

/* ------------------------------------------------------------- equipe */

async function openTeam() {
  try {
    const { users } = await api('/api/users');
    const list = $('#team-list');
    list.textContent = '';
    users.forEach((user) => {
      const actions = [];
      if (state.user.role === 'admin' && user.id !== state.user.id) {
        actions.push(
          el('button', {
            class: 'link-btn',
            text: user.role === 'admin' ? 'Tornar membro' : 'Tornar administrador',
            onclick: async () => {
              try {
                await api(`/api/users/${user.id}/role`, {
                  method: 'PUT',
                  body: { role: user.role === 'admin' ? 'membro' : 'admin' },
                });
                openTeam();
              } catch (error) { toast(error.message); }
            },
          })
        );
      }
      list.appendChild(
        el('li', {}, [
          el('div', { class: 'comment-avatar', style: { background: user.color }, text: initials(user.name) }),
          el('div', { class: 'team-main' }, [
            el('strong', { text: user.name }),
            el('div', { class: 'muted small', text: `${user.email} · ${user.role === 'admin' ? 'administrador' : 'membro'}` }),
          ]),
          ...actions,
        ])
      );
    });
    $('#team-modal').classList.remove('hidden');
  } catch (error) {
    toast(error.message);
  }
}

$('#password-form').addEventListener('submit', async (submitEvent) => {
  submitEvent.preventDefault();
  const form = new FormData(submitEvent.target);
  try {
    await api('/api/auth/password', {
      method: 'POST',
      body: { current: form.get('current'), next: form.get('next') },
    });
    $('#password-modal').classList.add('hidden');
    submitEvent.target.reset();
    $('#password-error').classList.add('hidden');
    toast('Senha alterada.');
  } catch (error) {
    showError($('#password-error'), error.message);
  }
});

boot();
