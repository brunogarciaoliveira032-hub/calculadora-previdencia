/* ============================================================================
   TESTE-DECISOR-CAMPOS.JS — cobre js/core/decisorCampos.js: o motor genérico de
   decisão (candidato + evidência + confiança + conflitos + regras =
   decisão), Prioridade 4 do checklist.

   Roda sem dependências externas: `node tests/teste-decisor-campos.js`.
============================================================================ */

const assert = require('assert');
const { carregarContextoPipeline } = require('./loader');

let totalTestes = 0;
let totalFalhas = 0;

function teste(nome, fn){
  totalTestes++;
  try{
    fn();
    console.log(`  OK  ${nome}`);
  }catch(erro){
    totalFalhas++;
    console.log(`FALHA ${nome}`);
    console.log(`      ${erro.message}`);
  }
}

// Candidato mínimo válido — os testes só preenchem o que cada cenário
// precisa, sempre por cima desta base.
function candidato(overrides){
  return Object.assign({ valor: 100, confianca: 0.5, pagina: { numero: 1, arquivo: 'a.pdf' }, trecho: 'trecho' }, overrides);
}

/* ==========================================================================
   1. DECISÃO SEM CONFLITO — um único candidato, ou vencedor claro
========================================================================== */
function suiteSemConflito(){
  console.log('\n[Decisor-1] Decisão sem conflito');
  const sb = carregarContextoPipeline();

  teste('nenhum candidato -> decisão null', () => {
    assert.strictEqual(sb.decidirCampo([]), null);
    assert.strictEqual(sb.decidirCampo(null), null);
  });

  teste('candidatos inválidos (sem valor, sem confiança numérica) são descartados', () => {
    const decisao = sb.decidirCampo([
      candidato({ valor: null }),
      candidato({ confianca: 'alta' }),
      candidato({ valor: 200, confianca: 0.6 })
    ]);
    assert.ok(decisao);
    assert.strictEqual(decisao.valor, 200);
  });

  teste('um único candidato vence sem conflito, confiança preservada', () => {
    const decisao = sb.decidirCampo([candidato({ valor: 380000, confianca: 0.65, trecho: 'oferta administrativa' })]);
    assert.strictEqual(decisao.valor, 380000);
    assert.strictEqual(decisao.confianca, 0.65);
    assert.strictEqual(decisao.emConflito, false);
    assert.strictEqual(decisao.conflitos.length, 0);
  });

  teste('vencedor com confiança bem maior que o concorrente não entra em conflito (margem padrão)', () => {
    const decisao = sb.decidirCampo([
      candidato({ valor: 380000, confianca: 0.8 }),
      candidato({ valor: 999, confianca: 0.2 })
    ]);
    assert.strictEqual(decisao.valor, 380000);
    assert.strictEqual(decisao.emConflito, false);
  });
}

