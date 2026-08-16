#!/usr/bin/env bash
#
# Publica a Agenda Compartilhada no Fly.io.
#
#   ./deploy-fly.sh                    # escolhe um nome automatico
#   ./deploy-fly.sh agenda-equipe-luiz # usa o nome que voce quiser
#
# Pode ser executado de novo com seguranca: cada etapa e ignorada se ja estiver
# pronta, entao se algo falhar no meio, corrija e rode o script outra vez.
#
# Variaveis opcionais:
#   FLY_REGION=gru        regiao (padrao: Sao Paulo)
#   FLY_ORG=personal      organizacao no Fly
#   INVITE_CODE=...       codigo de convite (padrao: gerado automaticamente)

set -euo pipefail

REGION="${FLY_REGION:-gru}"
ORG="${FLY_ORG:-personal}"
VOLUME="agenda_dados"

azul() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
erro() { printf '\n\033[1;31mERRO: %s\033[0m\n' "$1" >&2; }

falhou() {
  erro "$1"
  cat >&2 <<'FIM'

O que fazer agora:
  1. Leia a mensagem de erro acima.
  2. Corrija o que ela apontar e rode este script de novo — as etapas que ja
     deram certo sao puladas automaticamente.
  3. Se nao estiver claro, o passo a passo manual esta em DEPLOY.md.
FIM
  exit 1
}

# ---------------------------------------------------------------- pre-requisitos

if command -v fly >/dev/null 2>&1; then
  FLY=fly
elif command -v flyctl >/dev/null 2>&1; then
  FLY=flyctl
else
  falhou "a CLI do Fly nao foi encontrada. Instale com: curl -L https://fly.io/install.sh | sh"
fi

if ! $FLY auth whoami >/dev/null 2>&1; then
  falhou "voce ainda nao esta autenticado. Rode: $FLY auth login"
fi

[ -f fly.toml ] || falhou "rode o script de dentro da pasta do projeto (nao encontrei fly.toml)."

# ---------------------------------------------------------------- nome do app

APP="${1:-}"
if [ -z "$APP" ]; then
  SUFIXO=$(printf '%06x' $(( (RANDOM * 32768 + RANDOM) % 16777216 )))
  APP="agenda-compartilhada-${SUFIXO}"
fi
azul "Aplicativo: $APP (regiao $REGION)"

# ---------------------------------------------------------------- 1. criar o app

if $FLY status --app "$APP" >/dev/null 2>&1; then
  azul "1/4 O app ja existe no Fly — pulando a criacao."
else
  azul "1/4 Criando o app no Fly..."
  $FLY launch --no-deploy --copy-config --name "$APP" --region "$REGION" --org "$ORG" --yes \
    || falhou "nao consegui criar o app. Se o nome ja estiver em uso, rode: ./deploy-fly.sh outro-nome"
fi

# ---------------------------------------------------------------- 2. disco dos dados

azul "2/4 Verificando o disco onde a agenda guarda os eventos..."
if $FLY volumes list --app "$APP" 2>/dev/null | grep -q "$VOLUME"; then
  echo "    Volume '$VOLUME' ja existe — pulando."
else
  $FLY volumes create "$VOLUME" --size 1 --region "$REGION" --app "$APP" --yes \
    || falhou "nao consegui criar o volume '$VOLUME'."
fi

# ---------------------------------------------------------------- 3. codigo de convite

azul "3/4 Configurando o codigo de convite da equipe..."
if $FLY secrets list --app "$APP" 2>/dev/null | grep -q 'INVITE_CODE'; then
  echo "    INVITE_CODE ja estava definido — mantendo o atual."
  CODIGO="(o que voce ja havia definido)"
else
  CODIGO="${INVITE_CODE:-equipe-$(printf '%06x%04x' $(( (RANDOM * 32768 + RANDOM) % 16777216 )) $(( RANDOM % 65536 )))}"
  $FLY secrets set INVITE_CODE="$CODIGO" --app "$APP" \
    || falhou "nao consegui definir o INVITE_CODE."
fi

# ---------------------------------------------------------------- 4. publicar

azul "4/4 Publicando (a imagem e construida nos servidores do Fly)..."
$FLY deploy --remote-only --app "$APP" || falhou "a implantacao falhou. Veja os detalhes com: $FLY logs --app $APP"

# ---------------------------------------------------------------- pronto

cat <<FIM

------------------------------------------------------------------
 Agenda no ar!

   Endereco ........ https://${APP}.fly.dev
   Convite ......... ${CODIGO}

 Proximos passos:
   1. Abra o endereco e CRIE A SUA CONTA PRIMEIRO — a primeira pessoa
      que se cadastra vira a administradora da agenda.
   2. Mande para a equipe o endereco e o codigo de convite acima.

 Comandos uteis:
   $FLY logs --app $APP        ver o que esta acontecendo
   $FLY status --app $APP      estado do aplicativo
------------------------------------------------------------------
FIM
