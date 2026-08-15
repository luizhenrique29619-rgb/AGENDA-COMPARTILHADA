'use strict';

const crypto = require('crypto');
const db = require('./db');

const COOKIE_NAME = 'agenda_sessao';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const SECURE_COOKIES = String(process.env.SECURE_COOKIES || 'false') === 'true';

const insertSession = db.prepare(
  'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
);
const findSession = db.prepare(`
  SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role, u.color
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token = ?
`);
const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
const purgeExpired = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')");

function createSession(res, userId) {
  purgeExpired.run();
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  insertSession.run(token, userId, now.toISOString(), expires.toISOString());
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE_COOKIES,
    expires,
    path: '/',
  });
  return token;
}

function destroySession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) deleteSession.run(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Popula req.user quando houver sessão válida. Nunca bloqueia. */
function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  const row = findSession.get(token);
  if (!row) return next();
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession.run(token);
    return next();
  }
  req.user = { id: row.id, name: row.name, email: row.email, role: row.role, color: row.color };
  next();
}

/** Exige login para as rotas da API. */
function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Você precisa entrar na agenda.' });
  next();
}

module.exports = { COOKIE_NAME, createSession, destroySession, loadUser, requireUser };
