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