/* ==========================================================================
   2. CANDIDATO + EVIDÊNCIA + CONFLITOS — dois valores com confiança parecida
========================================================================== */
function suiteConflito(){
  console.log('\n[Decisor-2] Conflito entre candidatos com confiança parecida');
  const sb = carregarContextoPipeline();

  teste('dois valores distintos com confiança parecida geram conflito e derrubam a confiança final', () => {
    const decisao = sb.decidirCampo([
      candidato({ valor: 380000, confianca: 0.6, pagina: { numero: 2, arquivo: 'peticao.pdf' }, trecho: 'oferta de R$ 380.000,00', expressao: 'oferta administrativa' }),
      candidato({ valor: 420000, confianca: 0.55, pagina: { numero: 5, arquivo: 'contestacao.pdf' }, trecho: 'valor de R$ 420.000,00', expressao: 'contraproposta' })
    ]);
    assert.strictEqual(decisao.emConflito, true);
    assert.strictEqual(decisao.valor, 380000, 'o de maior confiança deveria vencer mesmo em conflito');
    assert.ok(decisao.confianca < 0.6, 'confiança final deveria cair por causa do conflito');
    assert.strictEqual(decisao.conflitos.length, 1);
    assert.strictEqual(decisao.conflitos[0].valor, 420000);
    assert.strictEqual(decisao.conflitos[0].vezes, 1);
  });

  teste('evidências trazem tanto o escolhido quanto o descartado, com escolhido=true só no vencedor', () => {
    const decisao = sb.decidirCampo([
      candidato({ valor: 380000, confianca: 0.6, expressao: 'oferta administrativa' }),
      candidato({ valor: 420000, confianca: 0.55, expressao: 'contraproposta' })
    ]);
    assert.strictEqual(decisao.evidencias.length, 2);
    const escolhida = decisao.evidencias.find(e => e.escolhido);
    const descartada = decisao.evidencias.find(e => !e.escolhido);
    assert.strictEqual(escolhida.valor, 380000);
    assert.strictEqual(descartada.valor, 420000);
    assert.strictEqual(escolhida.expressao, 'oferta administrativa');
  });

  teste('justificativa cita as duas âncoras e as duas confianças', () => {
    const decisao = sb.decidirCampo([
      candidato({ valor: 380000, confianca: 0.6, expressao: 'oferta administrativa' }),
      candidato({ valor: 420000, confianca: 0.55, expressao: 'contraproposta' })
    ]);
    assert.ok(decisao.justificativa.includes('oferta administrativa'));
    assert.ok(decisao.justificativa.includes('contraproposta'));
    assert.ok(decisao.justificativa.includes('60%'));
    assert.ok(decisao.justificativa.includes('55%'));
  });
}

/* ==========================================================================
   3. CORROBORAÇÃO — mesmo valor achado várias vezes NÃO é conflito, e a
   confiança sobe (nunca acima do teto)
========================================================================== */
function suiteCorroboracao(){
  console.log('\n[Decisor-3] Corroboração (mesmo valor, várias ocorrências)');
  const sb = carregarContextoPipeline();

  teste('mesmo valor em três páginas diferentes não é conflito', () => {
    const decisao = sb.decidirCampo([
      candidato({ valor: 380000, confianca: 0.6, pagina: { numero: 1 } }),
      candidato({ valor: 380000, confianca: 0.5, pagina: { numero: 3 } }),
      candidato({ valor: 380000, confianca: 0.55, pagina: { numero: 7 } })
    ]);
    assert.strictEqual(decisao.emConflito, false);
    assert.strictEqual(decisao.valor, 380000);
  });

  teste('corroboração aumenta a confiança acima da maior ocorrência isolada, sem passar do teto', () => {
    const decisao = sb.decidirCampo([
      candidato({ valor: 380000, confianca: 0.6 }),
      candidato({ valor: 380000, confianca: 0.55 })
    ]);
    assert.ok(decisao.confianca > 0.6, `esperava bônus de corroboração: ${decisao.confianca}`);
    assert.ok(decisao.confianca <= 0.95);
  });
}

