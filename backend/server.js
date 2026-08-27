/* ============================================================================
   BACKEND/SERVER.JS — servidor Node/Express próprio (sempre ligado).

   O QUE ISTO RESOLVE: a chave da API da Anthropic não pode morar no
   navegador do usuário (localStorage) nem ser chamada direto do cliente —
   qualquer pessoa com acesso ao navegador (ou a um extension/devtools)
   conseguiria lê-la. Isso quebra qualquer garantia de custo/uso da chave e
   vaza uma credencial de conta.

   Agora: a chave mora só aqui, em ANTHROPIC_API_KEY (variável de ambiente,
   nunca commitada — ver .env.example). O navegador chama
   POST /api/previdenciario/ia-revisar-campos deste servidor, que valida a
   entrada, monta a chamada para a Anthropic com a chave do servidor, e
   devolve só o resultado já extraído da tool call.

   O QUE ESTE SERVIDOR NÃO FAZ: não adiciona login/autenticação de usuário —
   o app não tinha nenhuma antes. Se este servidor for exposto na internet
   pública (em vez de rede interna do escritório/VPN), é recomendável colocar
   autenticação na frente (proxy reverso com Basic Auth, VPN, IP allowlist,
   etc.) — o rate limit abaixo protege contra abuso básico, não substitui
   controle de acesso.

   COMO RODAR:
     1) cp .env.example .env   e preencha ANTHROPIC_API_KEY=sk-ant-...
     2) npm install
     3) npm start                 (sobe em http://localhost:3000, ou na PORT
                                    definida no .env)
   O servidor serve o app estático (index.html, js/, etc.) a partir da raiz
   do projeto — não precisa de outro servidor web na frente em dev. Em
   produção, normalmente ainda se coloca um reverse proxy (nginx/Caddy) na
   frente para TLS; ele só repassa para este processo Node.
============================================================================ */

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
// Catálogo de campos revisáveis do domínio previdenciário (ver
// js/domains/previdenciario/camposRevisaoIAPrevidenciario.js e
// js/domains/previdenciario/ia/iaRevisoraPrevidenciaria.js).
const {
  CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO, SYSTEM_PROMPT_REVISAO_IA_PREVIDENCIARIO
} = require('../js/domains/previdenciario/camposRevisaoIAPrevidenciario.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;
const RAIZ_PROJETO = path.join(__dirname, '..');
const MODELO_IA_PREVIDENCIARIO = 'claude-sonnet-5';

// CORREÇÃO (revisão de segurança): antes, sem ANTHROPIC_API_KEY o processo
// inteiro encerrava (`process.exit(1)`) — inclusive o uso 100% manual do
// app (cálculo, extração de PDF, exportação), que não depende de IA
// nenhuma. Agora o servidor SEMPRE sobe; só a rota de revisão por IA fica
// indisponível (503) enquanto a chave não estiver configurada. Um aviso no
// console (não erro fatal) documenta a causa pra quem operar o servidor.
if(!ANTHROPIC_API_KEY){
  console.warn('AVISO: variável de ambiente ANTHROPIC_API_KEY não definida. O app vai subir normalmente (cálculo, extração de PDF/Excel, exportação), mas a revisão de campos por IA ("Revisar com IA") vai responder 503 até a chave ser configurada. Copie .env.example para .env e preencha ANTHROPIC_API_KEY para habilitá-la.');
}

const app = express();

// Necessário pra `req.ip`/rate-limit por IP funcionarem corretamente quando
// o servidor roda atrás de um reverse proxy (nginx/Caddy — ver comentário
// no topo do arquivo): sem isso, todo tráfego chega com o IP do proxy, e o
// rate limit por IP vira, na prática, um rate limit global (um usuário
// consegue esgotar o limite de todo mundo). Opt-in via env var: um valor
// errado aqui (confiar em proxy que não existe) permite ao CLIENTE forjar
// X-Forwarded-For e burlar o rate limit — por isso o padrão é DESLIGADO
// (Express também vem com trust proxy desabilitado por padrão). Só ligue
// (`TRUST_PROXY=1` ou `TRUST_PROXY=loopback`, ver documentação do Express
// sobre a opção `trust proxy`) se este processo realmente estiver atrás de
// um proxy confiável que você controla.
if(process.env.TRUST_PROXY){
  const valor = process.env.TRUST_PROXY;
  app.set('trust proxy', valor === 'true' ? true : (valor === 'false' ? false : (/^\d+$/.test(valor) ? Number(valor) : valor)));
}

// Content-Security-Policy — mitigação para o caso das bibliotecas de CDN
// (PDF.js, Tesseract, SheetJS, jsPDF) carregadas sem SRI (ver comentário em
// index.html sobre por que não foi possível calcular hashes SRI reais
// nesta correção): mesmo sem SRI, a CSP restringe de QUAL origem um
// <script> pode ser carregado, então um CDN comprometido injetando um
// script de OUTRO domínio continua bloqueado pelo navegador.
// - script-src: só o próprio site + cdnjs.cloudflare.com (as 5
//   bibliotecas); sem 'unsafe-inline' (o único <script> inline do app foi
//   extraído para js/core/temaEServiceWorker.js exatamente para permitir
//   isso).
// - worker-src: 'self' + blob: — Tesseract.js roda seu worker via blob:,
//   e estruturaTextoAsync.js carrega um Worker same-origin.
// - connect-src: 'self' — só a própria origem (POST /api/...); a chamada
//   à API da Anthropic acontece NO SERVIDOR (fetch em Node), nunca no
//   navegador, então o navegador não precisa de permissão pra
//   api.anthropic.com.
// - img-src: 'self' data: blob: — PDF.js/exportações geram imagens/canvas
//   via data:/blob: URIs.
// Middleware simples, sem dependência nova — só um header por resposta.
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'"
  ].join('; '));
  next();
});

