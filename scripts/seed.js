'use strict';

/*
 * Cria dados de demonstração para testar a agenda.
 *   npm run seed
 * Login de exemplo: ana@empresa.com / senha1234
 */

const bcrypt = require('bcryptjs');
const db = require('../src/db');

const now = new Date();
const iso = (d) => d.toISOString();
const at = (dayOffset, hour, minute = 0) =>
  iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute));

const people = [
  { name: 'Ana Souza', email: 'ana@empresa.com', role: 'admin', color: '#2f6fed' },
  { name: 'Bruno Lima', email: 'bruno@empresa.com', role: 'membro', color: '#e0602f' },
  { name: 'Carla Dias', email: 'carla@empresa.com', role: 'membro', color: '#2f9e6f' },
];

const events = [
  { title: 'Reunião semanal da equipe', location: 'Sala 2', description: 'Alinhamento das prioridades da semana.', start: at(0, 9), end: at(0, 10), by: 'ana@empresa.com', color: '#2f6fed' },
  { title: 'Entrega do relatório mensal', location: '', description: 'Consolidar números de vendas.', start: at(2, 14), end: at(2, 16), by: 'bruno@empresa.com', color: '#e0602f' },
  { title: 'Treinamento de segurança', location: 'Auditório', description: 'Presença obrigatória.', start: at(4, 13, 30), end: at(4, 17), by: 'carla@empresa.com', color: '#2f9e6f' },
  { title: 'Feriado / equipe reduzida', location: '', description: '', start: at(9, 0), end: at(9, 23, 59), allDay: 1, by: 'ana@empresa.com', color: '#475569' },
];

async function main() {
  await db.init();

  const hash = bcrypt.hashSync('senha1234', 10);
  const ids = {};

  for (const person of people) {
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [person.email]);
    if (existing) {
      ids[person.email] = existing.id;
      continue;
    }
    const info = await db.run(
      'INSERT INTO users (name, email, password_hash, role, color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [person.name, person.email, hash, person.role, person.color, iso(now)]
    );
    ids[person.email] = info.lastInsertRowid;
  }

  for (const event of events) {
    const already = await db.get('SELECT id FROM events WHERE title = ? AND start_at = ?', [event.title, event.start]);
    if (already) continue;

    const author = ids[event.by];
    const info = await db.run(
      `INSERT INTO events (title, description, location, start_at, end_at, all_day, color, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.title, event.description || '', event.location || '', event.start, event.end, event.allDay || 0, event.color, author, author, iso(now), iso(now)]
    );

    await db.run('INSERT INTO activity (event_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)', [
      info.lastInsertRowid,
      author,
      'criou',
      event.title,
      iso(now),
    ]);
  }

  const first = await db.get('SELECT id FROM events ORDER BY id LIMIT 1');
  if (first && !(await db.get('SELECT id FROM comments WHERE event_id = ?', [first.id]))) {
    await db.run('INSERT INTO comments (event_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
      first.id,
      ids['bruno@empresa.com'],
      'Consigo participar, mas preciso sair 10 minutos antes.',
      iso(now),
      iso(now),
    ]);
    await db.run('INSERT INTO comments (event_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
      first.id,
      ids['carla@empresa.com'],
      'Vou levar os números do suporte para a pauta.',
      iso(now),
      iso(now),
    ]);
  }

  console.log('Dados de exemplo criados. Entre com ana@empresa.com / senha1234');
}

main().catch((error) => {
  console.error('Não consegui criar os dados de exemplo:', error);
  process.exit(1);
});
