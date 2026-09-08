# HQ Reader — Vercel All-in-One

Versão do HQ Reader preparada para rodar inteira no **Vercel**, sem Render e sem backend separado.

## Arquitetura

- Frontend: React + Vite + Tailwind
- API: Vercel Functions em `/api`
- Catálogo inicial: `data/initial-library.json`
- Uploads persistentes: Vercel Blob
- Metadados adicionados/removidos: Vercel Blob
- PDF: renderizado no navegador com PDF.js
- CBZ/CBR: extraído sob demanda e as páginas ficam em cache no Vercel Blob
- Google Drive: arquivos públicos continuam sendo a origem das HQs já catalogadas

O catálogo inicial contém **698 HQs**:

- Marvel: 512
- DC Comics: 87
- Turma da Mônica: 99

## Publicar no Vercel

### 1. Suba este projeto

Importe o repositório/pasta no Vercel normalmente. Não configure Render e não defina `VITE_API_BASE_URL`.

A aplicação usa apenas rotas do mesmo domínio:

```text
/api/comics
/api/comic
/api/content
/api/download
/api/library
/api/blob-upload
```

### 2. Conecte Vercel Blob

No projeto Vercel:

1. Abra **Storage**.
2. Crie/conecte um **Blob Store**.
3. Use acesso **Public** para os arquivos da biblioteca.
4. O Vercel adicionará `BLOB_READ_WRITE_TOKEN` ao projeto automaticamente.

O catálogo inicial carrega mesmo sem Blob. O Blob é necessário para:

- upload de PDF/CBZ/CBR/imagens;
- adicionar links de forma persistente;
- excluir HQs do catálogo;
- cachear páginas extraídas de CBZ/CBR.

### 3. Crie a senha de administração

Em **Settings → Environment Variables**, adicione:

```text
HQ_READER_ADMIN_TOKEN=uma-senha-forte-escolhida-por-voce
```

Depois faça um **Redeploy**.

Na aplicação, abra:

**Configurações → Biblioteca → Administração**

Digite a mesma senha. Ela fica salva somente naquele navegador e é enviada apenas para as rotas de escrita da própria aplicação.

## Otimizações desta versão

### Biblioteca

A tela não renderiza mais centenas de cards de uma só vez. Ela começa com 36 HQs e adiciona novos lotes conforme a rolagem se aproxima do final.

As capas dos arquivos do Google Drive usam thumbnails diretamente do Drive, evitando baixar o PDF inteiro só para mostrar a capa.

### PDF

O servidor não converte cada página em imagem. O PDF.js renderiza diretamente no navegador e solicita apenas os trechos necessários do arquivo.

### Uploads grandes

Os arquivos não passam pelo corpo de uma Vercel Function. O navegador envia diretamente para Vercel Blob através do fluxo de Client Upload, inclusive com multipart para arquivos maiores.

### Download

- HQ no Vercel Blob: redireciona para o arquivo no Blob/CDN.
- HQ do Google Drive: redireciona para a origem pública do Drive.

Assim a Function não precisa transportar o arquivo inteiro para o download.

### CBZ e CBR

Na primeira abertura, o arquivo é processado e as páginas são armazenadas no Blob. Nas próximas leituras, as páginas vêm diretamente do CDN.

## Desenvolvimento local

Instale:

```bash
npm install
```

Se já tiver conectado Blob ao projeto Vercel:

```bash
npx vercel env pull .env.local
```

Depois:

```bash
npm run dev
```

O comando usa `vercel dev`, permitindo testar o frontend e as Functions no mesmo endereço.

## Variáveis opcionais

```text
MAX_UPLOAD_BYTES=524288000
MAX_ARCHIVE_BYTES=314572800
MAX_ARCHIVE_PAGES=1200
CATALOG_CACHE_MS=20000
```

## Estrutura principal

```text
hq-reader/
├── api/                    # Vercel Functions
├── data/
│   └── initial-library.json
├── server/                 # serviços compartilhados pelas Functions
├── frontend/               # React + Vite
├── vercel.json
├── package.json
└── README.md
```

## Observação sobre o Google Drive

As HQs já catalogadas continuam usando seus arquivos públicos do Drive como origem. Nenhuma API Key do Google é necessária. Novos arquivos podem ser adicionados por link individual ou enviados diretamente para o Vercel Blob.

## Vercel / npm 11 — esbuild

O projeto aprova explicitamente o script de instalação do `esbuild@0.25.12` no `package.json` por meio de `allowScripts`. Isso evita que builds com npm 11 parem ou emitam pendência de aprovação antes do `vite build`.


## Correção iOS Safari (2.0.3)

- PDF.js passa a usar o build `legacy` para maior compatibilidade com Safari/iOS.
- Polyfill de `Promise.withResolvers` antes do carregamento do PDF.js.
- No Safari iOS, o leitor desativa streaming contínuo e prioriza requisições HTTP Range.
- Timeout de abertura evita spinner infinito.
- Canvas limita o DPR em iPhone/iPad para reduzir uso de memória em telas Retina.


## Administração

A interface exibe somente o acesso administrativo, sem os painéis técnicos de armazenamento. A senha administrativa fixa desta versão é `@detzjao1`.

