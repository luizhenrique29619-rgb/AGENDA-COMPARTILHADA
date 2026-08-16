'use strict';

const express = require('express');
const db = require('../db');
const wrap = require('../wrap');
const { requireUser } = require('../auth');

const router = express.Router();
router.use(requireUser);

// Lista a equipe que usa a agenda.
router.get('/', wrap(async (_req, res) => {
  const rows = await db.all('SELECT id, name, email, role, color, created_at FROM users ORDER BY name COLLATE NOCASE');
  res.json({
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      color: u.color,
      createdAt: u.created_at,
    })),
  });
}));

// Um administrador pode promover ou rebaixar colegas.
router.put('/:id/role', wrap(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem alterar permissões.' });
  }
  const role = String(req.body?.role || '');
  if (!['admin', 'membro'].includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });

  const target = await db.get('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (target.role === 'admin' && role === 'membro') {
    const { total } = await db.get("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
    if (total <= 1) return res.status(400).json({ error: 'A agenda precisa de pelo menos um administrador.' });
  }

  await db.run('UPDATE users SET role = ? WHERE id = ?', [role, target.id]);
  res.json({ ok: true });
}));

module.exports = router;
