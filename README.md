# HQ Reader 3.2.0 — Biblioteca unificada

Esta versão parte do HQ Reader 2.4.2 e corrige a arquitetura das versões 3.1.x.

## Mudanças principais

- Biblioteca inicial única em `/`.
- Google Drive continua como base principal.
- Telegram/HDs foi integrado à Biblioteca; não existe mais tela de usuário separada `/local`.
- URL/token do Worker local ficam somente em `Admin > Telegram / HDs`.
- Login e cadastro usam Supabase Auth.
- `profiles.role` separa `user` e `admin`.
- Painel `/admin` protegido por papel `admin`.
- `/api/comics` não derruba mais a Biblioteca por falha opcional do Supabase.
- Catálogo Drive usa seed + catálogo sincronizado + Supabase, com fallback local.
- Varredura completa dos cinco Drives usa Google Drive API v3, paginação de 1000 itens, recursão em subpastas, atalhos e retries.
- Novos arquivos descobertos ficam disponíveis também para `/api/content`, `/api/download` e CBZ/CBR; não apenas na listagem.
- Estado de leitura/favoritos é separado por usuário e pode ser persistido com RLS, sem exigir service-role para cada operação.
- Nova página `/comic/:id` antes do leitor, com hero, capa, metadados, CTAs e outras edições da coleção.
- Redesign Pop Art/Spider-Verse sutil, dark/light, halftone, hard shadows, cards 2:3 e progressos.

## 1. Supabase — configuração recomendada

No SQL Editor do mesmo projeto Supabase do HQ Reader, execute o arquivo único:

`supabase/HQ_READER_SETUP_3_2.sql`

Ele reúne as migrations 001 a 005 em ordem e é idempotente para a instalação esperada.

Depois crie sua conta pela tela `/login` e transforme a primeira conta em admin uma única vez:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where email = 'SEU_EMAIL';
```

Saia e entre novamente.

## 2. `.env`

Copie:

```bat
copy .env.example .env
```

Preencha as variáveis públicas e server-side do Supabase. A chave `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY` nunca deve receber prefixo `VITE_`.

A v3.2.0 final não contém URL/chave de nenhum projeto Supabase embutida. Se alguma variável estiver ausente, o login mostra a configuração faltante em vez de tentar acessar outro projeto silenciosamente.

Para a varredura completa das pastas públicas do Google Drive, habilite a Google Drive API no Google Cloud e adicione no backend:

```env
GOOGLE_DRIVE_API_KEY=SUA_API_KEY
```

A chave não precisa de OAuth para listar fontes públicas. Restrinja a key à Google Drive API no Google Cloud.

## 3. Rodar localmente

Na raiz:

```bat
npm install
start-local.bat
```

ou:

```bat
npm run dev
```

O comando sobe os dois processos:

- Frontend: `http://localhost:5173`
- API: `http://127.0.0.1:8788`

O Vite encaminha `/api/*` para a API local. Não rode apenas o Vite dentro de `frontend/`.

## 4. Buscar TUDO dos Drives

Entre como Admin e abra:

`Admin > Google Drive`

O seed de 698 HQs serve apenas como fallback inicial. Clique em **Sincronizar todos** para percorrer as cinco fontes completas.

A sincronização:

1. lista todas as páginas de cada pasta;
2. percorre subpastas recursivamente;
3. resolve atalhos para pasta/arquivo;
4. repete pastas que falharem até três vezes;
5. continua em vários lotes até a fila zerar;
6. salva os novos itens no catálogo runtime local e, quando a chave server-side estiver configurada, também no Supabase.

Em produção/Vercel, configure a chave server-side do Supabase para que o catálogo sincronizado seja persistente entre execuções serverless.

## 5. Telegram + HDs

O usuário não configura token nenhum.

Somente o Admin acessa:

`Admin > Telegram / HDs`

Ali ficam:

- URL do Worker v3;
- token local;
- teste de conexão;
- estado dos volumes/HDs;
- quantidade catalogada.

Depois de configurado, o catálogo Telegram aparece na mesma Biblioteca junto do Drive. Arquivos ainda remotos podem ser colocados na fila de download sob demanda.

## 6. Diagnóstico de API

Com `npm run dev` aberto, execute em outro terminal:

```bat
api-diagnostics.bat
```

Ele testa `/api/diagnostics`, `/api/comics` e `/api/library` e imprime corpo/status de cada rota. O objetivo é evitar o antigo “Erro HTTP 500” sem contexto.

## 7. Vercel

Foram incluídas rewrites para:

- `/api/drive-sync`
- `/api/diagnostics`
- `/comic/*`
- `/reader/*`
- `/admin`
- `/login`

Configure no projeto Vercel as mesmas variáveis server-side/públicas adequadas.