## Navegação e zoom livre (2.0.4)

- Pinça com dois dedos amplia exatamente a região tocada, sem recentralizar a página.
- Com zoom acima de 100%, arraste com um dedo no celular ou com o mouse no desktop para mover pela página.
- Duplo toque/duplo clique alterna entre 100% e 200% usando o ponto tocado como foco.
- `Ctrl/Cmd + roda do mouse/trackpad` aplica zoom no ponto do cursor.
- Os botões `+` e `-` preservam o centro atual da leitura; tocar no percentual restaura 100%.
- Ao trocar de página com zoom aplicado, a nova página abre no topo e centralizada horizontalmente.
- No iPhone/iPad o leitor usa `100dvh` para se adaptar melhor às barras dinâmicas do Safari.

## Atualização das pastas do Drive (v2.0.6)

O botão **Atualizar base de dados** agora executa uma nova varredura das três fontes configuradas (Marvel, DC Comics e Turma da Mônica), percorre subpastas públicas, tenta resolver atalhos e adiciona ao catálogo em uso as HQs públicas encontradas que ainda não estavam na base inicial. A varredura só acontece quando o botão é acionado.

Quando houver armazenamento persistente configurado no deploy, o resultado também é salvo como snapshot do catálogo. Sem armazenamento persistente, o resultado da varredura fica salvo no navegador e continua disponível naquele dispositivo, inclusive para abrir PDFs encontrados na nova busca.


## Fontes padrão

O botão **Atualizar base de dados** varre estas fontes públicas do Google Drive:

- Marvel Comics
- Marvel Comics Extra — `1wE5ePfzZkIHa-RADBEpkB_FWAJowI2K6`
- DC Comics
- Turma da Mônica

A nova fonte Marvel Extra contém, na raiz, as pastas **MARVEL INDIVIDUAL** e **MARVEL DRIVE**.

## Sincronização automática dos Drives (v2.1.0)

- Ao abrir a biblioteca, o frontend carrega o catálogo existente imediatamente e inicia em segundo plano uma varredura de todas as fontes públicas configuradas.
- A varredura automática percorre subpastas e reúne PDF, CBZ, CBR e imagens suportadas sem exigir que o usuário clique primeiro em “Atualizar base de dados”.
- As quatro fontes padrão continuam sendo Marvel Comics, Marvel Comics Extra, DC Comics e Turma da Mônica.
- A tela “Adicionar por link” agora aceita tanto um arquivo individual quanto o link de uma pasta inteira do Google Drive.
- Ao adicionar uma pasta, ela é percorrida recursivamente e as HQs encontradas entram na biblioteca. A pasta também fica registrada no navegador para novas varreduras automáticas.
- Quando o deploy possui armazenamento persistente, novas fontes adicionadas pelo administrador também são registradas no catálogo do servidor.
- A aplicação continua exibindo o catálogo já disponível caso alguma pasta pública esteja temporariamente indisponível durante a sincronização automática.



## Varredura completa de grandes Drives (v2.1.1)

- O Drive Marvel Extra agora usa um mapa de bootstrap com **221 pastas conhecidas** logo abaixo de `MARVEL DRIVE` e `MARVEL INDIVIDUAL`, evitando depender apenas da listagem HTML parcial do Google Drive.
- A sincronização automática roda **uma fonte por requisição**, dando a cada Drive sua própria janela de execução e salvando os resultados progressivamente no navegador.
- A página inicial atualiza a contagem de HQs conforme cada fonte termina, em vez de esperar todas as pastas concluírem.
- Se uma fonte falhar, a sincronização não é marcada como concluída e será tentada novamente na próxima abertura.

## 2.1.2 — detecção de HQs sem extensão no Google Drive

A varredura de pastas públicas não depende mais de o nome visível terminar em `.pdf`, `.cbz`, `.cbr` ou extensão de imagem. Quando o Drive mostra um arquivo sem extensão, o servidor inspeciona o MIME e os primeiros bytes do arquivo e normaliza o formato antes de adicioná-lo ao catálogo.

Também foi ampliado o parser do `embeddedfolderview`: além do bloco visual `flip-entry-title`, ele percorre todos os links de arquivo e subpasta presentes no HTML, no mesmo princípio usado por crawlers públicos modernos do Google Drive. Isso melhora principalmente coleções profundas, como o Marvel Comics Extra.

## 2.1.4 — biblioteca compartilhada entre dispositivos

Drives adicionados pela tela administrativa passam a ser registrados no catálogo persistente do servidor antes de serem considerados adicionados. A lista de fontes deixa de depender do `localStorage` do navegador, então computador, celular e outros dispositivos carregam a mesma biblioteca. Versões antigas que tenham fontes presas ao navegador são migradas automaticamente quando o administrador autenticado executa uma sincronização.


## Persistência compartilhada (2.1.5)

A biblioteca dinâmica usa Vercel Blob. A versão 2.1.5 reconhece tanto a conexão atual via OIDC (`BLOB_STORE_ID`) quanto lojas legadas com `BLOB_READ_WRITE_TOKEN`. Em deployments atuais da Vercel, conectar um Blob Store ao projeto é suficiente para o SDK autenticar operações de servidor via OIDC.
