# Imagem de producao da Agenda Compartilhada.
# Debian slim (e nao alpine) porque o cliente libSQL tem binario pronto para glibc,
# o que evita compilar codigo nativo durante o build.
FROM node:22-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_FILE=/data/agenda.sqlite

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public
COPY scripts ./scripts

# O banco fica em um volume para sobreviver a reinicios e novas versoes.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
