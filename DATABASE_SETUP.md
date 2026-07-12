eu jovem # Banco de Dados para Vercel (Supabase)

## 1. Criar projeto no Supabase
1. Acesse https://supabase.com e crie um projeto.
2. Abra o SQL Editor.
3. Execute o script em `supabase/schema.sql`.

### Atualizacao para quem ja tinha banco criado
Se sua tabela `app_state` ja existia antes, execute tambem este SQL:

```sql
alter table public.app_state
   add column if not exists relatorio_turnos_notas jsonb not null default '{}'::jsonb;
```

## 2. Configurar variaveis no projeto React
1. Copie `.env.example` para `.env` no ambiente local.
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

Depois faca novo deploy.

## Importante
- O deploy publicado no Vercel usa o app React em `src/` com o `index.html` da raiz como entrada.
- Os arquivos HTML antigos da raiz (`historico.html`, `historico_opcoes.html`, `relatorio.html`) nao fazem parte do build atual.
- Se voce alterar esses arquivos legados, a mudanca nao vai aparecer no site publicado.
- Para mudar o site que vai para o Vercel, atualize os arquivos em `src/` e rode `npm run build`.

## Observacao
- Se as variaveis nao estiverem definidas, o app usa localStorage como fallback.
- Com variaveis definidas, os dados sao persistidos no Supabase e funcionam em qualquer dispositivo.
