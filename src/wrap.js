'use strict';

/*
 * O Express 4 não captura erros de funções assíncronas sozinho: uma promessa
 * rejeitada dentro da rota derrubaria a requisição em silêncio. Este auxiliar
 * encaminha qualquer falha para o tratador de erros do servidor.
 */
module.exports = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