app.use(express.json({ limit: '1mb' }));

// Auth opcional (Basic Auth) só pra rota de IA — opt-in via env vars
// AI_BASIC_AUTH_USER/AI_BASIC_AUTH_PASS. Ver comentário no topo do arquivo:
// este servidor não tinha (e continua sem ter, por padrão) autenticação de
// usuário; para exposição fora da rede interna, isto cobre o caso mínimo
// sem exigir infraestrutura extra (VPN/reverse-proxy com auth continuam
// sendo a recomendação mais forte, isto é só uma rede de segurança
// adicional, fácil de ligar). Comparação em tempo constante
// (crypto.timingSafeEqual) para não vazar a senha por timing attack.
function autenticacaoBasicaOpcionalIA(req, res, next){
  const usuarioEsperado = process.env.AI_BASIC_AUTH_USER;
  const senhaEsperada = process.env.AI_BASIC_AUTH_PASS;
  if(!usuarioEsperado || !senhaEsperada) return next(); // não configurado: comportamento antigo, sem auth extra

  const cabecalho = req.headers.authorization || '';
  const [esquema, credenciais] = cabecalho.split(' ');
  if(esquema !== 'Basic' || !credenciais){
    res.setHeader('WWW-Authenticate', 'Basic realm="revisao-ia-previdenciaria"');
    return res.status(401).json({ erro: 'autenticação necessária' });
  }
  let usuario = '', senha = '';
  try{
    const decodificado = Buffer.from(credenciais, 'base64').toString('utf-8');
    const idx = decodificado.indexOf(':');
    usuario = idx === -1 ? decodificado : decodificado.slice(0, idx);
    senha = idx === -1 ? '' : decodificado.slice(idx + 1);
  }catch(erroDecode){
    return res.status(401).json({ erro: 'credenciais malformadas' });
  }

  const bufUsuarioRecebido = Buffer.from(usuario);
  const bufUsuarioEsperado = Buffer.from(usuarioEsperado);
  const bufSenhaRecebida = Buffer.from(senha);
  const bufSenhaEsperada = Buffer.from(senhaEsperada);
  const usuarioOk = bufUsuarioRecebido.length === bufUsuarioEsperado.length && crypto.timingSafeEqual(bufUsuarioRecebido, bufUsuarioEsperado);
  const senhaOk = bufSenhaRecebida.length === bufSenhaEsperada.length && crypto.timingSafeEqual(bufSenhaRecebida, bufSenhaEsperada);
  if(!usuarioOk || !senhaOk){
    res.setHeader('WWW-Authenticate', 'Basic realm="revisao-ia-previdenciaria"');
    return res.status(401).json({ erro: 'credenciais inválidas' });
  }
  return next();
}

