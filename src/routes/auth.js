'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const wrap = require('../wrap');
const { createSession, destroySession, requireUser } = require('../auth');

const router = express.Router();

const INVITE_CODE = (process.env.INVITE_CODE || '').trim();

const PALETTE = ['#2f6fed', '#e0602f', '#2f9e6f', '#8b5cf6', '#d63384', '#0d9488', '#b45309', '#4f46e5'];

// Janela simples contra tentativas repetidas de login por IP.
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function tooManyAttempts(ip) {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function registerAttempt(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: Date.now() });
    return;
  }
  entry.count += 1;
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, color: user.color };
}

const findByEmail = (email) => db.get('SELECT * FROM users WHERE email = ?', [email]);
const countUsers = async () => (await db.get('SELECT COUNT(*) AS total FROM users')).total;

router.get('/config', wrap(async (_req, res) => {
  res.json({ inviteRequired: INVITE_CODE.length > 0, hasUsers: (await countUsers()) > 0 });
}));

router.get('/me', (req, res) => {
  res.json({ user: req.user || null });
});

router.post('/register', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const invite = String(req.body?.invite || '').trim();

  if (name.length < 2) return res.status(400).json({ error: 'Informe seu nome completo.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (password.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  if (INVITE_CODE && invite !== INVITE_CODE) {
    return res.status(403).json({ error: 'Código de convite incorreto. Peça o código ao responsável pela agenda.' });
  }
  if (await findByEmail(email)) {
    return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
  }

  const total = await countUsers();
  const role = total === 0 ? 'admin' : 'membro';
  const color = PALETTE[total % PALETTE.length];
  const hash = bcrypt.hashSync(password, 10);

  const info = await db.run(
    'INSERT INTO users (name, email, password_hash, role, color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, hash, role, color, new Date().toISOString()]
  );

  const user = { id: info.lastInsertRowid, name, email, role, color };
  await createSession(res, user.id);
  res.status(201).json({ user });
}));

router.post('/login', wrap(async (req, res) => {
  const ip = req.ip || 'desconhecido';
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = await findByEmail(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    registerAttempt(ip);
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  attempts.delete(ip);
  await createSession(res, user.id);
  res.json({ user: publicUser(user) });
}));

router.post('/logout', wrap(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

router.post('/password', requireUser, wrap(async (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (next.length < 8) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' });

  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(next, 10), user.id]);
  res.json({ ok: true });
}));

module.exports = router;
