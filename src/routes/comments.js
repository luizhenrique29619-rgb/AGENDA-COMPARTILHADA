'use strict';

const express = require('express');
const db = require('../db');
const { requireUser } = require('../auth');

const router = express.Router();
router.use(requireUser);

const MAX_TEXT = 4000;
const findComment = db.prepare('SELECT * FROM comments WHERE id = ?');

// Cada pessoa edita o próprio comentário.
router.put('/:id', (req, res) => {
  const comment = findComment.get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado.' });
  if (comment.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Você só pode editar os seus próprios comentários.' });
  }

  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'O comentário não pode ficar vazio.' });
  if (body.length > MAX_TEXT) return res.status(400).json({ error: 'Comentário longo demais.' });

  const now = new Date().toISOString();
  db.prepare('UPDATE comments SET body = ?, updated_at = ? WHERE id = ?').run(body, now, comment.id);
  res.json({ comment: { id: comment.id, body, updatedAt: now } });
});

// O autor apaga o próprio comentário; administradores podem moderar.
router.delete('/:id', (req, res) => {
  const comment = findComment.get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado.' });
  if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Você só pode excluir os seus próprios comentários.' });
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  res.json({ ok: true });
});

module.exports = router;
