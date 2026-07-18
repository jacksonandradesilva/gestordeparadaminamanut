# Banco de Dados para Vercel (Supabase)

## 1. Criar projeto no Supabase
1. Acesse https://supabase.com e crie um projeto.
2. Abra o SQL Editor.
3. Execute o script em `supabase/schema.sql`.
4. Em `Authentication > Providers`, mantenha `Email` habilitado.
5. Em `Authentication > URL Configuration`, configure a URL do site publicado na Vercel.

## 1.1 Criar primeiro usuario com e-mail/senha
Voce pode criar o primeiro acesso de duas formas:
- Pela tela de login do app (botao `Criar nova conta`).
- Pelo painel do Supabase em `Authentication > Users > Add user`.

## 1.2 Marcar usuario como administrador
Depois de criar o usuario, pegue o `UUID` dele em `Authentication > Users` e execute:

```sql
insert into public.admin_users (user_id)
values ('SEU-UUID-AQUI')
on conflict (user_id) do nothing;
```

Esse usuario tera acesso a pagina `Auditoria Admin` e podera ver:
- Dia e hora dos acessos.
- Alteracoes realizadas no sistema.

Agora ele tambem tera acesso a pagina `Liberacao de Acessos`, onde pode:
- Ver quem se cadastrou.
- Liberar usuarios pendentes.
- Voltar um usuario para pendente para bloquear o acesso as paginas.

### Atualizacao para quem ja tinha banco criado
Se sua tabela `app_state` ja existia antes, execute tambem este SQL:

```sql
alter table public.app_state
   add column if not exists owner_id uuid;

alter table public.app_state
   alter column owner_id drop not null;

alter table public.app_state
   add column if not exists relatorio_turnos_notas jsonb not null default '{}'::jsonb;

create table if not exists public.admin_users (
   user_id uuid primary key references auth.users(id) on delete cascade,
   created_at timestamptz not null default now()
);

create table if not exists public.user_access (
   user_id uuid primary key references auth.users(id) on delete cascade,
   email text,
   status text not null default 'pending',
   approved_at timestamptz,
   approved_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
   id bigint generated always as identity primary key,
   actor_id uuid not null references auth.users(id) on delete cascade,
   actor_email text,
   action text not null,
   details jsonb not null default '{}'::jsonb,
   created_at timestamptz not null default now()
);
```

## 2. Configurar variaveis no projeto React (local)
1. Copie `.env.example` para `.env.local` no ambiente local.
2. Preencha:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## 3. Rodar local
```bash
npm run dev
```

## 4. Configurar no Vercel
No projeto da Vercel, adicione as mesmas variaveis de ambiente:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Escopos recomendados: `Production`, `Preview` e `Development`.

Depois faca novo deploy (ou use Redeploy) para as variaveis entrarem no build.

### Checklist rapido de erro comum
- Confirme se `VITE_SUPABASE_URL` esta no formato `https://<project-ref>.supabase.co`.
- Nao use a URL do endpoint REST (`.../rest/v1`) nas variaveis.
- Use a chave `anon` (publica), nao a `service_role`.
- Abra o console do navegador no site da Vercel e confira se existe aviso de fallback para localStorage.

## Importante
- O deploy publicado no Vercel usa o app React em `src/` com o `index.html` da raiz como entrada.
- Os arquivos HTML antigos da raiz (`historico.html`, `historico_opcoes.html`, `relatorio.html`) nao fazem parte do build atual.
- Se voce alterar esses arquivos legados, a mudanca nao vai aparecer no site publicado.
- Para mudar o site que vai para o Vercel, atualize os arquivos em `src/` e rode `npm run build`.
- Sem variaveis do Supabase, o app fica bloqueado na tela de seguranca e nao libera as rotas.

## Observacao
- Com variaveis definidas, o acesso exige login com e-mail/senha.
- Toda nova conta entra como `pendente` e so acessa as paginas depois que um administrador liberar.
- Com RLS ativo, usuarios autenticados compartilham os mesmos dados operacionais (registro global `id = 'global'`).