/* ============================================================================
   PIPELINE PREVIDENCIÁRIO — POST /api/previdenciario/ia-revisar-campos

   Fecha, do lado do servidor, o último elo do diagrama pedido pelo usuário:

     ... -> DECISION ENGINE -> [ decisão sem conflito -> Auto-fill DOM
                                | conflito -> revisão/IA ] -> ...

   Chamado por aplicarRevisaoIAPrevidenciaria() (js/domains/previdenciario/
   ia/iaRevisoraPrevidenciaria.js) só para os campos que
   decisionEnginePrevidenciario.js decidiu com `.emConflito === true` — nunca
   para decidir um valor novo (mesma regra de ouro do lado do cliente).
   Corpo esperado: { propostas: [{ id, valorExibicao, trecho,
   tipoDocumento?, evidenciasConcorrentes? }, ...] }, mesmo formato que
   montarPropostasRevisaoPrevidenciarias() já produz.
============================================================================ */
const MAX_PROPOSTAS_POR_REVISAO_PREV = 12;
const MAX_TAMANHO_VALOR_EXIBICAO_REVISAO_PREV = 200;
const MAX_TAMANHO_TRECHO_REVISAO_PREV = 400;
const MAX_TAMANHO_TIPO_DOCUMENTO_REVISAO_PREV = 100;
const MAX_EVIDENCIAS_CONCORRENTES_PREV = 2;
const MAX_TAMANHO_TRECHO_CONCORRENTE_PREV = 150;

function montarFerramentaRevisaoPrevidenciaria(propostas){
  const properties = {};
  propostas.forEach(p => {
    properties[p.id] = {
      type: 'object',
      description: CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO[p.id],
      properties: {
        veredito: { type: 'string', enum: ['confirmado', 'provavel', 'rejeitado'], description: 'julgamento sobre o valor JÁ PROPOSTO para este campo, dado o trecho' },
        confianca_numerica: { type: 'integer', minimum: 0, maximum: 100, description: 'confiança de 0 a 100 no veredito acima — 100 = certeza total de que o trecho confirma/rejeita o valor, 0 = pura adivinhação' },
        justificativa: { type: 'string', description: 'breve justificativa (o que no trecho embasa o veredito) — até 20 palavras' }
      },
      required: ['veredito', 'confianca_numerica']
    };
  });
  return {
    name: 'revisar_campos',
    description: 'Julga, para cada campo previdenciário, se o valor já proposto está correto dado o trecho de evidência (confirmado/provavel/rejeitado) e com que confiança numérica (0-100).',
    input_schema: { type: 'object', properties, required: propostas.map(p => p.id) }
  };
}

function montarPromptRevisaoPrevidenciaria(propostas){
  return propostas.map(p => {
    const linhaConcorrentes = (Array.isArray(p.evidenciasConcorrentes) && p.evidenciasConcorrentes.length)
      ? '\n' + p.evidenciasConcorrentes.map((c, i) => `Alternativa concorrente ${i + 1}: valor "${c.valor}", trecho: "${c.trecho}"`).join('\n')
      : '';
    return `Campo "${p.id}" — ${CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO[p.id]}${p.tipoDocumento ? `\nTipo de documento de onde veio: ${p.tipoDocumento}` : ''}\nValor já proposto: ${p.valorExibicao}\nTrecho de evidência: "${p.trecho}"${linhaConcorrentes}`;
  }).join('\n\n');
}

function validarPropostasRevisaoPrevidenciaria(propostas){
  if(!Array.isArray(propostas) || !propostas.length) return 'propostas ausente ou vazio';
  if(propostas.length > MAX_PROPOSTAS_POR_REVISAO_PREV) return `propostas excede o máximo de ${MAX_PROPOSTAS_POR_REVISAO_PREV} campos por chamada`;
  const idsVistos = new Set();
  for(const p of propostas){
    if(!p || typeof p.id !== 'string' || !Object.prototype.hasOwnProperty.call(CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO, p.id)) return 'proposta com id de campo desconhecido';
    if(idsVistos.has(p.id)) return `id de campo repetido em propostas: ${p.id}`;
    idsVistos.add(p.id);
    if(typeof p.valorExibicao !== 'string' || !p.valorExibicao || p.valorExibicao.length > MAX_TAMANHO_VALOR_EXIBICAO_REVISAO_PREV) return `proposta.valorExibicao inválido em ${p.id}`;
    if(typeof p.trecho !== 'string' || !p.trecho || p.trecho.length > MAX_TAMANHO_TRECHO_REVISAO_PREV) return `proposta.trecho inválido em ${p.id}`;
    if(p.tipoDocumento !== undefined && (typeof p.tipoDocumento !== 'string' || p.tipoDocumento.length > MAX_TAMANHO_TIPO_DOCUMENTO_REVISAO_PREV)) return `proposta.tipoDocumento inválido em ${p.id}`;
    if(p.evidenciasConcorrentes !== undefined){
      if(!Array.isArray(p.evidenciasConcorrentes) || p.evidenciasConcorrentes.length > MAX_EVIDENCIAS_CONCORRENTES_PREV) return `proposta.evidenciasConcorrentes inválido em ${p.id}`;
      for(const c of p.evidenciasConcorrentes){
        if(!c || typeof c.valor !== 'string' || !c.valor || c.valor.length > MAX_TAMANHO_VALOR_EXIBICAO_REVISAO_PREV) return `evidenciasConcorrentes[].valor inválido em ${p.id}`;
        if(typeof c.trecho !== 'string' || !c.trecho || c.trecho.length > MAX_TAMANHO_TRECHO_CONCORRENTE_PREV) return `evidenciasConcorrentes[].trecho inválido em ${p.id}`;
      }
    }
  }
  return null;
}

