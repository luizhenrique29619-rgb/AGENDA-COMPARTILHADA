# Como publicar a agenda para a equipe

Este guia deixa a agenda no ar em um endereço público, com HTTPS, para os colegas
acessarem pelo navegador. Escolha **um** dos caminhos abaixo.

## Antes de começar: os dados precisam de um disco

A agenda guarda tudo em um arquivo SQLite (`agenda.sqlite`). Em quase todos os serviços de
hospedagem o disco é **descartado a cada nova versão ou reinício** — e a agenda voltaria vazia.

> ⚠️ **Não use plano gratuito sem disco persistente.** No Render, o plano free não permite
> anexar disco; no Fly.io é preciso criar um *volume*. Os arquivos deste repositório já vêm
> configurados com o disco no lugar certo (`/data` no Docker e no Fly, `/var/data` no Render).

Planos pagos pequenos (na faixa de poucos dólares por mês — confirme o valor atual no site do
serviço) dão conta de uma equipe inteira com folga.

---

## Opção 1 — Fly.io (recomendada)

Roda o `Dockerfile` do repositório, tem volume de disco e servidor em São Paulo (`gru`).

```bash
# 1. Instale a CLI e faça login (abre o navegador)
curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Na pasta do projeto, crie o app (o fly.toml já está pronto; não deixe ele
#    criar banco de dados nem implantar ainda)
fly launch --no-deploy --copy-config --name SUA-AGENDA

# 3. Crie o disco onde a agenda vai morar
fly volumes create agenda_dados --size 1 --region gru

# 4. Defina o código de convite da equipe
fly secrets set INVITE_CODE="um-codigo-secreto-da-equipe"

# 5. Publique
fly deploy
fly open
```

O endereço fica `https://SUA-AGENDA.fly.dev`.

## Opção 2 — Render

Use o `render.yaml` já incluído.

1. Acesse o painel do Render → **New** → **Blueprint**.
2. Conecte a conta do GitHub e escolha o repositório `AGENDA-COMPARTILHADA`.
3. O Render lê o `render.yaml` sozinho (plano *starter*, disco de 1 GB montado em `/var/data`).
4. Quando pedir, preencha a variável **`INVITE_CODE`** com o código que os colegas vão digitar.
5. **Create** e aguarde a primeira implantação.

O endereço fica `https://agenda-compartilhada.onrender.com` (ou o nome que você escolher).

## Opção 3 — Servidor próprio ou VPS

Qualquer máquina com Docker (inclusive um servidor da empresa):

```bash
git clone https://github.com/luizhenrique29619-rgb/AGENDA-COMPARTILHADA.git
cd AGENDA-COMPARTILHADA
INVITE_CODE="um-codigo-secreto-da-equipe" docker compose up -d
```

A agenda responde na porta `3000`. Coloque um proxy reverso com HTTPS na frente
(Caddy, Nginx ou Cloudflare Tunnel) e então ligue `SECURE_COOKIES=true`:

```bash
INVITE_CODE="..." SECURE_COOKIES=true docker compose up -d --force-recreate
```

Exemplo mínimo de `Caddyfile`, que já cuida do certificado:

```
agenda.suaempresa.com.br {
    reverse_proxy localhost:3000
}
```

---

## Depois de publicar

1. **Abra o endereço e crie a sua conta primeiro** — a primeira pessoa que se cadastra vira a
   administradora da agenda.
2. Mande para a equipe o **link** e o **código de convite**. Cada colega clica em *Criar conta*,
   informa nome, e-mail de trabalho, senha e o código.
3. Confirme que `SECURE_COOKIES=true` está ligado (o endereço precisa ser `https://`).

## Variáveis de ambiente

| Variável | Valor em produção |
| --- | --- |
| `INVITE_CODE` | Um código secreto seu; sem ele ninguém entra na equipe. |
| `SECURE_COOKIES` | `true` (o site estará em HTTPS). |
| `DATABASE_FILE` | Caminho dentro do disco persistente. Já configurado nos arquivos do repositório. |
| `SESSION_DAYS` | Quantos dias o login continua válido. Padrão `30`. |
| `PORT` | Porta do servidor. Os serviços acima já definem sozinhos. |

## Backup

Todo o conteúdo é um arquivo só. Faça uma cópia de tempos em tempos:

```bash
# Fly.io
fly ssh console -C "sqlite3 /data/agenda.sqlite '.backup /data/copia.sqlite'"
fly ssh sftp get /data/copia.sqlite

# Docker
docker compose exec agenda sh -c "sqlite3 /data/agenda.sqlite '.backup /data/copia.sqlite'"
docker compose cp agenda:/data/copia.sqlite ./copia.sqlite
```

## Se a equipe crescer muito

O SQLite aguenta com sobra uma equipe de escritório (dezenas de pessoas usando ao mesmo tempo).
Se um dia a agenda precisar rodar em várias máquinas ao mesmo tempo, aí sim vale trocar por
PostgreSQL — as consultas ficam concentradas em `src/db.js` e nas rotas, então a migração é
localizada.
