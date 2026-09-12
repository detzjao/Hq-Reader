# HQ Reader

Aplicação web para organizar, gerenciar e ler histórias em quadrinhos
através de uma biblioteca unificada.

## Sobre o projeto

O HQ Reader centraliza histórias em quadrinhos vindas de diferentes
fontes, como Google Drive e Telegram, em uma única interface.

O sistema possui autenticação de usuários, biblioteca personalizada,
controle de permissões, leitor de HQs e painel administrativo.

## Funcionalidades

-   Biblioteca unificada de HQs
-   Login e autenticação com Supabase Auth
-   Usuários e administradores
-   Controle de permissões
-   Favoritos
-   Progresso de leitura
-   Página de detalhes
-   Leitor de quadrinhos
-   Integração com Google Drive
-   Integração com Telegram via Worker Python
-   Catálogo sincronizado
-   Downloads sob demanda
-   Painel administrativo
-   Tema claro e escuro
-   Interface responsiva

## Arquitetura

``` text
Telegram
   |
Worker Python
   |
Backend/API
 /       \
Drive   Supabase
   |
HQ Reader
   |
Usuário
```

O Worker Telegram é mantido separadamente em repositório privado.

## Tecnologias

### Frontend

-   JavaScript
-   Vite
-   HTML
-   CSS

### Backend

-   Node.js
-   APIs REST

### Banco e autenticação

-   Supabase
-   PostgreSQL
-   Supabase Auth
-   Row Level Security

### Integrações

-   Google Drive API v3
-   Telegram
-   Worker Python

### Deploy

-   Vercel
-   Git
-   GitHub

## Estrutura

``` text
Hq-Reader/
├── api/
├── data/
├── frontend/
├── scripts/
├── server/
├── supabase/
├── .env.example
├── package.json
└── vercel.json
```

## Google Drive

Suporte para:

-   Paginação
-   Subpastas
-   Recursão
-   Atalhos
-   Tentativas automáticas
-   Atualização do catálogo

## Telegram

O Worker Python faz a comunicação com o Telegram e disponibiliza os
arquivos para o HQ Reader.

As configurações de Telegram ficam restritas aos administradores.

## Permissões

### Usuário

-   Acessar biblioteca
-   Ler HQs
-   Favoritar
-   Acompanhar progresso

### Administrador

-   Gerenciar biblioteca
-   Configurar integrações
-   Sincronizar fontes
-   Administrar configurações

## Configuração

Instalação:

``` bash
git clone https://github.com/detzjao/Hq-Reader.git
cd Hq-Reader
npm install
```

Criar ambiente:

``` bash
copy .env.example .env
```

Configure Supabase e integrações necessárias.

## Google Drive

Variável:

``` env
GOOGLE_DRIVE_API_KEY=SUA_API_KEY
```

## Execução local

``` bash
npm run dev
```

ou:

``` text
start-local.bat
```

URLs:

``` text
Frontend: http://localhost:5173
API: http://127.0.0.1:8788
```

## Deploy

Compatível com Vercel utilizando as variáveis de ambiente configuradas
no painel.

## Objetivos técnicos

-   Aplicações web
-   APIs REST
-   Autenticação
-   Banco relacional
-   Integrações externas
-   Automação
-   Processamento de arquivos
-   Sincronização
-   UX/UI
-   Deploy

## Autor

**João Guilherme Dezotti**

GitHub: https://github.com/detzjao
