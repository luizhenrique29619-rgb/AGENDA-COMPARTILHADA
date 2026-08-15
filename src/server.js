'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { loadUser } = require('./auth');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const commentRoutes = require('./routes/comments');
const userRoutes = require('./routes/users');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(loadUser);

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
  app.listen(PORT, () => {
    console.log(`Agenda compartilhada rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