const limiteRevisaoIAPrevidenciaria = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas consultas à IA em pouco tempo — tente novamente em alguns minutos.' }
});

app.post('/api/previdenciario/ia-revisar-campos', limiteRevisaoIAPrevidenciaria, autenticacaoBasicaOpcionalIA, async (req, res) => {
  // Ver comentário perto do topo do arquivo: sem chave, o servidor sobe
  // normalmente (não dá mais process.exit(1)) e só esta rota fica
  // indisponível — 503 é o código correto pra "serviço temporariamente
  // indisponível por configuração ausente", diferente de 401/403 (não é
  // problema de autenticação do cliente) ou 500 (não é um erro inesperado).
  if(!ANTHROPIC_API_KEY){
    return res.status(503).json({ erro: 'revisão por IA indisponível: ANTHROPIC_API_KEY não configurada no servidor' });
  }

  const { propostas } = req.body || {};

  const erroValidacao = validarPropostasRevisaoPrevidenciaria(propostas);
  if(erroValidacao){
    return res.status(400).json({ erro: erroValidacao });
  }

  const ferramenta = montarFerramentaRevisaoPrevidenciaria(propostas);
  const promptUsuario = montarPromptRevisaoPrevidenciaria(propostas);

  try{
    const resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODELO_IA_PREVIDENCIARIO,
        max_tokens: 1200,
        system: SYSTEM_PROMPT_REVISAO_IA_PREVIDENCIARIO,
        tools: [ferramenta],
        tool_choice: { type: 'tool', name: 'revisar_campos' },
        messages: [{ role: 'user', content: promptUsuario }]
      })
    });

    if(!resposta.ok){
      const corpo = await resposta.text().catch(() => '');
      let motivo = `HTTP ${resposta.status}`;
      if(resposta.status === 401) motivo = 'chave de API do servidor inválida ou não autorizada — verifique ANTHROPIC_API_KEY';
      else if(resposta.status === 429) motivo = 'limite de uso da API atingido — tente novamente em instantes';
      console.error('Erro da API Anthropic (revisão previdenciária):', resposta.status, corpo.slice(0, 500));
      return res.status(502).json({ erro: motivo });
    }

    const dados = await resposta.json();
    const blocoFerramenta = (dados.content || []).find(b => b.type === 'tool_use' && b.name === 'revisar_campos');
    if(!blocoFerramenta){
      return res.status(502).json({ erro: 'a IA não usou a ferramenta esperada — nenhum campo foi revisado a partir dela' });
    }

    return res.json({ revisoes: blocoFerramenta.input });
  }catch(erro){
    console.error('Falha ao consultar a Anthropic (revisão previdenciária):', erro);
    return res.status(502).json({ erro: 'falha de comunicação com a API da IA' });
  }
});

/* ------------------------------------------------------------------------
   ARQUIVOS ESTÁTICOS DO APP (index.html, js/, ícones, manifest, sw.js)
------------------------------------------------------------------------ */
app.use(express.static(RAIZ_PROJETO));

// `require.main === module` só é true quando o arquivo é executado
// diretamente (`node backend/server.js` / `npm start`) — quando um teste
// faz `require('../backend/server.js')` pra testar `app` em memória (ver
// tests/teste-backend-server.js), isto é false e o listen() não roda,
// evitando dois processos brigando pela mesma porta.
if(require.main === module){
  app.listen(PORT, () => {
    console.log(`Calculadora previdenciária rodando em http://localhost:${PORT}`);
  });
}

module.exports = { app };
