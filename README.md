# HQ Reader

Leitor web de HQs com biblioteca organizada por **Marvel**, **DC Comics** e **Turma da Mônica**.

## Recursos

- Biblioteca com busca e filtros por categoria.
- Leitura de PDF com PDF.js.
- Leitura de CBZ e CBR página a página.
- Imagens JPG, JPEG, PNG, WEBP e GIF.
- Zoom, tela cheia, miniaturas, modo página única e rolagem vertical.
- Progresso de leitura salvo no navegador.
- Importação de HQ por link público do Google Drive.
- Importação direta de arquivos do computador.
- Importação múltipla de arquivos.
- Download das HQs pelo card da biblioteca e pela barra do leitor.
- Atualização das pastas públicas configuradas no catálogo.
- Catálogo local em `backend/data/library.json`.

## Fontes configuradas

O projeto já vem configurado com três fontes:

- **Marvel** — `1IShfGFxk8qG4JQ6TXk1vLHrXRp7KF7ci`
- **DC Comics** — `1-9bSxiCfavMPf9g0wzSDFVkzJqS6j2nI`
- **Turma da Mônica** — `1LtX8qYpKFYp5pfMK4FWiO6EZPpLey49D`

Ao iniciar, o backend tenta atualizar essas bibliotecas. Também existe o botão **Atualizar** em `Configurações → Biblioteca`.

## Importar uma HQ do computador

Abra:

`Adicionar HQs → Biblioteca → Importar arquivo`

Selecione um ou vários arquivos e, se quiser, informe um caminho de categoria/coleção, por exemplo:

```text
Marvel/Homem-Aranha
DC Comics/Batman
Turma da Mônica/Cebolinha
```

Os arquivos enviados são armazenados em `backend/data/uploads/` e adicionados ao catálogo.

Formatos aceitos:

```text
.pdf .cbz .cbr .jpg .jpeg .png .webp .gif
```

## Adicionar por link

Também é possível cadastrar um arquivo público do Drive diretamente pela interface.

Exemplo de coleção:

```text
DC Comics/Batman
```

Exemplo de importação em lote:

```text
DC Comics/Batman/Batman 001.pdf | https://drive.google.com/file/d/ID/view
Marvel/X-Men/X-Men 001.cbz | https://drive.google.com/file/d/ID/view
```

## Download

Cada HQ possui um botão de download na biblioteca. O leitor também possui um botão de download na barra superior.

O download passa pelo backend, portanto funciona tanto para arquivos cadastrados por link quanto para arquivos importados diretamente para o HQ Reader.

## Executar

Na raiz do projeto:

```bash
npm install
npm run install:all
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:3001
```

## Produção

Para build do frontend:

```bash
npm run build
```

Se frontend e backend estiverem em domínios diferentes, configure `VITE_API_BASE_URL` no frontend e `FRONTEND_ORIGIN` no backend.

## Persistência

O catálogo é salvo em:

```text
backend/data/library.json
```

HQs importadas do computador ficam em:

```text
backend/data/uploads/
```

Em hospedagens com disco efêmero, configure armazenamento persistente para esses dois caminhos.

## Correções desta versão

- Corrigida a gravação concorrente do catálogo que podia causar `Erro HTTP 500` ao importar vários links enquanto a biblioteca sincronizava.
- Importações, uploads e sincronizações agora atualizam `library.json` de forma serializada e atômica.
- O catálogo inicial inclui HQs nas categorias Marvel, DC Comics e Turma da Mônica, evitando uma biblioteca vazia quando o Google bloqueia temporariamente a varredura pública.
- A atualização das fontes tolera falhas isoladas de subpastas e mostra o erro específico de cada fonte na interface.

## Publicação: Vercel + Render

O projeto usa dois serviços em produção:

- **Vercel**: frontend React/Vite.
- **Render**: backend Express e catálogo da biblioteca.

### 1. Render

Crie um **Web Service** apontando para este repositório/projeto.

Se usar o arquivo `render.yaml`, o serviço já recebe os comandos corretos. Se configurar manualmente:

```text
Build Command: npm install --prefix backend
Start Command: npm run start --prefix backend
Health Check: /api/health
```

Variáveis recomendadas no Render:

```text
FRONTEND_ORIGIN=https://hq-reader-seven.vercel.app
ALLOW_VERCEL_PREVIEWS=true
SYNC_PUBLIC_FOLDERS_ON_START=false
LIBRARY_WRITE_ENABLED=true
```

Depois de publicar, abra no navegador:

```text
https://SEU-SERVICO.onrender.com/api/health
```

A resposta deve conter `"ok": true`.

### 2. Vercel

A causa mais comum de a biblioteca funcionar localmente e ficar vazia no Vercel é deixar `VITE_API_BASE_URL` vazio. O proxy de `/api` existente em `vite.config.js` funciona **somente no desenvolvimento local**.

No projeto do Vercel, abra **Settings → Environment Variables** e crie:

```text
VITE_API_BASE_URL=https://hq-reader-api.onrender.com
```

Sem barra `/` no final. Depois faça um **Redeploy**, porque variáveis `VITE_*` são incorporadas durante o build.

Este projeto também permite configurar a URL do Render em tempo de execução em:

```text
Configurações → Biblioteca → Servidor da biblioteca
```

Assim é possível trocar o backend sem alterar o código. A configuração fica salva no navegador e tem prioridade sobre `VITE_API_BASE_URL`.

### 3. Teste de produção

Confirme nesta ordem:

```text
https://SEU-SERVICO.onrender.com/api/health
https://SEU-SERVICO.onrender.com/api/comics
https://hq-reader-seven.vercel.app/
```

O endpoint `/api/comics` deve retornar o catálogo em JSON. O catálogo incluído nesta versão possui 698 HQs: 512 Marvel, 87 DC Comics e 99 Turma da Mônica.

### Persistência no Render

O catálogo que acompanha o deploy funciona normalmente sem disco persistente. Entretanto, alterações feitas depois do deploy — uploads, remoções e HQs adicionadas pela interface — podem ser perdidas quando um serviço Render com filesystem efêmero reinicia ou recebe novo deploy.

Para persistir uploads e edições de catálogo entre reinicializações, use um Persistent Disk/armazenamento persistente e aponte `LIBRARY_CATALOG_FILE` e `LIBRARY_UPLOAD_DIR` para ele.
