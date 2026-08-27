/* ============================================================================
   TESTE-MOTOR-RMI-DO-HISTORICO.JS — cobre js/domains/previdenciario/
   motorRMIDoHistorico.js. Reescrito nesta entrega para a CORREÇÃO CRÍTICA
   apontada pelo usuário: RMI TEÓRICA (fórmula) e ELEGIBILIDADE (direito
   real ao benefício) são dois campos separados no retorno — nunca uma
   RMI apresentada sem a checagem de elegibilidade ao lado.

   Testa a ORQUESTRAÇÃO (histórico já pronto, montado à mão, sem passar
   pela extração de PDF — isso é coberto pelo teste E2E completo em
   tests/teste-e2e-previdenciario-cnis-ate-rmi.js). Mesmo mock
   determinístico de `buscarSerieBcbComCache` dos outros testes desta
   entrega — sem rede real.

   Roda sem dependências externas: `node tests/teste-motor-rmi-do-historico.js`.
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let totalTestes = 0;
let totalFalhas = 0;

function proximo(diferenca) { return Math.abs(diferenca) < 1e-6; }

function teste(nome, fn) {
  totalTestes++;
  const resultado = fn();
  const finalizar = (erro) => {
    if (erro) {
      totalFalhas++;
      console.log(`FALHA ${nome}`);
      console.log(`      ${erro.message}`);
    } else {
      console.log(`  OK  ${nome}`);
    }
  };
  if (resultado && typeof resultado.then === 'function') {
    return resultado.then(() => finalizar(null), finalizar);
  }
  finalizar(null);
  return Promise.resolve();
}

// Série INPC sintética: 03/2001=1%, 04/2001=2%, 05/2001=-1% (mesma dos
// outros testes desta entrega) — salário de benefício esperado: 999,93.
const DADOS_INPC_MOCK = [
  { data: '01/03/2001', valor: '1,00' },
  { data: '01/04/2001', valor: '2,00' },
  { data: '01/05/2001', valor: '-1,00' }
];

function carregar(mockBuscarSerie) {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    path.join(__dirname, '..', 'js', 'core', 'util.js'),
    path.join(__dirname, '..', 'js', 'core', 'indices.js'),
    path.join(__dirname, '..', 'js', 'core', 'calculoPeriodos.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorTempoContribuicao.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorRMI.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'historico', 'historicoPrevidenciario.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'correcao', 'correcaoINPCPrevidenciario.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorSalarioBeneficio.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'carencia', 'validacaoCarenciaPrevidenciaria.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorRMIDoHistorico.js')
  ];
  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  sandbox.buscarSerieBcbComCache = mockBuscarSerie;
  return sandbox;
}

function historicoBase() {
  // Cenário de 3 meses — DELIBERADAMENTE INSUFICIENTE para qualquer
  // aposentadoria real (é o próprio cenário que motivou esta correção).
  return {
    vinculos: [{ id: 'v1', inicio: '2001-03-01', fim: '2001-05-31', tipo: 'comum', aberto: false }],
    contribuicoes: [
      { id: 'c1', competencia: '2001-03', valor: 1000, vinculoId: 'v1', ambigua: false, remuneracaoIds: ['r1'] },
      { id: 'c2', competencia: '2001-04', valor: 1000, vinculoId: 'v1', ambigua: false, remuneracaoIds: ['r2'] },
      { id: 'c3', competencia: '2001-05', valor: 1000, vinculoId: 'v1', ambigua: false, remuneracaoIds: ['r3'] }
    ],
    remuneracoes: [
      { id: 'r1', competencia: '2001-03', valor: 1000, fonte: { documento: 'CNIS', pagina: 1 } },
      { id: 'r2', competencia: '2001-04', valor: 1000, fonte: { documento: 'CNIS', pagina: 1 } },
      { id: 'r3', competencia: '2001-05', valor: 1000, fonte: { documento: 'CNIS', pagina: 1 } }
    ]
  };
}

// Gera um histórico com 21 anos e meio de contribuição (258 competências),
// suficiente para satisfazer idade+tempo+carência da regra permanente
// (homem: 65 anos, 20 anos de contribuição, 180 meses de carência) — para
// provar o caminho "ELEGÍVEL", não só o "não elegível". Série INPC plana
// (0% em todos os meses) para a conta ficar trivial de conferir.
function historicoElegivel() {
  const competencias = [];
  let ano = 2000, mes = 1;
  for (let i = 0; i < 258; i++) {
    competencias.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  const primeira = competencias[0];
  const ultima = competencias[competencias.length - 1];
  const contribuicoes = competencias.map((c, i) => ({ id: 'c' + (i + 1), competencia: c, valor: 2000, vinculoId: 'v1', ambigua: false, remuneracaoIds: ['r' + (i + 1)] }));
  const remuneracoes = competencias.map((c, i) => ({ id: 'r' + (i + 1), competencia: c, valor: 2000, fonte: { documento: 'CNIS', pagina: 1 } }));
  const dadosInpcPlano = competencias.map(c => { const [a, m] = c.split('-'); return { data: `01/${m}/${a}`, valor: '0,00' }; });
  return {
    historico: {
      vinculos: [{ id: 'v1', inicio: primeira + '-01', fim: ultima + '-28', tipo: 'comum', aberto: false }],
      contribuicoes, remuneracoes
    },
    competenciaReferencia: ultima,
    dadosInpc: dadosInpcPlano
  };
}

async function main() {
  console.log('== MOTORRMIDOHISTORICO.JS (RMI teórica SEPARADA de elegibilidade) ==');

  await teste('RMI teórica é calculada mesmo com só 3 meses de contribuição (salário de benefício 999,93 x 60% = 599,958)', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.calcularRMIDoHistorico(historicoBase(), { competenciaReferencia: '2001-05', sexo: 'homem', idadeAnos: 40 });
    assert.ok(r.rmiTeorica, 'deveria calcular a RMI teórica (é só fórmula)');
    assert.ok(proximo(r.rmiTeorica.percentualAplicado - 0.60));
    assert.ok(proximo(r.rmiTeorica.rmiFinal - 599.958));
  });

  await teste('CORREÇÃO CRÍTICA: com 3 meses de contribuição, elegibilidade vem false, com as 3 pendências (idade, tempo, carência), NUNCA junto de um "RMI final" sem aviso', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.calcularRMIDoHistorico(historicoBase(), { competenciaReferencia: '2001-05', sexo: 'homem', idadeAnos: 40 });
    assert.ok(r.elegibilidade, 'elegibilidade deveria ter sido verificada (idadeAnos foi informado)');
    assert.strictEqual(r.elegibilidade.elegivel, false);
    assert.strictEqual(r.elegibilidade.pendencias.length, 3); // idade mínima, tempo mínimo, carência mínima
    assert.ok(r.elegibilidade.pendencias.some(p => p.includes('idade')));
    assert.ok(r.elegibilidade.pendencias.some(p => p.includes('tempo de contribuição')));
    assert.ok(r.elegibilidade.pendencias.some(p => p.includes('carência')));
    // a RMI teórica continua presente (não é escondida) — só não pode ser
    // lida como "resultado final" sem checar r.elegibilidade ao lado.
    assert.ok(r.rmiTeorica);
  });

  await teste('sem opcoes.idadeAnos, elegibilidade vem null com motivo explícito — NUNCA presumida elegível nem inelegível', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.calcularRMIDoHistorico(historicoBase(), { competenciaReferencia: '2001-05', sexo: 'homem' });
    assert.ok(r.rmiTeorica, 'RMI teórica não depende de idade, continua calculada');
    assert.ok(r.elegibilidade);
    assert.strictEqual(r.elegibilidade.elegivel, null);
    assert.ok(r.elegibilidade.pendencias[0].includes('idade não informada'));
  });

  await teste('cenário com 21 anos e meio de contribuição, idade e carência suficientes: elegibilidade vem TRUE, sem nenhuma pendência', async () => {
    const cenario = historicoElegivel();
    const sb = carregar(async () => ({ dados: cenario.dadosInpc, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.calcularRMIDoHistorico(cenario.historico, {
      competenciaReferencia: cenario.competenciaReferencia,
      sexo: 'homem',
      idadeAnos: 66
    });
    assert.ok(r.rmiTeorica);
    assert.ok(r.elegibilidade);
    assert.strictEqual(r.elegibilidade.elegivel, true);
    assert.strictEqual(r.elegibilidade.pendencias.length, 0);
    assert.strictEqual(r.elegibilidade.carencia.totalMeses, 258);
    assert.ok(r.elegibilidade.carencia.metodologia.includes('Art. 27'));
  });

  await teste('elegibilidade.regraVerificada deixa explícito que só a regra PERMANENTE foi checada (não regras de transição)', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.calcularRMIDoHistorico(historicoBase(), { competenciaReferencia: '2001-05', sexo: 'homem', idadeAnos: 40 });
    assert.ok(r.elegibilidade.regraVerificada.includes('permanente'));
    assert.ok(r.elegibilidade.regraVerificada.toLowerCase().includes('transi'));
  });

  await teste('aplica o piso (salarioMinimoVigente) na RMI teórica quando ela fica abaixo dele — independente da elegibilidade', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.calcularRMIDoHistorico(historicoBase(), { competenciaReferencia: '2001-05', sexo: 'homem', idadeAnos: 40, salarioMinimoVigente: 1500 });
    assert.ok(r.rmiTeorica);
    assert.strictEqual(r.rmiTeorica.aplicouPiso, true);
    assert.ok(proximo(r.rmiTeorica.rmiFinal - 1500));
    assert.strictEqual(r.elegibilidade.elegivel, false); // piso aplicado não muda a elegibilidade
  });

  await teste('sem opcoes.sexo, nem a RMI teórica é calculada (motivo explícito), elegibilidade fica null', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.calcularRMIDoHistorico(historicoBase(), { competenciaReferencia: '2001-05', idadeAnos: 40 });
    assert.strictEqual(r.rmiTeorica, null);
    assert.strictEqual(r.elegibilidade, null);
    assert.ok(r.motivo.includes('sexo'));
  });

  await teste('sem opcoes.competenciaReferencia, nem o salário de benefício é calculado, e nada avança', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.calcularRMIDoHistorico(historicoBase(), { sexo: 'homem', idadeAnos: 40 });
    assert.strictEqual(r.rmiTeorica, null);
    assert.strictEqual(r.salarioBeneficio.salarioBeneficio, null);
  });

  await teste('histórico sem vínculos: salário de benefício calculado, mas nem RMI teórica nem elegibilidade avançam por falta de tempo de contribuição', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const historicoSemVinculo = Object.assign({}, historicoBase(), { vinculos: [] });
    const r = await sb.calcularRMIDoHistorico(historicoSemVinculo, { competenciaReferencia: '2001-05', sexo: 'homem', idadeAnos: 40 });
    assert.strictEqual(r.rmiTeorica, null);
    assert.strictEqual(r.elegibilidade, null);
    assert.ok(r.salarioBeneficio && r.salarioBeneficio.salarioBeneficio !== null);
    assert.ok(r.motivo.includes('tempo de contribuição'));
  });

  await teste('API do Bacen indisponível: nada é calculado (nem salário, nem RMI teórica, nem elegibilidade)', async () => {
    const sb = carregar(async () => { throw new Error('HTTP 503'); });
    const r = await sb.calcularRMIDoHistorico(historicoBase(), { competenciaReferencia: '2001-05', sexo: 'homem', idadeAnos: 40 });
    assert.strictEqual(r.rmiTeorica, null);
    assert.strictEqual(r.elegibilidade, null);
    assert.strictEqual(r.salarioBeneficio.salarioBeneficio, null);
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
}

main();
