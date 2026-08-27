/* ============================================================================
   TESTE-E2E-PREVIDENCIARIO-CNIS-ATE-RMI.JS — o "Teste E2E obrigatório"
   desta entrega (Atualização 18): prova, com um CNIS SINTÉTICO e CÓDIGO
   REAL (não simulado) em cada etapa, o caso previdenciário completo:

     texto de CNIS
       -> identificarTipoDocumentoPrevidenciario()      (identificação)
       -> extrairVinculosDoTexto()/extrairRemuneracoesDoTexto()  (extração)
       -> montarHistorico()                              (preenchimento
          do HistoricoPrevidenciario — não existe formulário de UI para
          o domínio previdenciário ainda, então "preenchimento" aqui é a
          consolidação da entidade, não uma tela)
       -> historico.contribuicoes                        (salários)
       -> calcularSalarioBeneficio()                      (salário de
          benefício, dentro de calcularRMIDoHistorico())
       -> MotorRMI.calcularRMI() + MotorRMI.elegibilidadeRegraPermanente()
          (RMI TEÓRICA e ELEGIBILIDADE, sempre juntas — ver CORREÇÃO
          CRÍTICA abaixo)

   CORREÇÃO CRÍTICA (achado do usuário, pós-Atualização 18): a versão
   anterior deste teste calculava uma "RMI: R$ 599,958" a partir de só 3
   meses de contribuição sem NENHUM aviso de que isso não corresponde a
   uma aposentadoria de verdade (3 meses é uma fração ínfima dos 15-20
   anos e 180 meses de carência exigidos pela regra permanente). Isso é
   ótimo para provar o encadeamento matemático, péssimo se apresentado
   como resultado de um caso real. `calcularRMIDoHistorico()` agora
   sempre devolve `.elegibilidade` (elegível/pendências) ao lado de
   `.rmiTeorica` — a Etapa 5+6 abaixo confirma explicitamente que o
   cenário de 3 meses continua produzindo a mesma RMI teórica de antes,
   MAS agora vem acompanhada de `elegivel: false` com as pendências.

   NÃO É um teste E2E de NAVEGADOR (Playwright) como os testes
   `teste-e2e-*` da desapropriação — não existe nenhuma tela de UI para o
   domínio previdenciário ainda (decisão consciente de escopo, ver
   ARQUITETURA-MIGRACAO-PREVIDENCIARIO.md: "Não implemente CTPS, PPP,
   rural... primeiro faça um caso previdenciário completo funcionar do
   PDF até o valor final"). É um teste de INTEGRAÇÃO DE PONTA A PONTA no
   nível dos módulos JS: todo código do pipeline é o código de produção
   de verdade, carregado e executado sem mock — a ÚNICA peça dublada é
   `buscarSerieBcbComCache` (a chamada de rede à API do Bacen), pela mesma
   razão dos outros testes desta entrega: rodar determinístico e sem
   depender da API estar no ar. As contas foram conferidas à mão antes de
   escrever as asserções.

   Roda sem dependências externas: `node tests/teste-e2e-previdenciario-cnis-ate-rmi.js`.
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

// Série INPC sintética (mesma dos outros testes desta entrega, para as
// contas serem verificáveis à mão): 03/2001=1%, 04/2001=2%, 05/2001=-1%.
const DADOS_INPC_MOCK = [
  { data: '01/03/2001', valor: '1,00' },
  { data: '01/04/2001', valor: '2,00' },
  { data: '01/05/2001', valor: '-1,00' }
];

// CNIS SINTÉTICO — 1 vínculo de 3 meses, remuneração de R$ 1.000,00
// lançada em todos os 3, formato real de extrato (cabeçalho oficial +
// linha tabular de vínculo + linhas de remuneração por competência).
const CNIS_SINTETICO =
  'CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS\n' +
  'Relação de vínculos/contribuições\n' +
  'NIT: 123.45678.90-1  Nome: SEGURADO DE TESTE\n' +
  '01/03/2001 a 31/05/2001 - EMPRESA TESTE LTDA\n' +
  '03/2001 R$ 1.000,00\n' +
  '04/2001 R$ 1.000,00\n' +
  '05/2001 R$ 1.000,00\n';

function carregarPipelineCompleto(mockBuscarSerie) {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    // núcleo (mecanismo genérico)
    path.join(__dirname, '..', 'js', 'core', 'util.js'),
    path.join(__dirname, '..', 'js', 'core', 'indices.js'),
    path.join(__dirname, '..', 'js', 'core', 'calculoPeriodos.js'),
    // domínio previdenciário — mesma ordem de carregamento do index.html
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorTempoContribuicao.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorRMI.js'),
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
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'extraction', 'extratorRemuneracoesCNIS.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'mapping', 'mapperPrevidenciario.js'),
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
  sandbox.buscarSerieBcbComCache = mockBuscarSerie; // única peça dublada — ver cabeçalho
  return sandbox;
}

async function main() {
  console.log('== TESTE E2E — CNIS sintético -> identificação -> extração -> histórico -> salários -> salário de benefício -> RMI ==');
  const sb = carregarPipelineCompleto(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));

  let tipo, candidatosVinculo, candidatosRemuneracao, historico, resultadoFinal;

  await teste('ETAPA 1 — identificação: o texto sintético é reconhecido como CNIS', () => {
    tipo = sb.identificarTipoDocumentoPrevidenciario(CNIS_SINTETICO);
    assert.ok(tipo, 'deveria reconhecer o documento');
    assert.strictEqual(tipo.id, 'cnis');
  });

  await teste('ETAPA 2 — extração: 1 vínculo e 3 remunerações são extraídos do texto, cada um com fonte/página', () => {
    candidatosVinculo = sb.extrairVinculosDoTexto(CNIS_SINTETICO, { numero: 1, arquivo: 'cnis-sintetico.pdf' });
    candidatosRemuneracao = sb.extrairRemuneracoesDoTexto(CNIS_SINTETICO, { numero: 1, arquivo: 'cnis-sintetico.pdf' });
    assert.strictEqual(candidatosVinculo.length, 1);
    assert.strictEqual(candidatosVinculo[0].empregador, 'EMPRESA TESTE LTDA');
    assert.strictEqual(candidatosVinculo[0].status, 'validado');    assert.strictEqual(candidatosRemuneracao.length, 3);
    candidatosRemuneracao.forEach(r => {
      assert.strictEqual(r.status, 'validado');
      assert.strictEqual(r.fonte.documento, 'CNIS');
      assert.strictEqual(r.fonte.pagina, 1);
    });
  });

  await teste('ETAPA 3 — histórico (preenchimento da entidade): 1 vínculo, 3 remunerações associadas a ele, 3 contribuições derivadas', () => {
    historico = sb.montarHistorico({ vinculos: candidatosVinculo, remuneracoes: candidatosRemuneracao }, {});
    assert.strictEqual(historico.vinculos.length, 1);
    // O empregador não é copiado para o topo do vínculo mapeado (esse
    // achatamento é responsabilidade de mapperPrevidenciario.js, fora do
    // escopo desta entrega) — mas continua rastreável via proveniência
    // (`._origem`, o candidato bruto original da extração).
    assert.strictEqual(historico.vinculos[0]._origem.empregador, 'EMPRESA TESTE LTDA');
    assert.strictEqual(historico.remuneracoes.length, 3);
    historico.remuneracoes.forEach(r => assert.strictEqual(r.vinculoId, historico.vinculos[0].id));
    assert.strictEqual(historico.contribuicoes.length, 3);
    assert.strictEqual(historico.ignorados.vinculos.length, 0);
    assert.strictEqual(historico.ignorados.remuneracoes.length, 0);
  });

  await teste('ETAPA 4 — salários de contribuição: as 3 competências de historico.contribuicoes são exatamente as 3 remunerações lançadas', () => {
    const competencias = JSON.parse(JSON.stringify(historico.contribuicoes.map(c => c.competencia).sort()));
    assert.deepStrictEqual(competencias, ['2001-03', '2001-04', '2001-05']);
    historico.contribuicoes.forEach(c => assert.strictEqual(c.valor, 1000));
  });

  await teste('ETAPA 5+6 — salário de benefício (com memória de cálculo completa) e RMI TEÓRICA, encadeados por calcularRMIDoHistorico() — SEMPRE junto com a elegibilidade real', async () => {
    resultadoFinal = await sb.calcularRMIDoHistorico(historico, { competenciaReferencia: '2001-05', sexo: 'homem', idadeAnos: 40 });

    // Salário de benefício: mesmas contas já conferidas à mão nos testes
    // unitários (1009,80 + 990,00 + 1000,00) / 3 = 999,93.
    assert.ok(resultadoFinal.salarioBeneficio);
    assert.ok(proximo(resultadoFinal.salarioBeneficio.salarioBeneficio - 999.93));
    assert.strictEqual(resultadoFinal.salarioBeneficio.memoria.length, 3);
    resultadoFinal.salarioBeneficio.memoria.forEach(m => {
      assert.ok(m.indiceUtilizado.includes('INPC'));
      assert.ok(m.fatorAplicado > 0);
      assert.ok(m.participacaoNaMedia > 0);
      assert.strictEqual(m.fonte[0].documento, 'CNIS');
      assert.strictEqual(m.fonte[0].pagina, 1);
    });

    // RMI TEÓRICA: 999,93 x 60% — é só a fórmula, calculada mesmo com 3
    // meses de contribuição.
    assert.ok(resultadoFinal.rmiTeorica);
    assert.ok(proximo(resultadoFinal.rmiTeorica.percentualAplicado - 0.60));
    assert.ok(proximo(resultadoFinal.rmiTeorica.rmiFinal - 599.958));

    // CORREÇÃO CRÍTICA (o motivo desta reescrita): 3 meses de contribuição
    // não dão direito a nenhuma aposentadoria de verdade — a elegibilidade
    // TEM que vir false, com as pendências, na MESMA resposta que trouxe a
    // RMI teórica. Um caso previdenciário "completo" não é só o número —
    // é o número MAIS a informação de que ele não é (ainda) exercível.
    assert.ok(resultadoFinal.elegibilidade);
    assert.strictEqual(resultadoFinal.elegibilidade.elegivel, false);
    assert.ok(resultadoFinal.elegibilidade.pendencias.length > 0);
  });

  await teste('proveniência: o RMI final é rastreável até a página do PDF de origem, do início ao fim da cadeia', () => {
    const provVinculo = historico.proveniencia.find(p => p.tipo === 'vinculo');
    assert.strictEqual(provVinculo.fonte.documento, 'CNIS');
    assert.strictEqual(provVinculo.fonte.pagina, 1);
    assert.strictEqual(provVinculo.fonte.arquivo, 'cnis-sintetico.pdf');
    resultadoFinal.salarioBeneficio.memoria.forEach(m => {
      assert.strictEqual(m.fonte[0].arquivo, 'cnis-sintetico.pdf');
    });
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
}

main();
