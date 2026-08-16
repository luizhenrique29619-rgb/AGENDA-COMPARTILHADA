'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./db');
const wrap = require('./wrap');
const { loadUser } = require('./auth');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const commentRoutes = require('./routes/comments');
const userRoutes = require('./routes/users');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Criação das tabelas. Fica pronta antes da primeira requisição ser atendida.
const ready = db.init();

/*
 * Em serverless (Vercel) ninguém chama app.listen, então uma falha do banco aqui
 * ficaria sem tratamento e derrubaria a função com um erro obscuro. Este catch
 * vazio só marca a promessa como tratada: o erro real continua chegando ao
 * middleware abaixo, que responde 500 com a mensagem no log.
 */
ready.catch(() => {});

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(wrap(async (_req, _res, next) => {
  await ready;
  next();
}));
app.use(wrap(loadUser));

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/users', userRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro inesperado no servidor.' });
});

if (require.main === module) {
  ready
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Agenda compartilhada rodando em http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Não consegui preparar o banco de dados:', error);
      process.exit(1);
    });
}

module.exports = app;
module.exports.ready = ready;