/* ==========================================================================
   4. REGRAS — pluggáveis, mudam o resultado da decisão
========================================================================== */
function suiteRegras(){
  console.log('\n[Decisor-4] Regras plugáveis');
  const sb = carregarContextoPipeline();

  teste('regraLimiarMinimo descarta candidatos fracos antes da decisão', () => {
    const decisao = sb.decidirCampo(
      [candidato({ valor: 999, confianca: 0.1 }), candidato({ valor: 380000, confianca: 0.6 })],
      { regras: [sb.regraLimiarMinimo(0.3)] }
    );
    assert.strictEqual(decisao.valor, 380000);
  });

  teste('regraLimiarMinimo pode descartar todos os candidatos -> decisão null', () => {
    const decisao = sb.decidirCampo(
      [candidato({ valor: 999, confianca: 0.1 })],
      { regras: [sb.regraLimiarMinimo(0.3)] }
    );
    assert.strictEqual(decisao, null);
  });

  teste('regra customizada consegue alterar qual candidato vence', () => {
    // Regra fictícia: zera a confiança de qualquer candidato cujo trecho
    // contenha "provisório" — simula uma regra de negócio que desqualifica
    // uma fonte específica.
    const descartarProvisorio = candidatos => candidatos.map(c =>
      c.trecho.includes('provisório') ? { ...c, confianca: 0 } : c
    );
    const decisao = sb.decidirCampo(
      [
        candidato({ valor: 100, confianca: 0.8, trecho: 'valor provisório' }),
        candidato({ valor: 200, confianca: 0.4, trecho: 'valor definitivo' })
      ],
      { regras: [descartarProvisorio] }
    );
    assert.strictEqual(decisao.valor, 200, 'a regra deveria ter desclassificado o candidato provisório');
  });

  teste('regra padrão (desempate por âncora) não muda o resultado quando não há empate exato', () => {
    const decisao = sb.decidirCampo([
      candidato({ valor: 100, confianca: 0.6, expressao: '' }),
      candidato({ valor: 200, confianca: 0.5, expressao: 'âncora forte' })
    ]);
    assert.strictEqual(decisao.valor, 100);
  });
}

/* ==========================================================================
   5. montarDecisao() DIRETO — caso de "vencedor já pinado em outro lugar",
   usado por processarEspecificacaoHistorico (inteligenciaJuridica.js)
========================================================================== */
function suiteMontarDecisaoDireto(){
  console.log('\n[Decisor-5] montarDecisao() com vencedor pinado (auditoria de divergência)');
  const sb = carregarContextoPipeline();

  teste('sempreConflito reporta um concorrente mesmo com diferença grande de confiança', () => {
    const vencedor = { valor: 380000, confiancaMax: 0.75, ocorrencias: [candidato({ valor: 380000, confianca: 0.75 })] };
    const concorrentes = [{ valor: 999, confiancaMax: 0.1, ocorrencias: [candidato({ valor: 999, confianca: 0.1 })] }];
    const decisao = sb.montarDecisao(vencedor, concorrentes, { sempreConflito: true, confiancaConflito: 0.35 });
    assert.strictEqual(decisao.emConflito, true);
    assert.strictEqual(decisao.confianca, 0.35);
    assert.strictEqual(decisao.valor, 380000, 'o vencedor pinado não é redecidido, mesmo em modo auditoria');
  });

  teste('sem concorrentes relevantes, decisão fica limpa mesmo com sempreConflito', () => {
    const vencedor = { valor: 380000, confiancaMax: 0.75, ocorrencias: [candidato({ valor: 380000, confianca: 0.75 })] };
    const decisao = sb.montarDecisao(vencedor, [], { sempreConflito: true });
    assert.strictEqual(decisao.emConflito, false);
  });

  teste('vencedor sem ocorrências próprias (não reencontrado nesta varredura) não quebra, só não gera justificativa', () => {
    const vencedor = { valor: 380000, confiancaMax: 0.75, ocorrencias: [] };
    const concorrentes = [{ valor: 999, confiancaMax: 0.1, ocorrencias: [candidato({ valor: 999, confianca: 0.1 })] }];
    const decisao = sb.montarDecisao(vencedor, concorrentes, { sempreConflito: true });
    assert.strictEqual(decisao.emConflito, true);
    assert.strictEqual(decisao.justificativa, null);
    assert.strictEqual(decisao.evidencias.length, 1, 'só a ocorrência do concorrente, sem entrada "escolhida"');
  });
}

suiteSemConflito();
suiteConflito();
suiteCorroboracao();
suiteRegras();
suiteMontarDecisaoDireto();

console.log(`\n${totalTestes - totalFalhas}/${totalTestes} testes passaram.`);
if(totalFalhas > 0) process.exit(1);
