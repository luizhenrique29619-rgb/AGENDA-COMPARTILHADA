'use strict';

const express = require('express');
const db = require('../db');
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
  db.prepare(
    'INSERT INTO activity (event_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(eventId, userId, action, detail, new Date().toISOString());
}

const selectEvent = db.prepare(`
  SELECT e.*,
         creator.name AS created_by_name,
         editor.name  AS updated_by_name,
         (SELECT COUNT(*) FROM comments c WHERE c.event_id = e.id) AS comment_count
  FROM events e
  LEFT JOIN users creator ON creator.id = e.created_by
  LEFT JOIN users editor  ON editor.id  = e.updated_by
  WHERE e.id = ?
`);

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

router.get('/', (req, res) => {
  const from = isoOrNull(req.query.from);
  const to = isoOrNull(req.query.to);
  const search = String(req.query.search || '').trim();

  const where = [];
  const params = [];
  if (from && to) {
    // Qualquer evento que cruze a janela pedida.
    where.push('e.start_at <= ? AND e.end_at >= ?');
    params.push(to, from);
  }
  if (search) {
    where.push('(e.title LIKE ? OR e.description LIKE ? OR e.location LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const rows = db
    .prepare(`
      SELECT e.*,
             creator.name AS created_by_name,
             editor.name  AS updated_by_name,
             (SELECT COUNT(*) FROM comments c WHERE c.event_id = e.id) AS comment_count
      FROM events e
      LEFT JOIN users creator ON creator.id = e.created_by
      LEFT JOIN users editor  ON editor.id  = e.updated_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY e.start_at ASC
      LIMIT 1000
    `)
    .all(...params);

  res.json({ events: rows.map(shapeEvent) });
});

router.post('/', (req, res) => {
  const parsed = parseEventBody(req.body, req.user.color);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const e = parsed.value;
  const now = new Date().toISOString();
  const info = db
    .prepare(`
      INSERT INTO events (title, description, location, start_at, end_at, all_day, color, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(e.title, e.description, e.location, e.startAt, e.endAt, e.allDay, e.color, req.user.id, req.user.id, now, now);

  logActivity(info.lastInsertRowid, req.user.id, 'criou', e.title);
  res.status(201).json({ event: shapeEvent(selectEvent.get(info.lastInsertRowid)) });
});

router.get('/:id', (req, res) => {
  const event = shapeEvent(selectEvent.get(req.params.id));
  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });

  const comments = db
    .prepare(`
      SELECT c.id, c.body, c.created_at, c.updated_at, c.user_id, u.name AS author, u.color AS author_color
      FROM comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.event_id = ?
      ORDER BY c.created_at ASC
    `)
    .all(req.params.id)
    .map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      userId: c.user_id,
      author: c.author || 'Usuário removido',
      authorColor: c.author_color || '#8a8f98',
    }));

  const activity = db
    .prepare(`
      SELECT a.id, a.action, a.detail, a.created_at, u.name AS author
      FROM activity a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.event_id = ?
      ORDER BY a.created_at DESC
      LIMIT 30
    `)
    .all(req.params.id)
    .map((a) => ({ id: a.id, action: a.action, detail: a.detail, createdAt: a.created_at, author: a.author || 'Usuário removido' }));

  res.json({ event, comments, activity });
});

// Todos os membros da equipe podem editar qualquer evento.
router.put('/:id', (req, res) => {
  const current = selectEvent.get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Evento não encontrado.' });

  const parsed = parseEventBody(req.body, current.color);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const e = parsed.value;
  db.prepare(`
    UPDATE events
    SET title = ?, description = ?, location = ?, start_at = ?, end_at = ?, all_day = ?, color = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `).run(e.title, e.description, e.location, e.startAt, e.endAt, e.allDay, e.color, req.user.id, new Date().toISOString(), current.id);

  const changes = [];
  if (current.title !== e.title) changes.push(`título: "${current.title}" -> "${e.title}"`);
  if (current.start_at !== e.startAt || current.end_at !== e.endAt) changes.push('horário');
  if (current.location !== e.location) changes.push('local');
  if (current.description !== e.description) changes.push('descrição');
  logActivity(current.id, req.user.id, 'editou', changes.join(', '));

  res.json({ event: shapeEvent(selectEvent.get(current.id)) });
});

// Exclusão fica com quem criou o evento ou com um administrador.
router.delete('/:id', (req, res) => {
  const current = selectEvent.get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Evento não encontrado.' });
  if (current.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Somente quem criou o evento (ou um administrador) pode excluir.' });
  }
  db.prepare('DELETE FROM events WHERE id = ?').run(current.id);
  res.json({ ok: true });
});

// -------------------------------------------------------------- comentários

router.post('/:id/comments', (req, res) => {
  const event = selectEvent.get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });

  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Escreva alguma coisa antes de enviar.' });
  if (body.length > MAX_TEXT) return res.status(400).json({ error: 'Comentário longo demais.' });

  const now = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO comments (event_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(event.id, req.user.id, body, now, now);
  logActivity(event.id, req.user.id, 'comentou', '');

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
});

module.exports = router;
