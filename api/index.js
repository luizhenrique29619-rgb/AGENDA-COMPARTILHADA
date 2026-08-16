'use strict';

/*
 * Porta de entrada da Vercel.
 *
 * Na Vercel nao existe um processo que fica ligado ouvindo uma porta: cada
 * requisicao chama uma funcao. Este arquivo entrega o mesmo app Express usado
 * em src/server.js, entao a agenda se comporta igual nos dois lugares.
 *
 * O vercel.json manda todas as rotas que nao sao arquivo estatico para ca.
 */

module.exports = require('../src/server');
