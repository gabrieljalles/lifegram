#!/usr/bin/env bash
# Aplica no Supabase as migracoes de supabase/migrations que ainda nao rodaram.
#
# Guarda o que ja rodou na tabela public._lifegram_migrations (uma linha por
# arquivo). Cada arquivo roda numa transacao: se falhar, nada dele fica pela
# metade e o arquivo nao e marcado, entao a proxima execucao tenta de novo.
#
# Uso: SUPABASE_DB_URL=postgresql://... scripts/migrate.sh
set -euo pipefail

: "${SUPABASE_DB_URL:?Defina SUPABASE_DB_URL (string de conexao do Session pooler)}"

# Ate esta migracao tudo foi colado a mao no SQL Editor: na primeira execucao
# essas sao so registradas como feitas, sem rodar de novo.
BASELINE="016"

DIR="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"
PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q -t -A)

first_run=$("${PSQL[@]}" -c "select to_regclass('public._lifegram_migrations') is null")

"${PSQL[@]}" -c "
  create table if not exists public._lifegram_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  );
  alter table public._lifegram_migrations enable row level security;"

if [ "$first_run" = "t" ]; then
  for file in "$DIR"/*.sql; do
    name="$(basename "$file")"
    num="${name%%_*}"
    if (( 10#$num <= 10#$BASELINE )); then
      "${PSQL[@]}" -c "insert into public._lifegram_migrations (name) values ('$name') on conflict do nothing"
      echo "registrada (ja aplicada a mao): $name"
    fi
  done
fi

applied=0
for file in "$DIR"/*.sql; do
  name="$(basename "$file")"
  done_already=$("${PSQL[@]}" -c "select count(*) from public._lifegram_migrations where name = '$name'")
  [ "$done_already" = "1" ] && continue
  echo "aplicando: $name"
  { cat "$file"; echo; echo "insert into public._lifegram_migrations (name) values ('$name');"; } \
    | "${PSQL[@]}" --single-transaction -f -
  applied=$((applied + 1))
done

echo "pronto: $applied migracao(oes) nova(s)."
