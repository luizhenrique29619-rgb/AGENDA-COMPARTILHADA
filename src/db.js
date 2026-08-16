'use strict';

/*
 * Camada de dados da agenda.
 *
 * Usa libSQL, que fala o mesmo SQL do SQLite. Isso permite dois modos com o
 * mesmo codigo:
 *
 *   - arquivo local  -> desenvolvimento e servidor proprio (DATABASE_FILE)
 *   - Turso          -> hospedagem gratuita, sem disco (TURSO_DATABASE_URL)
 *
 * Todas as funcoes sao assincronas porque o banco pode estar na rede.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

function resolveConfig() {
  const remote = (process.env.TURSO_DATABASE_URL || '').trim();
  if (remote) {
    return { url: remote, authToken: process.env.TURSO_AUTH_TOKEN || undefined };
  }
  const file = process.env.DATABASE_FILE || path.join(__dirname, '..', 'data', 'agenda.sqlite');
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return { url: `file:${absolute}` };
}

const client = createClient(resolveConfig());

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'membro',
    color         TEXT NOT NULL DEFAULT '#2f6fed',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location    TEXT NOT NULL DEFAULT '',
    start_at    TEXT NOT NULL,
    end_at      TEXT NOT NULL,
    all_day     INTEGER NOT NULL DEFAULT 0,
    color       TEXT NOT NULL DEFAULT '#2f6fed',
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER REFERENCES events(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);
  CREATE INDEX IF NOT EXISTS idx_events_end ON events(end_at);
  CREATE INDEX IF NOT EXISTS idx_comments_event ON comments(event_id);
  CREATE INDEX IF NOT EXISTS idx_activity_event ON activity(event_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

/** Cria as tabelas na primeira execucao. Resolve uma vez so. */
let initPromise;
function init() {
  if (!initPromise) {
    initPromise = (async () => {
      await client.executeMultiple(SCHEMA);
      // Chaves estrangeiras precisam ser ligadas por conexao no modo arquivo.
      await client.execute('PRAGMA foreign_keys = ON').catch(() => {});
    })();
  }
  return initPromise;
}

/** Primeira linha do resultado, ou null. */
async function get(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows[0] ?? null;
}

/** Todas as linhas do resultado. */
async function all(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows;
}

/** Executa uma escrita. O lastInsertRowid vem como BigInt e e convertido aqui. */
async function run(sql, args = []) {
  const result = await client.execute({ sql, args });
  return {
    lastInsertRowid: result.lastInsertRowid === undefined ? null : Number(result.lastInsertRowid),
    rowsAffected: result.rowsAffected,
  };
}

module.exports = { client, init, get, all, run };
