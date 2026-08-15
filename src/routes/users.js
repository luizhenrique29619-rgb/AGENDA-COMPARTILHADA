'use strict';

const express = require('express');
const db = require('../db');
const { requireUser } = require('../auth');

const router = express.Router();
router.use(requireUser);

// Lista a equipe que usa a agenda.
router.get('/', (_req, res) => {
  const users = db
    .prepare('SELECT id, name, email, role, color, created_at FROM users ORDER BY name COLLATE NOCASE')
    .all()
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, color: u.color, createdAt: u.created_at }));
  res.json({ users });
});

// Um administrador pode promover ou rebaixar colegas.
router.put('/:id/role', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem alterar permissões.' });
  }
  const role = String(req.body?.role || '');
  if (!['admin', 'membro'].includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (target.role === 'admin' && role === 'membro') {
    const admins = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get().total;
    if (admins <= 1) return res.status(400).json({ error: 'A agenda precisa de pelo menos um administrador.' });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);
  res.json({ ok: true });
});

module.exports = router;
