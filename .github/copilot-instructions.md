# Instrucoes do Copilot — Diario Cosmos

Estas instrucoes se aplicam a todo o repositorio. O projeto deve exibir a imagem astronomica do dia (APOD) da NASA, permitir consultar uma data e apresentar conteudo de imagem ou video. Mantenha a solucao pequena e coerente com esse escopo.

## Tecnologias utilizadas

- Use Node.js em versao LTS para receber atualizacoes de seguranca e suporte; use TypeScript no servidor e no codigo do navegador para tipar o contrato entre as partes e detectar incompatibilidades durante o desenvolvimento.
- Use Vite para servir e compilar o frontend, com configuracao pequena para esta pagina, e Express para criar o endpoint de proxy do servidor. O proxy mantem a chave fora do cliente e fornece um unico ponto para validar datas e tratar falhas da NASA.
- Use `node-html-parser` somente no servidor para extrair texto e midia do artigo de fallback da NASA Science; nao encaminhe nem renderize HTML externo no navegador.
- Construa a interface com HTML semantico e CSS nativo; nao adicione React, Vue, Angular, bibliotecas de componentes, frameworks CSS ou estilos inline. Para uma pagina, HTML e CSS sem camada de componentes reduzem dependencias e facilitam responsividade e acessibilidade.
- Use `fetch`, disponivel no navegador e no Node.js LTS, para chamadas HTTP; nao adicione uma biblioteca de cliente HTTP nem chame a API da NASA diretamente do navegador.
- A fonte primaria de dados e `GET https://api.nasa.gov/planetary/apod`. A consulta de um dia usa `date=YYYY-MM-DD`; a resposta APOD inclui `date`, `title`, `explanation`, `media_type` e `url`, e pode incluir `hdurl`. Para video, solicite `thumbs=true` e aceite `thumbnail_url` quando disponivel. Trate `media_type` como discriminador: no minimo, suporte `image` e `video`.
- Se a API primaria falhar, retornar dados invalidos ou a imagem generica da NASA, use como fallback o artigo do dia em `https://science.nasa.gov/wp-json/wp/v2/image-article`. Confirme o slug APOD e a data exata, extraia somente titulo, explicacao e URLs HTTPS de imagem/video; nunca envie a chave ao fallback.

## Arquitetura do sistema

- Mantenha responsabilidades separadas:
  - `index.html`: estrutura semantica da pagina e ponto de entrada do Vite.
  - `src/client/main.ts`: consulta o endpoint local, controla data e estados da interface, e renderiza os dados.
  - `src/client/styles.css`: todos os estilos e regras responsivas.
  - `src/server/index.ts`: inicializa Express e expoe `GET /api/apod`.
  - `src/server/apod.ts`: valida a data, consulta a API APOD primaria, aplica fallback na API oficial da NASA Science e converte a resposta para o contrato usado pelo cliente.
  - `src/shared/apod-date.ts`: calcula a data atual do APOD em `America/New_York`, compartilhada pelo frontend e backend.
- O navegador deve chamar somente `/api/apod?date=YYYY-MM-DD`. Na primeira abertura, solicite a data atual; ao selecionar outra data valida, solicite e exiba o APOD correspondente.
- Mantenha os textos próprios da interface em portugues; preserve titulo e explicacao no idioma fornecido pela NASA. Exiba datas como `DD/MM/AAAA` e mantenha `YYYY-MM-DD` no contrato da API.
- Valide a data no servidor: formato e data de calendario validos, entre `1995-06-16` (primeiro dia do APOD) e a data atual em `America/New_York`, inclusive. Rejeite entrada invalida com status HTTP apropriado e mensagem segura. Nao aceite URL de destino fornecida pelo cliente.
- Modele a resposta com tipos TypeScript. Trate explicitamente respostas HTTP malsucedidas, JSON invalido, campos necessarios ausentes e tipos de midia desconhecidos; nao mostre sucesso vazio nem esconda erros.
- Para `image`, use uma imagem responsiva com texto alternativo significativo. Para `video`, incorpore somente URLs reconhecidas e transformadas para hosts de video permitidos; use `thumbnail_url` como previa quando houver e ofereca um link externo seguro como alternativa. Nunca crie um `iframe` para um host arbitrario.
- A pagina deve ter estados distintos de carregamento, sucesso e erro. Mantenha titulo, data e explicacao associados a midia exibida, inclusive apos uma nova consulta.
- Ao criar o projeto, defina scripts npm coerentes para desenvolvimento, build, verificacao de tipos e testes; documente e execute esses comandos. Cubra limites de data, entradas invalidas, respostas de imagem e video e falhas da API. Reutilize o runner existente, se houver, em vez de adicionar ferramentas sem necessidade.
- Documente no README como configurar a chave, instalar dependencias, iniciar, compilar e testar. Nao documente comandos como existentes ate que estejam definidos em `package.json`.

