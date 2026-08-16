'use strict';

const express = require('express');
const db = require('../db');
const wrap = require('../wrap');
const { requireUser } = require('../auth');

const router = express.Router();
router.use(requireUser);

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_TITLE = 140;
const MAX_TEXT = 4000;

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseEventBody(body, fallbackColor) {
  const title = String(body?.title || '').trim();
  const description = String(body?.description || '').trim();
  const location = String(body?.location || '').trim();
  const allDay = body?.allDay ? 1 : 0;
  const startAt = isoOrNull(body?.startAt);
  const endAt = isoOrNull(body?.endAt);
  const color = HEX.test(String(body?.color || '')) ? String(body.color) : fallbackColor;

  if (!title) return { error: 'O evento precisa de um título.' };
  if (title.length > MAX_TITLE) return { error: `O título deve ter até ${MAX_TITLE} caracteres.` };
  if (description.length > MAX_TEXT) return { error: 'A descrição está longa demais.' };
  if (!startAt) return { error: 'Informe a data e a hora de início.' };
  if (!endAt) return { error: 'Informe a data e a hora de término.' };
  if (new Date(endAt) < new Date(startAt)) return { error: 'O término não pode ser antes do início.' };

  return { value: { title, description, location, allDay, startAt, endAt, color } };
}

function logActivity(eventId, userId, action, detail = '') {
  return db.run(
    'INSERT INTO activity (event_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
    [eventId, userId, action, detail, new Date().toISOString()]
  );
}

const EVENT_COLUMNS = `
  e.*,
  creator.name AS created_by_name,
  editor.name  AS updated_by_name,
  (SELECT COUNT(*) FROM comments c WHERE c.event_id = e.id) AS comment_count
`;

const EVENT_JOINS = `
  FROM events e
  LEFT JOIN users creator ON creator.id = e.created_by
  LEFT JOIN users editor  ON editor.id  = e.updated_by
`;

const findEvent = (id) => db.get(`SELECT ${EVENT_COLUMNS} ${EVENT_JOINS} WHERE e.id = ?`, [id]);

function shapeEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: Boolean(row.all_day),
    color: row.color,
    createdBy: row.created_by,
    createdByName: row.created_by_name || 'Usuário removido',
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commentCount: row.comment_count ?? 0,
  };
}

// ---------------------------------------------------------------- eventos

router.get('/', wrap(async (req, res) => {
  const from = isoOrNull(req.query.from);
  const to = isoOrNull(req.query.to);
  const search = String(req.query.search || '').trim();

  const where = [];
  const args = [];
  if (from && to) {
    // Qualquer evento que cruze a janela pedida.
    where.push('e.start_at <= ? AND e.end_at >= ?');
    args.push(to, from);
  }
  if (search) {
    where.push('(e.title LIKE ? OR e.description LIKE ? OR e.location LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like);
  }

  const rows = await db.all(
    `SELECT ${EVENT_COLUMNS} ${EVENT_JOINS}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.start_at ASC
     LIMIT 1000`,
    args
  );

  res.json({ events: rows.map(shapeEvent) });
}));

router.post('/', wrap(async (req, res) => {
  const parsed = parseEventBody(req.body, req.user.color);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const e = parsed.value;
  const now = new Date().toISOString();
  const info = await db.run(
    `INSERT INTO events (title, description, location, start_at, end_at, all_day, color, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.title, e.description, e.location, e.startAt, e.endAt, e.allDay, e.color, req.user.id, req.user.id, now, now]
  );

  await logActivity(info.lastInsertRowid, req.user.id, 'criou', e.title);
  res.status(201).json({ event: shapeEvent(await findEvent(info.lastInsertRowid)) });
}));

router.get('/:id', wrap(async (req, res) => {
  const event = shapeEvent(await findEvent(req.params.id));
  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });

  const comments = (
    await db.all(
      `SELECT c.id, c.body, c.created_at, c.updated_at, c.user_id, u.name AS author, u.color AS author_color
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.event_id = ?
       ORDER BY c.created_at ASC`,
      [req.params.id]
    )
  ).map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    userId: c.user_id,
    author: c.author || 'Usuário removido',
    authorColor: c.author_color || '#8a8f98',
  }));

  const activity = (
    await db.all(
      `SELECT a.id, a.action, a.detail, a.created_at, u.name AS author
       FROM activity a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.event_id = ?
       ORDER BY a.created_at DESC
       LIMIT 30`,
      [req.params.id]
    )
  ).map((a) => ({
    id: a.id,
    action: a.action,
    detail: a.detail,
    createdAt: a.created_at,
    author: a.author || 'Usuário removido',
  }));

  res.json({ event, comments, activity });
}));

// Todos os membros da equipe podem editar qualquer evento.
router.put('/:id', wrap(async (req, res) => {
  const current = await findEvent(req.params.id);
  if (!current) return res.status(404).json({ error: 'Evento não encontrado.' });

  const parsed = parseEventBody(req.body, current.color);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const e = parsed.value;
  await db.run(
    `UPDATE events
     SET title = ?, description = ?, location = ?, start_at = ?, end_at = ?, all_day = ?, color = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
    [e.title, e.description, e.location, e.startAt, e.endAt, e.allDay, e.color, req.user.id, new Date().toISOString(), current.id]
  );

  const changes = [];
  if (current.title !== e.title) changes.push(`título: "${current.title}" -> "${e.title}"`);
  if (current.start_at !== e.startAt || current.end_at !== e.endAt) changes.push('horário');
  if (current.location !== e.location) changes.push('local');
  if (current.description !== e.description) changes.push('descrição');
  await logActivity(current.id, req.user.id, 'editou', changes.join(', '));

  res.json({ event: shapeEvent(await findEvent(current.id)) });
}));

// Exclusão fica com quem criou o evento ou com um administrador.
router.delete('/:id', wrap(async (req, res) => {
  const current = await findEvent(req.params.id);
  if (!current) return res.status(404).json({ error: 'Evento não encontrado.' });
  if (current.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Somente quem criou o evento (ou um administrador) pode excluir.' });
  }
  await db.run('DELETE FROM events WHERE id = ?', [current.id]);
  res.json({ ok: true });
}));

// -------------------------------------------------------------- comentários

router.post('/:id/comments', wrap(async (req, res) => {
  const event = await findEvent(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });

  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Escreva alguma coisa antes de enviar.' });
  if (body.length > MAX_TEXT) return res.status(400).json({ error: 'Comentário longo demais.' });

  const now = new Date().toISOString();
  const info = await db.run(
    'INSERT INTO comments (event_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [event.id, req.user.id, body, now, now]
  );
  await logActivity(event.id, req.user.id, 'comentou', '');

  res.status(201).json({
    comment: {
      id: info.lastInsertRowid,
      body,
      createdAt: now,
      updatedAt: now,
      userId: req.user.id,
      author: req.user.name,
      authorColor: req.user.color,
    },
  });
}));

module.exports = router;
