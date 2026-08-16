# Como publicar a agenda para a equipe

Este guia deixa a agenda em um endereço público, com HTTPS, para os colegas acessarem pelo
navegador. Escolha **um** dos caminhos abaixo.

| Caminho | Custo | Cartão de crédito | Ponto fraco |
| --- | --- | --- | --- |
| **1. Vercel + Turso** | Grátis | Não pede | Exige o banco no Turso; o primeiro acesso após uma pausa demora alguns segundos |
| **2. Render + Turso** | Grátis | Não pede | Dorme após 15 min sem uso; o primeiro acesso demora ~1 min |
| **3. Fly.io** | Alguns dólares por mês | Pede no cadastro | Custo mensal |
| **4. Servidor próprio / VPS** | O que você já paga | — | Você cuida do servidor |

## Onde ficam os dados

A agenda guarda tudo em um banco SQLite. Ela aceita dois modos, e o código é o mesmo:

- **Arquivo local** (`DATABASE_FILE`) — para desenvolvimento e servidores com disco.
- **Turso** (`TURSO_DATABASE_URL`) — SQLite gerenciado na nuvem, para hospedagens sem disco.

> ⚠️ Hospedagem gratuita quase nunca tem disco que sobrevive a reinícios. Se você usar o modo
> arquivo em um serviço gratuito, **a agenda volta vazia toda vez que o servidor reiniciar**.
> É exatamente por isso que o caminho gratuito abaixo usa o Turso.

---

## Opção 1 — Grátis: Vercel + Turso

Nenhuma das duas contas pede cartão de crédito. Faça a **Parte A** (banco) e depois a **Parte B**.

### Parte A — Criar o banco no Turso