## Estilizacao do frontend

- Use a imagem de referencia anexada como direcao visual, nao como conteudo literal: cabecalho horizontal em degradê azul-marinho para quase preto; marca a esquerda; navegacao/controle de data funcional; acentos ciano em botoes e item ativo; corpo claro; paineis arredondados em azul profundo; area de explicacao cinza-clara; rodape azul.
- Reaproveite essa composicao para o APOD: em telas largas, organize a midia em destaque e os controles/titulo em uma coluna secundaria; coloque a explicacao em um painel amplo abaixo. Nao crie tres imagens, links de navegacao, busca ou cartoes vazios apenas para copiar os elementos da referencia.
- Defina cores e raios de borda como variaveis CSS. Como ponto de partida, use azul-marinho `#101b2d`, azul `#2b5872`, ciano `#19dfea`, cinza-claro `#d9d9d9` e branco `#ffffff`; preserve contraste legivel entre texto e fundo. Use cantos arredondados consistentes, espacamento generoso e foco visual na imagem/video.
- Construa primeiro para celular: uma coluna, controles de data faceis de operar e sem rolagem horizontal. Em telas maiores, use layout em colunas; redimensione imagem e video sem distorcao e mantenha embeds dentro do viewport. Use medidas fluidas e pontos de quebra orientados pelo conteudo, nao dimensoes fixas da captura.
- Use elementos HTML apropriados (`header`, `nav` apenas para navegacao real, `main`, `section`, `figure`, `form` e `footer`), rotulos associados aos controles, botoes com texto claro, foco visivel por teclado e mensagens de estado anunciaveis por tecnologia assistiva. Respeite `prefers-reduced-motion` e nao dependa apenas da cor para comunicar estado.

## Seguranca

- Leia a chave exclusivamente de `process.env.NASA_API_KEY` no servidor. Nunca inclua uma chave real no codigo, HTML, arquivos versionados, resposta do proxy, logs, mensagens de erro, configuracao do Vite ou variavel com prefixo publico (`VITE_`).
- Mantenha arquivos `.env` fora do Git. Se criar `.env.example`, inclua somente um valor obviamente ficticio, nunca uma chave utilizavel. Em producao, configure a chave no gerenciador de segredos do ambiente de hospedagem.
- O servidor deve enviar a chave somente na requisicao primaria de saida para o host fixo `api.nasa.gov`; a requisicao de fallback a `science.nasa.gov` nao recebe chave. Nao registre a URL completa da requisicao primaria, pois ela contem a chave. Retorne ao cliente apenas os campos APOD necessarios e erros seguros; nunca encaminhe a chave ou detalhes internos.
- Valide a data antes de consultar a NASA e aplique timeout a requisicao de saida. Nao permita que parametros do usuario alterem host, caminho ou outros parametros da chamada externa.
- Trate titulo, explicacao, URLs e demais dados da API como entrada externa: insira texto como texto, nunca como HTML executavel. Use apenas URLs HTTPS; para embeds, aplique a lista permitida definida na arquitetura. Adicione `rel="noopener noreferrer"` a links externos abertos em nova aba.
- Verifique que a chave nao aparece no bundle do frontend, no trafego entre navegador e servidor ou nos logs. Nunca use `DEMO_KEY` como solucao de producao.

## Referencias consultadas

- [NASA APIs — cadastro e acesso a APIs](https://api.nasa.gov/).
- [NASA APOD API — parametros, limites de data e campos da resposta](https://github.com/nasa/apod-api).
- [NASA Science — API REST oficial de artigos APOD](https://science.nasa.gov/wp-json/wp/v2/image-article).
- [GitHub Docs — instrucoes personalizadas por repositorio](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions).
- [Node.js — versoes LTS](https://nodejs.org/en/about/previous-releases).
- [Vite — guia oficial](https://vite.dev/guide/).
- [Express — documentacao oficial](https://expressjs.com/).
