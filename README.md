# Diário Cosmos

Aplicação responsiva que exibe a Astronomy Picture of the Day (APOD) da NASA. Mostra título, data, mídia e explicação; permite consultar datas desde 16 de junho de 1995; e trata mídia de imagem e vídeo.

## Requisitos

- Node.js 22.18 ou superior (recomendado: versão LTS).
- npm.
- Chave gratuita da NASA para carregar conteúdo: [api.nasa.gov](https://api.nasa.gov/).

## Configuração e execução local

1. Instale as dependências:

   ```powershell
   npm install
   ```

2. Crie o arquivo local de ambiente e preencha `NASA_API_KEY` com sua chave:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edite `.env` no computador. Esse arquivo é ignorado pelo Git; não cole a chave no código, no navegador ou em mensagens.

3. Inicie o servidor e o frontend:

   ```powershell
   npm run dev
   ```

   Abra o endereço informado pelo Vite, normalmente `http://127.0.0.1:5173`. O frontend encaminha `/api` ao servidor Express local. Sem a chave configurada, a aplicação continua iniciando, mas as consultas mostram um erro de configuração.

## Verificação e produção

Os testes usam respostas simuladas e não precisam de uma chave da NASA:

```powershell
npm test
npm run typecheck
npm run build
```

Para executar a versão compilada:

```powershell
npm start
```

O Express serve os arquivos de `dist` e a rota `/api/apod` na porta `3000`. Para alterar a porta no PowerShell, defina `$env:PORT` antes de iniciar. Em produção, configure `NASA_API_KEY` como segredo do ambiente de hospedagem, nunca no bundle do frontend.

## API e segurança

O navegador consulta apenas `GET /api/apod?date=AAAA-MM-DD`. O servidor valida datas entre `1995-06-16` e a data atual do APOD em `America/New_York`, consulta primeiro `https://api.nasa.gov/planetary/apod` usando `NASA_API_KEY` e retorna os campos necessários. Se a API principal falhar ou retornar a imagem genérica da NASA, o servidor consulta o artigo correspondente na API REST oficial da NASA Science, sem enviar a chave. O HTML do artigo é analisado no servidor e somente texto e URLs validadas são retornados ao navegador.

A chave nunca é enviada ao navegador nem registrada nos logs. A chamada primária usa `thumbs=true` para receber uma prévia quando o APOD é vídeo. Os dois provedores são consultados apenas no servidor e têm timeout independente.

Imagens são exibidas de forma responsiva; quando a NASA retorna o logotipo genérico no lugar da mídia, o servidor informa erro em vez de apresentá-lo como APOD. Vídeos de YouTube e Vimeo reconhecidos são carregados após a pessoa selecionar “Reproduzir vídeo”; fontes não reconhecidas são oferecidas como links externos seguros. Estados de carregamento e erro são anunciados na interface.

## Organização

- `index.html`: estrutura semântica da página.
- `src/client/main.ts`: consulta ao proxy, estados da interface e renderização de imagem/vídeo.
- `src/client/styles.css`: estilos responsivos e acessíveis.
- `src/server/index.ts`: servidor Express, endpoint local e arquivos de produção.
- `src/server/apod.ts`: validação de datas, consulta primária à API APOD, fallback na NASA Science e normalização segura das respostas.
- `src/shared/apod-date.ts`: calcula a data atual do APOD usando o fuso `America/New_York` compartilhado entre cliente e servidor.
- `tests/apod.test.mjs`: testes das datas, respostas e falhas do serviço APOD.

## Registro de cinco interações com o Copilot

1. **Pedido:** “Prepare a estrutura do projeto de acordo com `.github/copilot-instructions.md`, usando apenas a stack definida e sem expor a chave.”
   - **Resposta do Copilot:** propôs a base Node.js, TypeScript, Vite e Express, com scripts de desenvolvimento, build e testes.
   - **Alterações:** criei manifestos e configurações, `.env.example` sem segredo, exclusões do Git e o HTML de entrada. O build e a verificação de tipos passaram.

2. **Pedido:** “Implemente `GET /api/apod?date` com validação, chave somente no servidor e erros seguros.”
   - **Resposta do Copilot:** implementou o proxy fixo para a APOD, validou datas e normalizou imagem/vídeo com timeout e status HTTP explícitos.
   - **Alterações:** a chave vem de `NASA_API_KEY`; datas inválidas não chamam a NASA; respostas, URLs e erros são validados antes de chegar ao cliente.

3. **Pedido:** “Crie a interface responsiva baseada na referência, com seletor de data, carregamento, erro e suporte a imagem/vídeo.”
   - **Resposta do Copilot:** organizou mídia em destaque, controles e título em painel secundário, explicação em painel amplo e paleta azul-marinho/ciano.
   - **Alterações:** adicionei HTML semântico, CSS responsivo, estados acessíveis, prévia de vídeo com reprodução sob ação e embeds limitados a YouTube/Vimeo. A conferência em viewport móvel de 375 px não mostrou rolagem horizontal.

4. **Pedido:** “Adicione testes para as datas-limite e para respostas de imagem/vídeo e falhas da API.”
   - **Resposta do Copilot:** criou testes isolados com respostas simuladas, sem depender de chave ou chamadas externas.
   - **Alterações:** os sete testes cobrem limites e datas inválidas, contrato da consulta, mídia de vídeo, ausência de chave, erros upstream, payload inválido e timeout; todos passaram.

5. **Pedido:** “Documente como configurar, executar e testar o projeto e registre as interações importantes.”
   - **Resposta do Copilot:** documentou requisitos, comandos, arquitetura, comportamento da API e limites de segurança.
   - **Alterações:** escrevi este README e endureci a validação do payload no cliente para rejeitar uma resposta com data divergente. Build, tipos e testes foram verificados antes do commit.
