/* ============================================================================
   DICIONARIOPREVIDENCIARIO.JS — Dicionário Semântico Jurídico (Previdenciário
   — RGPS/INSS): metadata, siglário, tipos de documento, campos semânticos
   com âncoras/candidatos/confundíveis, regras globais, matriz de conflitos
   e relações entre campos.

   ORIGEM (v1.0.0 — Atualização 3/Fase 2 da migração, ver
   docs/historico/ARQUITETURA-MIGRACAO-PREVIDENCIARIO.md): nasceu como só
   BASE DE CONHECIMENTO (dado declarativo), antes de existir motor de
   cálculo ou pipeline de extração. Hoje é consumido pelo Semantic Mapper
   (js/domains/previdenciario/semantics/) e por todo o pipeline de campos
   do processo (Evidence Layer -> Candidate Pool -> Decision Engine).

   ORIGEM DOS DADOS: base 100% sintética, redigida a partir de conhecimento
   público sobre o processo administrativo/judicial previdenciário brasileiro
   (Lei 8.213/91, Decreto 3.048/99, siglas e espécies de benefício usuais do
   INSS) — não contém segurados, benefícios, CPFs ou processos reais.

   DEPENDE de: nada (mesmo padrão de dicionarioSemantico.js — pode carregar
   isoladamente; não referencia nenhum identificador de outro arquivo).
============================================================================ */
var DICIONARIO_PREVIDENCIARIO = Object.freeze(
{
  "metadata": {
    "nome": "Dicionário Semântico Jurídico Sintético — Previdenciário (RGPS/INSS)",
    "versao": "1.0.0",
    "finalidade": "Base de conhecimento semântico para (nas fases seguintes) extração, classificação, preenchimento, revisão e cálculo em processos administrativos e judiciais de benefícios previdenciários do Regime Geral (RGPS).",
    "natureza": "100% sintética; não contém segurados, benefícios ou processos reais.",
    "regra_fundamental": "Conhecimento semântico orienta a interpretação; evidência documental (CNIS, CTPS, carta de concessão/indeferimento, decisão) determina os fatos do processo.",
    "descricao": "Base semântica inicial (v1.0.0) para o domínio previdenciário: siglário, tipos de documento, 25 campos semânticos, regras globais, matriz de conflitos comuns e relações entre campos. Ponto de partida da migração, pensado para crescer em atualizações futuras de forma incremental.",
    "uso": "Dados sintéticos para desenvolvimento e testes. Não substitui legislação, jurisprudência, perícia médica ou validação humana.",
    "escopo_fora_desta_entrega": [
      "motor de cálculo (RMI, tempo de contribuição, carência, DIB/DIP em concessão judicial) — Atualização 4",
      "pipeline de extração de PDF plugado a este dicionário — Atualização 4/5",
      "suíte de testes E2E com PDFs previdenciários sintéticos — Atualização 5",
      "chat jurídico ou interface de perguntas e respostas — fora de escopo em todas as fases, por decisão de produto"
    ],
    "estatisticas": {
      "campos_semanticos": 25,
      "tipos_documento": 9,
      "regras_globais": 7,
      "conflitos_mapeados": 8,
      "relacoes": 10,
      "siglas": 18
    }
  },

  "siglario": {
    "DER": "Data de Entrada do Requerimento — data em que o pedido administrativo foi protocolado no INSS. Não é, por si, o início do direito ao benefício.",
    "DIB": "Data de Início do Benefício — data a partir da qual o benefício é devido (pode ser a DER, uma data anterior por incapacidade/carência já preenchida, ou fixada por decisão judicial).",
    "DIP": "Data de Início do Pagamento — data a partir da qual o benefício passou a ser efetivamente pago; pode ser posterior à DIB (parcelas vencidas viram atrasados).",
    "DCB": "Data de Cessação do Benefício — data em que o benefício deixou (ou deixará) de ser pago (ex.: alta programada em auxílio por incapacidade).",
    "DID": "Data de Início da Doença/Incapacidade — apontada em perícia; frequentemente confundida com a DIB, mas não são o mesmo dado.",
    "DCI": "Data de Cessação da Incapacidade — usada em perícia judicial para delimitar o período de incapacidade reconhecido.",
    "NB": "Número do Benefício — identificador numérico do benefício no INSS; um mesmo segurado pode ter vários NBs ao longo da vida (benefícios distintos ou revisões).",
    "CNIS": "Cadastro Nacional de Informações Sociais — extrato oficial com vínculos, remunerações e contribuições do segurado; principal prova de tempo de contribuição.",
    "CTPS": "Carteira de Trabalho e Previdência Social — prova de vínculo empregatício, historicamente usada para preencher lacunas do CNIS.",
    "CTC": "Certidão de Tempo de Contribuição — documento que certifica tempo de contribuição, usado sobretudo para averbação em outro regime (RPPS) ou contagem recíproca.",
    "PPP": "Perfil Profissiográfico Previdenciário — documento do empregador que descreve exposição a agentes nocivos, usado para reconhecer atividade especial.",
    "RMI": "Renda Mensal Inicial — valor inicial do benefício, calculado a partir do salário de benefício e do percentual aplicável à espécie.",
    "SB": "Salário de Benefício — média dos salários de contribuição usada de base de cálculo da RMI.",
    "RGPS": "Regime Geral de Previdência Social — regime administrado pelo INSS, ao qual pertencem trabalhadores da iniciativa privada e, em regra, os informais/autônomos filiados.",
    "RPPS": "Regime Próprio de Previdência Social — regime de servidores públicos efetivos; distinto do RGPS (informação usada só para reconhecer se um documento é ou não do domínio deste dicionário).",
    "LOAS/BPC": "Benefício assistencial (Lei Orgânica da Assistência Social) — não é benefício previdenciário contributivo, mas tramita no mesmo domínio documental (CNIS/decisão) e é comumente confundido com aposentadoria por invalidez/idade.",
    "CID": "Classificação Internacional de Doenças — código da doença/lesão citado em laudos periciais; nunca deve ser usado como se fosse o NB ou qualquer identificador processual.",
    "TR/TNU": "Turma Recursal / Turma Nacional de Uniformização — instâncias recursais dos Juizados Especiais Federais, comuns em processos previdenciários judiciais."
  },

  "tipos_documento": {
    "cnis": {
      "nome": "CNIS — Cadastro Nacional de Informações Sociais",
      "descricao": "Extrato com a lista de vínculos/contribuições do segurado (empregador, datas de início/fim, remunerações mês a mês, indicador de vínculo em aberto).",
      "papel_no_processo": "Prova primária de tempo de contribuição e de salários de contribuição.",
      "ancoras_identificacao": ["CNIS", "Cadastro Nacional de Informações Sociais", "Extrato Previdenciário", "Relação de vínculos", "Consulta CNIS"],
      "riscos_comuns": [
        "vínculo listado sem data de fim não significa necessariamente vínculo ativo hoje — pode ser lacuna de informação do empregador",
        "remuneração zerada num mês não é o mesmo que ausência de contribuição (pode ser afastamento, licença) — não descartar o mês sem checar o código de ocorrência"
      ]
    },
    "ctps": {
      "nome": "CTPS — Carteira de Trabalho e Previdência Social",
      "descricao": "Registro de vínculos empregatícios anotados pelo empregador (página de contrato de trabalho: admissão, função, salário, saída).",
      "papel_no_processo": "Prova subsidiária de vínculo, sobretudo para período não coberto pelo CNIS (anterior à informatização).",
      "ancoras_identificacao": ["Carteira de Trabalho", "CTPS", "Contrato de Trabalho", "Anotações Gerais"],
      "riscos_comuns": ["data de admissão sem data de saída anotada não prova vínculo até hoje — só até a última anotação existente"]
    },
    "requerimentoAdministrativo": {
      "nome": "Requerimento Administrativo (protocolo do pedido no INSS)",
      "descricao": "Documento/tela que registra o protocolo do pedido de benefício, com a DER.",
      "papel_no_processo": "Fonte da DER; nunca é, por si, prova de concessão.",
      "ancoras_identificacao": ["Requerimento", "Protocolo", "Data de Entrada do Requerimento", "DER"],
      "riscos_comuns": ["confundir a DER (data do pedido) com a DIB (data do direito) — são conceitos diferentes mesmo quando coincidem no calendário"]
    },
    "cartaConcessao": {
      "nome": "Carta de Concessão",
      "descricao": "Comunicação oficial do INSS informando a concessão do benefício, com NB, espécie, DIB, DIP e RMI.",
      "papel_no_processo": "Documento de decisão administrativa favorável — fonte primária de NB/DIB/DIP/RMI/espécie.",
      "ancoras_identificacao": ["Carta de Concessão", "Concessão de Benefício", "Benefício concedido", "NB", "Número do Benefício"],
      "riscos_comuns": ["RMI da carta de concessão é o valor INICIAL — não confundir com o valor atual do benefício, que sofre reajustes"]
    },
    "cartaIndeferimento": {
      "nome": "Carta/Comunicado de Indeferimento",
      "descricao": "Comunicação oficial do INSS negando o pedido, com o motivo do indeferimento.",
      "papel_no_processo": "Fonte do motivo de indeferimento (ex.: carência não cumprida, perda da qualidade de segurado, incapacidade não constatada).",
      "ancoras_identificacao": ["Indeferimento", "Comunicado de Decisão", "Benefício não concedido", "Motivo do indeferimento"],
      "riscos_comuns": ["um indeferimento não tem DIB/DIP/RMI — não devem ser preenchidos a partir deste documento; só o motivo e a DER do pedido negado"]
    },
    "decisaoAdministrativa": {
      "nome": "Decisão Administrativa (recurso/junta de recursos)",
      "descricao": "Decisão de recurso administrativo (JRPS/CRPS) mantendo ou reformando a decisão inicial do INSS.",
      "papel_no_processo": "Pode alterar DIB/espécie/motivo em relação à decisão de primeira instância administrativa.",
      "ancoras_identificacao": ["Junta de Recursos", "Conselho de Recursos", "Recurso Administrativo", "mantém a decisão", "reforma a decisão"],
      "riscos_comuns": ["quando reforma a decisão original, o dado válido passa a ser o desta peça — não misturar com o documento reformado"]
    },
    "processoJudicial": {
      "nome": "Processo Judicial / Sentença Previdenciária",
      "descricao": "Ação judicial (comum, JEF ou vara federal) discutindo concessão, restabelecimento ou revisão de benefício.",
      "papel_no_processo": "Fonte de DIB judicial (quando diferente da administrativa), tutela antecipada, trânsito em julgado.",
      "ancoras_identificacao": ["Processo nº", "Autor", "INSS", "Instituto Nacional do Seguro Social", "Vara Federal", "Juizado Especial Federal", "sentença", "julgo procedente"],
      "riscos_comuns": ["confundir a DIB fixada na sentença com a DIB que constava do indeferimento administrativo — a judicial prevalece quando o pedido é julgado procedente"]
    },
    "laudoPericial": {
      "nome": "Laudo Pericial (médico ou social)",
      "descricao": "Perícia judicial ou administrativa apurando incapacidade, DID/DCI, ou condição social (para BPC).",
      "papel_no_processo": "Fonte de DID/DCI e do CID; nunca decide, por si, a DIB — isso é feito pela decisão que acolhe (ou não) o laudo.",
      "ancoras_identificacao": ["Laudo Pericial", "Perito", "quesitos", "CID", "incapacidade total", "incapacidade parcial", "data de início da incapacidade"],
      "riscos_comuns": ["laudo pericial é OPINIÃO TÉCNICA — a DIB só é confirmada quando a decisão (administrativa ou judicial) acolhe a data apontada pelo perito"]
    },
    "ppp": {
      "nome": "PPP — Perfil Profissiográfico Previdenciário",
      "descricao": "Documento do empregador detalhando função, agentes nocivos e responsável técnico, usado para reconhecimento de atividade especial.",
      "papel_no_processo": "Prova de exposição a agente nocivo para fins de conversão/reconhecimento de tempo especial.",
      "ancoras_identificacao": ["Perfil Profissiográfico Previdenciário", "PPP", "Agentes Nocivos", "Responsável pelos Registros Ambientais"],
      "riscos_comuns": ["PPP sem responsável técnico assinado é frequentemente questionado — não presumir validade automática do reconhecimento de especialidade"]
    }
  },

  "campos_semanticos": [
    {
      "campo": "numeroBeneficio",
      "categoria": "identificacao",
      "descricao": "Número do Benefício (NB) atribuído pelo INSS.",
      "ancoras": ["NB", "Número do Benefício", "Benefício nº", "NB:"],
      "formato": "numérico, geralmente 3.9-1 ou 10-11 dígitos agrupados",
      "confundivel_com": ["numeroProcesso (processo judicial, formato CNJ, não é o mesmo identificador)", "numeroCNIS (não existe — CNIS não tem número de benefício próprio)"],
      "peso_confianca_base": 0.9
    },
    {
      "campo": "especieBeneficio",
      "categoria": "beneficio",
      "descricao": "Código/nome da espécie de benefício (ex.: 41 aposentadoria por idade, 42 aposentadoria por tempo de contribuição, 32 aposentadoria por invalidez, 31 auxílio por incapacidade temporária, 21 pensão por morte, 88 BPC idoso, 87 BPC pessoa com deficiência).",
      "ancoras": ["Espécie", "Espécie de Benefício", "Código de Benefício", "B/"],
      "formato": "código numérico de 2 dígitos + nome por extenso",
      "confundivel_com": ["tipoBeneficioPretendido (o que foi pedido pode ser diferente do concedido, ex.: pedido de invalidez concedido como auxílio)"],
      "peso_confianca_base": 0.85
    },
    {
      "campo": "dataDER",
      "categoria": "datas",
      "descricao": "Data de Entrada do Requerimento administrativo.",
      "ancoras": ["DER", "Data de Entrada do Requerimento", "Data do Requerimento", "protocolado em"],
      "formato": "dd/mm/aaaa",
      "confundivel_com": ["dataDIB (a DER é a data do PEDIDO; a DIB é a data do DIREITO — não são automaticamente iguais)"],
      "peso_confianca_base": 0.85
    },
    {
      "campo": "dataDIB",
      "categoria": "datas",
      "descricao": "Data de Início do Benefício.",
      "ancoras": ["DIB", "Data de Início do Benefício", "benefício devido desde"],
      "formato": "dd/mm/aaaa",
      "confundivel_com": ["dataDER (pedido)", "dataDID (data apontada por perícia, ainda não necessariamente acolhida na decisão)", "dataDIP (início do PAGAMENTO, pode ser posterior)"],
      "peso_confianca_base": 0.85
    },
    {
      "campo": "dataDIP",
      "categoria": "datas",
      "descricao": "Data de Início do Pagamento.",
      "ancoras": ["DIP", "Data de Início do Pagamento", "primeiro pagamento em"],
      "formato": "dd/mm/aaaa",
      "confundivel_com": ["dataDIB (a DIP pode ser posterior à DIB — diferença vira atrasados/retroativos)"],
      "peso_confianca_base": 0.8
    },
    {
      "campo": "dataDCB",
      "categoria": "datas",
      "descricao": "Data de Cessação do Benefício (quando houver, ex.: alta programada).",
      "ancoras": ["DCB", "Data de Cessação do Benefício", "cessará em", "alta programada para"],
      "formato": "dd/mm/aaaa",
      "confundivel_com": ["dataDCI (cessação da incapacidade apontada em perícia, não necessariamente igual à DCB administrativa)"],
      "peso_confianca_base": 0.75
    },
    {
      "campo": "dataDID",
      "categoria": "datas",
      "descricao": "Data de Início da Doença/Incapacidade apontada em perícia.",
      "ancoras": ["DID", "Data de Início da Incapacidade", "Data de Início da Doença", "incapacidade desde"],
      "formato": "dd/mm/aaaa",
      "confundivel_com": ["dataDIB (a DID é opinião pericial; só vira DIB se a decisão acolher esta data especificamente)"],
      "peso_confianca_base": 0.7
    },
    {
      "campo": "nomeSegurado",
      "categoria": "identificacao",
      "descricao": "Nome completo da pessoa segurada/requerente.",
      "ancoras": ["Segurado(a):", "Requerente:", "Nome do Segurado", "Autor(a):"],
      "formato": "texto livre",
      "confundivel_com": ["nomeRepresentanteLegal (em benefícios de incapaz/BPC, o requerente pode ser o representante, não o próprio titular do direito)"],
      "peso_confianca_base": 0.8
    },
    {
      "campo": "cpfSegurado",
      "categoria": "identificacao",
      "descricao": "CPF do segurado, usado como chave de identificação do processo/documento (não como dado a exibir fora de contexto).",
      "ancoras": ["CPF:", "CPF nº"],
      "formato": "###.###.###-##",
      "confundivel_com": ["numeroBeneficio (formatos numéricos parecidos em documentos mal digitalizados)"],
      "peso_confianca_base": 0.8
    },
    {
      "campo": "qualidadeSegurado",
      "categoria": "beneficio",
      "descricao": "Situação do vínculo com a Previdência no momento do fato gerador (segurado filiado, em período de graça, ou com qualidade perdida).",
      "ancoras": ["qualidade de segurado", "período de graça", "manteve a qualidade de segurado"],
      "formato": "categórico (mantida / perdida / em período de graça)",
      "confundivel_com": ["carenciaCumprida (qualidade de segurado e carência são requisitos distintos, ambos exigíveis)"],
      "peso_confianca_base": 0.65
    },
    {
      "campo": "carenciaCumprida",
      "categoria": "beneficio",
      "descricao": "Número de contribuições mensais (carência) reconhecidas até a DER/DIB, e se atinge o mínimo exigido pela espécie pedida.",
      "ancoras": ["carência", "contribuições exigidas", "número de contribuições"],
      "formato": "número de meses",
      "confundivel_com": ["tempoContribuicaoTotal (carência conta MESES COM contribuição; tempo de contribuição conta o PERÍODO todo, incluindo tempo especial convertido)"],
      "peso_confianca_base": 0.6
    },
    {
      "campo": "tempoContribuicaoTotal",
      "categoria": "beneficio",
      "descricao": "Tempo total de contribuição reconhecido (anos/meses/dias), somando todos os vínculos e períodos averbados.",
      "ancoras": ["tempo de contribuição", "tempo de serviço", "total apurado"],
      "formato": "anos, meses e dias",
      "confundivel_com": ["carenciaCumprida", "tempoContribuicaoAlegado (o que o segurado pleiteia pode diferir do que a decisão efetivamente reconhece — nunca tratar pedido como reconhecido)"],
      "peso_confianca_base": 0.6
    },
    {
      "campo": "salarioBeneficio",
      "categoria": "valores",
      "descricao": "Salário de Benefício (SB) — base de cálculo da RMI, média dos salários de contribuição no período considerado.",
      "ancoras": ["salário de benefício", "SB", "média dos salários de contribuição"],
      "formato": "R$",
      "confundivel_com": ["rendaMensalInicial (o SB é a BASE de cálculo; a RMI é o RESULTADO após aplicar o percentual/fator da espécie)"],
      "peso_confianca_base": 0.55
    },
    {
      "campo": "rendaMensalInicial",
      "categoria": "valores",
      "descricao": "Renda Mensal Inicial (RMI) do benefício, na data da concessão.",
      "ancoras": ["RMI", "Renda Mensal Inicial", "valor do benefício"],
      "formato": "R$",
      "confundivel_com": ["valorAtualBeneficio (a RMI é histórica/inicial; o valor pago hoje já sofreu reajustes — não são o mesmo número)"],
      "peso_confianca_base": 0.7
    },
    {
      "campo": "motivoIndeferimento",
      "categoria": "beneficio",
      "descricao": "Motivo formal da negativa administrativa (ex.: carência não cumprida, perda da qualidade de segurado, incapacidade não constatada, ausência de início de prova material).",
      "ancoras": ["motivo do indeferimento", "razão da negativa", "não foi possível conceder"],
      "formato": "texto categorizável",
      "confundivel_com": ["motivoCessacao (indeferimento é recusa de CONCEDER; cessação é interrupção de benefício JÁ concedido — situações diferentes)"],
      "peso_confianca_base": 0.75
    },
    {
      "campo": "atividadeEspecial",
      "categoria": "vinculos",
      "descricao": "Períodos em que o segurado esteve exposto a agente nocivo, reconhecidos (ou pleiteados) como tempo especial, sujeitos a conversão.",
      "ancoras": ["atividade especial", "tempo especial", "agente nocivo", "conversão de tempo especial"],
      "formato": "período (datas de início/fim) + agente nocivo",
      "confundivel_com": ["periodoRural (categorias distintas de reconhecimento de tempo, com prova e regra próprias)"],
      "peso_confianca_base": 0.55
    },
    {
      "campo": "periodoRural",
      "categoria": "vinculos",
      "descricao": "Período de atividade rural (segurado especial), reconhecido por início de prova material + prova testemunhal.",
      "ancoras": ["atividade rural", "segurado especial", "regime de economia familiar"],
      "formato": "período (datas de início/fim)",
      "confundivel_com": ["atividadeEspecial"],
      "peso_confianca_base": 0.5
    },
    {
      "campo": "vinculoEmpregaticio",
      "categoria": "vinculos",
      "descricao": "Um vínculo individual constante do CNIS/CTPS (empregador, datas de início/fim, remuneração).",
      "ancoras": ["Empregador:", "Admissão:", "Vínculo nº"],
      "formato": "lista de períodos por empregador",
      "confundivel_com": ["periodoContributivoAutonomo (vínculo empregatício tem empregador identificado; contribuição de autônomo/facultativo não)"],
      "peso_confianca_base": 0.6
    },
    {
      "campo": "dataNascimento",
      "categoria": "identificacao",
      "descricao": "Data de nascimento do segurado (relevante para idade mínima em aposentadoria por idade e para BPC idoso).",
      "ancoras": ["Data de Nascimento:", "nascido em"],
      "formato": "dd/mm/aaaa",
      "confundivel_com": [],
      "peso_confianca_base": 0.8
    },
    {
      "campo": "dataObito",
      "categoria": "identificacao",
      "descricao": "Data de óbito do instituidor, em processos de pensão por morte.",
      "ancoras": ["Data do Óbito:", "faleceu em", "óbito ocorrido em"],
      "formato": "dd/mm/aaaa",
      "confundivel_com": ["dataDIB (na pensão por morte a DIB costuma coincidir com o óbito, mas isso é regra de cálculo, não identidade automática de campo)"],
      "peso_confianca_base": 0.8
    },
    {
      "campo": "dataAjuizamento",
      "categoria": "datas",
      "descricao": "Data de distribuição/ajuizamento da ação judicial previdenciária.",
      "ancoras": ["distribuída em", "ajuizada em", "data de distribuição"],
      "formato": "dd/mm/aaaa",
      "confundivel_com": ["dataDER (o ajuizamento é sempre POSTERIOR ao esgotamento ou não da via administrativa, nunca deve ser confundido com o protocolo do pedido no INSS)"],
      "peso_confianca_base": 0.75
    },
    {
      "campo": "tutelaAntecipada",
      "categoria": "beneficio",
      "descricao": "Indica se foi concedida tutela de urgência/antecipada determinando implantação do benefício antes do trânsito em julgado.",
      "ancoras": ["tutela antecipada", "tutela de urgência", "implante o benefício em até"],
      "formato": "booleano + data da decisão",
      "confundivel_com": ["dataSentenca (a tutela pode ser concedida bem antes da sentença de mérito)"],
      "peso_confianca_base": 0.7
    },
    {
      "campo": "dataSentencaJudicial",
      "categoria": "datas",
      "descricao": "Data em que a sentença foi proferida no processo judicial previdenciário.",
      "ancoras": ["sentença proferida em", "julgo procedente", "julgo improcedente"],
      "formato": "dd/mm/aaaa",
      "confundivel_com": ["dataTransitoJulgado"],
      "peso_confianca_base": 0.8
    },
    {
      "campo": "dataTransitoJulgado",
      "categoria": "datas",
      "descricao": "Data do trânsito em julgado da decisão (relevante para cálculo de atrasados e para RPV/precatório).",
      "ancoras": ["trânsito em julgado", "certidão de trânsito"],
      "formato": "dd/mm/aaaa",
      "confundivel_com": ["dataSentencaJudicial"],
      "peso_confianca_base": 0.75
    },
    {
      "campo": "cidLaudoPericial",
      "categoria": "beneficio",
      "descricao": "Código CID citado no laudo pericial como diagnóstico relacionado à incapacidade.",
      "ancoras": ["CID", "Classificação Internacional de Doenças", "diagnóstico:"],
      "formato": "letra + números (ex.: M54.5)",
      "confundivel_com": ["numeroBeneficio (nunca confundir código de doença com identificador de benefício, mesmo quando ambos são alfanuméricos curtos)"],
      "peso_confianca_base": 0.6
    }
  ],

  "regras_globais": [
    { "id": "RGP001", "regra": "DER (data do requerimento) e DIB (data do direito) nunca devem ser tratadas como o mesmo campo por padrão — só coincidem quando o documento afirma isso explicitamente." },
    { "id": "RGP002", "regra": "Um documento de indeferimento não tem NB/DIB/DIP/RMI — não preencher esses campos a partir dele; só DER, espécie pretendida e motivo do indeferimento." },
    { "id": "RGP003", "regra": "A data apontada por um laudo pericial (DID) é evidência técnica, não decisão — só vira DIB quando a decisão (administrativa ou judicial) expressamente a acolhe." },
    { "id": "RGP004", "regra": "Tempo de contribuição e carência são requisitos distintos (um conta período, outro conta número de contribuições mensais) — nunca usar um valor para preencher o outro campo." },
    { "id": "RGP005", "regra": "O que o segurado ALEGA ou PLEITEIA (petição, requerimento) não deve ser preenchido como reconhecido/concedido sem a decisão correspondente confirmar." },
    { "id": "RGP006", "regra": "RMI é o valor INICIAL do benefício, na data da concessão — nunca deve ser preenchida com o valor atual (que já sofreu reajustes) sem qualificação clara da data." },
    { "id": "RGP007", "regra": "BPC/LOAS não é benefício previdenciário contributivo (não tem carência nem tempo de contribuição) — campos desses tipos não se aplicam a esse tipo de benefício e não devem ser cobrados/preenchidos." }
  ],

  "matriz_conflitos": [
    { "campos": ["dataDER", "dataDIB"], "risco": "confundir pedido com direito", "regra_associada": "RGP001" },
    { "campos": ["dataDIB", "dataDIP"], "risco": "confundir início do direito com início do pagamento efetivo", "regra_associada": null },
    { "campos": ["dataDID", "dataDIB"], "risco": "tratar apontamento pericial como se já fosse data decidida", "regra_associada": "RGP003" },
    { "campos": ["carenciaCumprida", "tempoContribuicaoTotal"], "risco": "usar contagem de um requisito para preencher o outro", "regra_associada": "RGP004" },
    { "campos": ["salarioBeneficio", "rendaMensalInicial"], "risco": "confundir a base de cálculo com o resultado do cálculo", "regra_associada": "RGP006" },
    { "campos": ["rendaMensalInicial", "valorAtualBeneficio"], "risco": "confundir valor histórico com valor reajustado atual", "regra_associada": "RGP006" },
    { "campos": ["motivoIndeferimento", "dataDIB"], "risco": "preencher DIB a partir de um documento que é, na verdade, uma negativa", "regra_associada": "RGP002" },
    { "campos": ["atividadeEspecial", "periodoRural"], "risco": "tratar as duas categorias de tempo diferenciado como se tivessem a mesma prova exigida", "regra_associada": null }
  ],

  "relacoes_entre_campos": [
    { "de": "dataDIB", "para": "dataDIP", "relacao": "DIP é, em regra, igual ou posterior à DIB — nunca anterior." },
    { "de": "dataDER", "para": "dataAjuizamento", "relacao": "Em ação judicial que segue esgotamento da via administrativa, o ajuizamento é posterior à DER (ou ao indeferimento)." },
    { "de": "dataSentencaJudicial", "para": "dataTransitoJulgado", "relacao": "Trânsito em julgado é igual ou posterior à data da sentença (ou do último recurso julgado)." },
    { "de": "dataObito", "para": "dataDIB", "relacao": "Em pensão por morte, a DIB costuma ser a data do óbito quando requerida dentro do prazo legal — é regra de cálculo, a confirmar na decisão, não presunção automática de extração." },
    { "de": "salarioBeneficio", "para": "rendaMensalInicial", "relacao": "RMI é derivada do salário de benefício aplicando o percentual/fator da espécie — nunca são o mesmo número por coincidência de layout." },
    { "de": "carenciaCumprida", "para": "motivoIndeferimento", "relacao": "Carência insuficiente é uma das causas típicas de indeferimento — quando presente, é sinal para revisar se motivoIndeferimento também deveria estar preenchido." },
    { "de": "tutelaAntecipada", "para": "dataDIP", "relacao": "Quando há tutela antecipada, o início efetivo do pagamento tende a seguir a data da decisão de tutela, não a do trânsito em julgado." },
    { "de": "dataDID", "para": "dataDIB", "relacao": "Só vira a mesma data quando a decisão declara expressamente ter acolhido a DID apontada em perícia (ver RGP003)." },
    { "de": "especieBeneficio", "para": "carenciaCumprida", "relacao": "O número mínimo de contribuições exigido varia por espécie — o mesmo valor de carência pode ser suficiente para uma espécie e insuficiente para outra." },
    { "de": "atividadeEspecial", "para": "tempoContribuicaoTotal", "relacao": "Tempo especial reconhecido pode ser convertido e somado ao tempo comum, alterando o total — mas só depois de reconhecido, não pelo simples pedido." }
  ]
});

// UMD simples (acrescentado nesta entrega — mesmo padrão de todo o resto do
// app): no navegador continua só global (nada muda ali); no Node
// (backend/server.js e módulos que ele requer, ex.:
// camposRevisaoIAPrevidenciario.js), passa a ser possível
// require('./dicionarioPrevidenciario.js').DICIONARIO_PREVIDENCIARIO em vez
// de depender de um global que o backend nunca tinha.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DICIONARIO_PREVIDENCIARIO };
}