1. Acesse **[turso.tech](https://turso.tech)** e crie a conta (dá para entrar com o GitHub).
2. Crie um banco de dados com o nome que quiser, por exemplo `agenda`.
3. Guarde dois valores, que aparecem no painel do banco:
   - a **URL**, no formato `libsql://agenda-seuusuario.turso.io`
   - um **token de acesso** (*Create Token* / *Generate Token*)

Se preferir pelo terminal:

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create agenda
turso db show agenda --url        # a URL
turso db tokens create agenda     # o token
```

### Parte B — Publicar na Vercel

1. Acesse **[vercel.com](https://vercel.com)** e crie a conta entrando com o GitHub.
2. No painel: **Add New…** → **Project** → escolha o repositório `AGENDA-COMPARTILHADA` → **Import**.
3. Na tela de configuração:

   | Campo | O que colocar |
   | --- | --- |
   | **Framework Preset** | `Other` |
   | **Root Directory** | deixe como está — é a **raiz do repositório** (`./`). Não escolha subpasta. |
   | **Build Command** | vazio (a agenda não precisa de build) |
   | **Output Directory** | vazio |

4. Ainda nessa tela, abra **Environment Variables** e cadastre quatro:

   | Variável | O que colocar |
   | --- | --- |
   | `TURSO_DATABASE_URL` | a URL do passo A |
   | `TURSO_AUTH_TOKEN` | o token do passo A |
   | `INVITE_CODE` | um código secreto que você vai passar aos colegas |
   | `SECURE_COOKIES` | `true` — a Vercel já entrega o site em HTTPS |

5. Clique em **Deploy** e espere cerca de um minuto.

O endereço fica parecido com `https://agenda-compartilhada.vercel.app`.

> ⚠️ Na Vercel o `TURSO_DATABASE_URL` é **obrigatório**. O disco lá é somente leitura, então o
> modo arquivo (`DATABASE_FILE`) não tem onde guardar os eventos — a agenda avisa isso com uma
> mensagem clara em vez de falhar em silêncio.

### O que a raiz do projeto tem para a Vercel

| Arquivo | Para que serve |
| --- | --- |
| `vercel.json` | Manda toda rota que não é arquivo estático para a função da agenda. |
| `api/index.js` | Entrada da função: entrega o mesmo app Express de `src/server.js`. |
| `.vercelignore` | Deixa de fora do envio o que só serve para Docker, Fly e Render. |
| `public/` | Páginas, CSS e JavaScript, servidos direto pela CDN da Vercel. |

Como já existe o `vercel.json` na raiz, dá para publicar pelo terminal também:

```bash
npm i -g vercel
vercel                # primeira vez: cria o projeto (aceite os padrões)
vercel --prod         # publica em produção
```

---

## Opção 2 — Grátis: Render + Turso

O banco é o mesmo da Parte A da Opção 1.

### Publicar no Render

1. Acesse **[render.com](https://render.com)** e crie a conta (também dá para entrar com o GitHub).
2. No painel: **New** → **Blueprint**.
3. Conecte sua conta do GitHub e escolha o repositório `AGENDA-COMPARTILHADA`.
   Selecione a branch `claude/shared-agenda-collaboration-vj5jz7` (ou `main`, depois de mesclar o PR).
4. O Render lê o `render.yaml` sozinho e pergunta três variáveis:

   | Variável | O que colocar |
   | --- | --- |
   | `TURSO_DATABASE_URL` | a URL do passo A |
   | `TURSO_AUTH_TOKEN` | o token do passo A |
   | `INVITE_CODE` | um código secreto que você vai passar aos colegas |

5. Clique em **Apply** / **Create** e espere a primeira implantação (alguns minutos).

O endereço fica parecido com `https://agenda-compartilhada.onrender.com`.

### O que esperar do plano gratuito

- O serviço **dorme após 15 minutos sem acesso**. O primeiro acesso depois disso leva cerca de
  um minuto para responder — os seguintes são normais.
- **Os dados não se perdem** quando ele dorme, porque ficam no Turso.
- Se esse minuto de espera incomodar, a Opção 1 (Vercel) ou a Opção 3 (paga) não dormem.

---

## Opção 3 — Fly.io (paga, não dorme)

Roda o `Dockerfile` do repositório, com disco próprio e servidor em São Paulo (`gru`).
**O Fly pede cartão de crédito no cadastro**, mesmo para uso pequeno.

```bash
curl -L https://fly.io/install.sh | sh    # instala a CLI
fly auth login                            # abre o navegador
./deploy-fly.sh agenda-da-sua-equipe      # faz o resto
```

O `deploy-fly.sh` cria o app, cria o volume, gera o código de convite e publica. Ele pode ser
executado de novo com segurança: cada etapa já concluída é ignorada. Ao final imprime o
endereço e o código de convite.

Passo a passo manual, se preferir comando a comando:

```bash
fly launch --no-deploy --copy-config --name SUA-AGENDA --region gru
fly volumes create agenda_dados --size 1 --region gru
fly secrets set INVITE_CODE="um-codigo-secreto-da-equipe"
fly deploy --remote-only
fly open
```

---

## Opção 4 — Servidor próprio ou VPS

Qualquer máquina com Docker (inclusive um servidor da empresa):

```bash
git clone https://github.com/luizhenrique29619-rgb/AGENDA-COMPARTILHADA.git
cd AGENDA-COMPARTILHADA
INVITE_CODE="um-codigo-secreto-da-equipe" docker compose up -d
```

A agenda responde na porta `3000` e o banco fica no volume `agenda-dados`. Coloque um proxy
reverso com HTTPS na frente (Caddy, Nginx ou Cloudflare Tunnel) e então ligue
`SECURE_COOKIES=true`:

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

## Depois de publicar (vale para todos os caminhos)

1. **Abra o endereço e crie a sua conta primeiro** — a primeira pessoa que se cadastra vira a
   administradora da agenda.
2. Mande para a equipe o **link** e o **código de convite**. Cada colega clica em *Criar conta*,
   informa nome, e-mail de trabalho, senha e o código.
3. Confirme que o endereço é `https://` e que `SECURE_COOKIES=true` está ligado.

## Variáveis de ambiente

| Variável | Para que serve |
| --- | --- |
| `INVITE_CODE` | Código secreto do cadastro; sem ele ninguém entra na equipe. |
| `TURSO_DATABASE_URL` | Banco na nuvem. Tem prioridade sobre `DATABASE_FILE` quando preenchida. |
| `TURSO_AUTH_TOKEN` | Token do banco Turso. |
| `DATABASE_FILE` | Caminho do arquivo, quando o banco é local. |
| `SECURE_COOKIES` | `true` em produção com HTTPS. |
| `SESSION_DAYS` | Dias que o login continua válido. Padrão `30`. |
| `PORT` | Porta do servidor. Os serviços acima definem sozinhos. |

## Backup

**Turso:**

```bash
turso db shell agenda ".dump" > copia.sql
```

**Arquivo local ou Docker:**

```bash
docker compose exec agenda sh -c "sqlite3 /data/agenda.sqlite '.backup /data/copia.sqlite'"
docker compose cp agenda:/data/copia.sqlite ./copia.sqlite
```
