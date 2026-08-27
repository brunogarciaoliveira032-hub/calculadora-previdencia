/* ============================================================================
   TESTE-MAPPER-PREVIDENCIARIO.JS — cobre js/domains/previdenciario/mapping/
   mapperPrevidenciario.js E o fechamento do pipeline completo desta
   entrega (Atualização 13):

     texto de CNIS -> extrairVinculosDoTexto() -> vinculosParaMotorTempo
     Contribuicao() -> MotorTempoContribuicao.calcularTempoContribuicao()

   Roda sem dependências externas: `node tests/teste-mapper-previdenciario.js`.
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let totalTestes = 0;
let totalFalhas = 0;

function semRealm(valor) { return JSON.parse(JSON.stringify(valor)); }

function teste(nome, fn) {
  totalTestes++;
  try {
    fn();
    console.log(`  OK  ${nome}`);
  } catch (erro) {
    totalFalhas++;
    console.log(`FALHA ${nome}`);
    console.log(`      ${erro.message}`);
  }
}

function carregar() {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    path.join(__dirname, '..', 'js', 'core', 'calculoPeriodos.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorTempoContribuicao.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'cnis.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'ctps.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'requerimentoAdministrativo.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'cartaConcessao.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'cartaIndeferimento.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'decisaoAdministrativa.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'processoJudicial.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'laudoPericial.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'ppp.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'index.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'extraction', 'extratorVinculosCNIS.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'mapping', 'mapperPrevidenciario.js')
  ];
  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

const TEXTO_CNIS =
  'CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS\n' +
  'Relação de vínculos/contribuições\n' +
  '01/03/2001 a 30/06/2008 - EMPRESA X LTDA\n' +
  '01/08/2008 a 15/02/2015 - COMÉRCIO Y EIRELI\n' +
  '01/03/2015 a atual - INDÚSTRIA Z S.A.\n';

(() => {
  console.log('== INTEGRAÇÃO — CNIS -> extração -> mapper -> MotorTempoContribuicao ==');
  const sb = carregar();

  teste('vinculosParaMotorTempoContribuicao mapeia só os candidatos "validado" por padrão', () => {
    const candidatos = sb.extrairVinculosDoTexto(TEXTO_CNIS, { numero: 1 });
    const r = sb.vinculosParaMotorTempoContribuicao(candidatos, { dataReferencia: '2026-08-10' });
    assert.strictEqual(r.vinculos.length, 3);
    assert.strictEqual(r.ignorados.length, 0);
    r.vinculos.forEach(v => assert.strictEqual(v.tipo, 'comum'));
  });

  teste('vínculo em aberto sem dataReferencia vai para ignorados, nunca inventa uma data', () => {
    const candidatos = sb.extrairVinculosDoTexto(TEXTO_CNIS, { numero: 1 });
    const r = sb.vinculosParaMotorTempoContribuicao(candidatos, {});
    assert.strictEqual(r.vinculos.length, 2, 'os 2 vínculos fechados devem passar');
    assert.strictEqual(r.ignorados.length, 1, 'o vínculo em aberto deve ir para ignorados');
    assert.ok(r.ignorados[0].motivo.includes('dataReferencia'));
  });

  teste('candidato "requer_revisao" fica em ignorados por padrão, e só entra com opcoes.incluirRequerRevisao', () => {
    const candidatoRuim = sb.extrairVinculoDeLinha('30/06/2008 a 01/03/2001 - EMPRESA INVERTIDA LTDA');
    assert.strictEqual(candidatoRuim.status, 'requer_revisao');

    const semIncluir = sb.vinculosParaMotorTempoContribuicao([candidatoRuim], { dataReferencia: '2026-08-10' });
    assert.strictEqual(semIncluir.vinculos.length, 0);
    assert.strictEqual(semIncluir.ignorados.length, 1);

    const comIncluir = sb.vinculosParaMotorTempoContribuicao([candidatoRuim], { incluirRequerRevisao: true, dataReferencia: '2026-08-10' });
    assert.strictEqual(comIncluir.vinculos.length, 1);
  });

  teste('calcularTempoContribuicaoDeCandidatos fecha o pipeline inteiro: texto de CNIS -> tempo de contribuição total', () => {
    const candidatos = sb.extrairVinculosDoTexto(TEXTO_CNIS, { numero: 3 });
    const r = sb.calcularTempoContribuicaoDeCandidatos(candidatos, { dataReferencia: '2026-08-10' });
    assert.ok(r.resultado, 'deveria produzir um resultado de cálculo');
    assert.strictEqual(r.vinculosUsados.length, 3);

    // Soma manual esperada dos 3 períodos (sem sobreposição, mesclagem
    // simples): 2001-03-01..2008-06-30 (7a4m0d) + 2008-08-01..2015-02-15
    // (6a6m15d) + 2015-03-01..2026-08-10 (11a5m10d) — checado só o total
    // em anos como sanidade grosseira do wiring, não recálculo manual
    // dia a dia (isso já é coberto por teste-motor-tempo-contribuicao.js).
    const total = semRealm(r.resultado.tempoTotal);
    assert.ok(total.anos >= 24 && total.anos <= 26, `tempo total esperado ~25 anos, veio ${JSON.stringify(total)}`);
  });

  teste('candidatos vazios/sem vínculo aproveitável não chamam o motor e devolvem resultado null', () => {
    const r = sb.calcularTempoContribuicaoDeCandidatos([], {});
    assert.strictEqual(r.resultado, null);
  });

  console.log('== CLASSIFICAÇÃO POR VÍNCULO (.tipoManual / .anosExposicaoManual) — Atualização 21 ==');

  teste('vínculo com .tipoManual="especial" + .anosExposicaoManual válido sai como especial, só ele', () => {
    const candidatos = sb.extrairVinculosDoTexto(TEXTO_CNIS, { numero: 1 });
    assert.strictEqual(candidatos.length, 3);
    candidatos[0].tipoManual = 'especial';
    candidatos[0].anosExposicaoManual = 25;

    const r = sb.vinculosParaMotorTempoContribuicao(candidatos, { dataReferencia: '2026-08-10' });
    assert.strictEqual(r.vinculos.length, 3);
    assert.strictEqual(r.vinculos[0].tipo, 'especial');
    assert.strictEqual(r.vinculos[0].anosExposicao, 25);
    assert.strictEqual(r.vinculos[0].avisoTipo, undefined);
    // os outros dois continuam no padrão ('comum'), não "contaminados" pela marca do primeiro
    assert.strictEqual(r.vinculos[1].tipo, 'comum');
    assert.strictEqual(r.vinculos[2].tipo, 'comum');
    assert.strictEqual(r.vinculos[1].anosExposicao, undefined);
  });

  teste('.tipoManual="especial" sem .anosExposicaoManual válido NUNCA vira especial — cai para comum com .avisoTipo', () => {
    const candidatos = sb.extrairVinculosDoTexto(TEXTO_CNIS, { numero: 1 });
    candidatos[0].tipoManual = 'especial';
    candidatos[0].anosExposicaoManual = 18; // fora de {15,20,25}

    const r = sb.vinculosParaMotorTempoContribuicao(candidatos, { dataReferencia: '2026-08-10' });
    assert.strictEqual(r.vinculos[0].tipo, 'comum');
    assert.strictEqual(r.vinculos[0].anosExposicao, undefined);
    assert.ok(r.vinculos[0].avisoTipo && r.vinculos[0].avisoTipo.includes('15, 20 ou 25'), 'deveria explicar por que não aceitou');
  });

  teste('.tipoManual="especial" sem NENHUM .anosExposicaoManual informado também cai para comum com aviso (não lança erro)', () => {
    const candidatos = sb.extrairVinculosDoTexto(TEXTO_CNIS, { numero: 1 });
    candidatos[0].tipoManual = 'especial';
    // .anosExposicaoManual ausente de propósito

    const r = sb.vinculosParaMotorTempoContribuicao(candidatos, { dataReferencia: '2026-08-10' });
    assert.strictEqual(r.vinculos[0].tipo, 'comum');
    assert.ok(r.vinculos[0].avisoTipo);
  });

  teste('.tipoManual="comum" tem prioridade sobre opcoes.tipo="especial" (marca explícita do usuário vence o padrão global)', () => {
    const candidatos = sb.extrairVinculosDoTexto(TEXTO_CNIS, { numero: 1 });
    candidatos[1].tipoManual = 'comum';

    const r = sb.vinculosParaMotorTempoContribuicao(candidatos, { dataReferencia: '2026-08-10', tipo: 'especial', anosExposicao: 20 });
    assert.strictEqual(r.vinculos[0].tipo, 'especial', 'sem marca manual, segue o padrão global');
    assert.strictEqual(r.vinculos[1].tipo, 'comum', 'com marca manual "comum", ignora o padrão global especial');
    assert.strictEqual(r.vinculos[1].anosExposicao, undefined);
  });

  teste('classificação por vínculo chega inteira ao MotorTempoContribuicao (fecha o pipeline: mapper -> conversão especial/comum)', () => {
    const candidatos = sb.extrairVinculosDoTexto(TEXTO_CNIS, { numero: 1 });
    candidatos[2].tipoManual = 'especial'; // vínculo em aberto (2015-03-01 a atual)
    candidatos[2].anosExposicaoManual = 15;

    const r = sb.calcularTempoContribuicaoDeCandidatos(candidatos, { dataReferencia: '2026-08-10', converterTempoEspecial: true, sexo: 'homem' });
    assert.ok(r.resultado, 'deveria produzir resultado mesmo com um vínculo especial em aberto');
    assert.strictEqual(r.vinculosUsados[2].tipo, 'especial');
    // fator 35/15 sobre um vínculo especial deve gerar acréscimo de tempo > 0
    const acrescimo = semRealm(r.resultado.tempoConvertidoAdicional);
    assert.ok(acrescimo.anos > 0 || acrescimo.meses > 0 || acrescimo.dias > 0, `esperava acréscimo de conversão > 0, veio ${JSON.stringify(acrescimo)}`);
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
