import OpenAI from 'openai'
import { logger } from '../config/logger.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
let lastQuotaWarningAt = 0

const CATEGORY_KEYWORDS = [
  { category: 'Alimentação', patterns: ['mercado', 'supermercado', 'pizza', 'pizzaria', 'almoco', 'almoço', 'janta', 'lanche', 'lanchonete', 'delivery', 'ifood', 'comida', 'restaurante'] },
  { category: 'Combustível', patterns: ['gasolina', 'combustivel', 'combustível', 'etanol', 'posto'] },
  { category: 'Saúde', patterns: ['farmacia', 'farmácia', 'remedio', 'remédio', 'medico', 'médico', 'consulta', 'hospital', 'cabeleleiro', 'cabeleireiro', 'barbearia', 'salão'] },
  { category: 'Transporte', patterns: ['uber', '99', 'taxi', 'táxi', 'onibus', 'ônibus', 'passagem', 'transporte', 'carro'] },
  { category: 'Aluguel', patterns: ['aluguel', 'condominio', 'condomínio'] },
  { category: 'Energia', patterns: ['energia', 'luz', 'conta de agua', 'água', 'agua'] },
  { category: 'Serviços', patterns: ['internet', 'netflix', 'spotify', 'seguro', 'oficina', 'presente', 'roupa', 'roupas', 'loja', 'shopping', 'lazer', 'passeio', 'fatura celular', 'celular', 'telefone', 'material escolar'] },
  { category: 'Impostos', patterns: ['ipva', 'imposto', 'taxa', 'licenciamento'] },
  { category: 'Outros', patterns: ['outros', 'diversos'] },
  { category: 'Vendas', patterns: ['vendi', 'venda', 'cliente', 'comissao', 'comissão'] }
]

function normalizeText(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function inferCategory(text = '') {
  const normalized = normalizeText(text)

  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.patterns.some((pattern) => normalized.includes(pattern))) {
      return entry.category
    }
  }

  return null
}

function inferInstallments(text = '') {
  const match = String(text).match(/(\d{1,2})\s*(x|vezes)/i)
  const value = match ? Number(match[1]) : null
  return Number.isFinite(value) && value > 1 && value <= 12 ? value : null
}

function inferPaymentMethod(text = '') {
  const normalized = normalizeText(text)
  if (/\bpix\b/.test(normalized)) return 'PIX'
  if (/\bdinheiro\b|\bespecie\b/.test(normalized)) return 'CASH'
  if (/\bcartao\b|\bcartão\b/.test(normalized) && /\bdebito\b|\bdébito\b/.test(normalized)) return 'DEBIT_CARD'
  if (/\bcartao\b|\bcartão\b/.test(normalized)) return 'CREDIT_CARD'
  return null
}

function inferAccountLabel(text = '') {
  const source = String(text || '')
  const cardMatch = source.match(/cart[aã]o(?:\s+de\s+(?:cr[eé]dito|d[eé]bito))?\s+(?:do|da|de)?\s*([a-z0-9à-ú\-\s]{2,40}?)(?=\s+(?:em\s+\d{1,2}\s*(?:x|vezes)|parcelad[oa]|por\s+r\$|de\s+r\$)|$)/i)
  if (cardMatch?.[1]) {
    return cardMatch[1].trim().replace(/\s+/g, ' ')
  }

  const bankMatch = source.match(/(?:no|na|do|da)\s+([a-z0-9à-ú\-\s]{2,30})$/i)
  if (bankMatch?.[1]) {
    return bankMatch[1].trim().replace(/\s+/g, ' ')
  }

  return null
}

function inferRelativeDateISO(text = '') {
  const normalized = normalizeText(text)
  const now = new Date()

  if (/\bhoje\b/.test(normalized)) {
    return now.toISOString().slice(0, 10)
  }

  if (/\bontem\b/.test(normalized)) {
    const date = new Date(now)
    date.setDate(date.getDate() - 1)
    return date.toISOString().slice(0, 10)
  }

  if (/\bamanh[ãa]\b/.test(normalized)) {
    const date = new Date(now)
    date.setDate(date.getDate() + 1)
    return date.toISOString().slice(0, 10)
  }

  return null
}

function inferContact(text = '') {
  const normalized = normalizeText(text)
  const personMatch = normalized.match(/(?:minha|meu|da|do)\s+(esposa|marido|filho|filha|gabriel|gabriella)/i)
  if (personMatch?.[1]) return personMatch[1]
  return null
}

function inferTransferTarget(text = '') {
  const match = String(text).match(/(?:para|pra|pro|na|no)\s+([a-z0-9à-ú\s]{3,40})/i)
  if (!match?.[1]) return null
  return match[1].trim().replace(/\s+/g, ' ')
}

function inferGoalName(text = '') {
  const normalized = String(text).trim()
  const explicit = normalized.match(/quero\s+(?:comprar|juntar|economizar|montar)\s+(.+)/i)
  if (explicit?.[1]) return explicit[1].trim()
  const fallback = normalized.match(/(?:meta|objetivo|viagem|carro|casa|reserva)/i)
  return fallback ? normalized : null
}

function seemsExpenseIntent(text = '') {
  return /(gastei|paguei|comprei|assinei|almocei|almocei|peguei um uber|peguei uber|fiz uma compra|levei o carro|conta de|fraldas|material escolar|presente|cartao|cartão|farmacia|farmácia|mercado|pizzaria|lanchonete|loja|shopping|lazer|passeio|cabeleleiro|cabeleireiro|energia|agua|água|combustivel|combustível|fatura celular|fatura cartao|fatura cartão)/i.test(text)
}

function seemsIncomeIntent(text = '') {
  return /(recebi|ganhei|caiu meu salario|caiu meu salário|salario|salário|bonus|bônus|ferias|férias|decimo terceiro|décimo terceiro|comissao|comissão|vendi|restituicao|restituição|recebi um pix)/i.test(text)
}

function seemsScheduleIntent(text = '') {
  return /(lembrar|lembra|adicione uma conta|adicionar conta|vence|vencimento|vencer|dia\s+\d{1,2})/i.test(text)
}

function seemsTransferIntent(text = '') {
  return /(transferi|transferencia|transferência|mandei dinheiro|passei dinheiro|coloquei dinheiro|tirei dinheiro|fiz um pix|pix para|para a poupanca|para a poupança|reserva|nubank|sicredi)/i.test(text)
}

function seemsGoalIntent(text = '') {
  return /(quero economizar|quero comprar|quero viajar|quero montar uma reserva|quero juntar|meta|objetivo)/i.test(text)
}

function seemsGoalQuery(text = '') {
  return /(quanto falta para|minha viagem|minha casa|minha meta|minhas metas|como esta minha meta|como está minha meta|progresso da meta)/i.test(text)
}

function seemsCardQuery(text = '') {
  return /(fatura|limite disponivel|limite disponível|gastei no cartao|gastei no cartão|cartao esta alto|cartão está alto|fechar minha fatura)/i.test(text)
}

function seemsSummaryIntent(text = '') {
  return /(mostre meu resumo|resumo|relatorio|relatório|como foi|como estao meus gastos|como estão meus gastos|compare|grafico|gráfico|o que mais gastamos)/i.test(text)
}

function seemsBalanceIntent(text = '') {
  return /(qual meu saldo|quanto sobrou|quanto tenho em caixa|quanto ainda posso gastar|saldo|quanto tenho)/i.test(text)
}

function seemsAdvisoryQuery(text = '') {
  return /(estou gastando demais|posso viajar|posso trocar de carro|posso comprar|vale a pena|onde posso economizar|como melhorar|minhas financas|minhas finanças|meu cartao esta alto|meu cartão está alto|quanto posso gastar|quanto gastei|quanto foi|qual foi|quanto minha esposa gastou|quanto eu gastei|estou economizando|quanto economizei)/i.test(text)
}

function localFallbackParse(message) {
  const text = (message || '').trim()
  const lower = normalizeText(text)
  const category = inferCategory(text)

  const amountMatch = text.match(/(?:r\$\s*)?(\d{1,3}(?:[\.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[\.,]\d{1,2})?)/)
  const rawAmount = amountMatch?.[1]?.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const amount = rawAmount ? Number(rawAmount) : null

  if (['saldo', 'saldo atual', 'quanto tenho'].includes(lower)) {
    return { action: 'QUERY_BALANCE', confidence: 0.9 }
  }

  if (['resumo', 'relatorio', 'dashboard', 'como esta'].includes(lower)) {
    return { action: 'QUERY_SUMMARY', confidence: 0.9 }
  }

  if (['resumo da familia', 'resumo geral', 'relatorio completo', 'meu resumo'].includes(lower)) {
    return { action: 'QUERY_SUMMARY', confidence: 0.92 }
  }

  if (['contas', 'contas a pagar', 'vencimentos'].includes(lower)) {
    return { action: 'QUERY_SCHEDULED', confidence: 0.9 }
  }

  if (seemsBalanceIntent(lower)) {
    return { action: 'QUERY_BALANCE', confidence: 0.88 }
  }

  if (seemsSummaryIntent(lower)) {
    return { action: 'QUERY_SUMMARY', confidence: 0.88 }
  }

  if (['fluxo de caixa', 'caixa', 'cashflow'].includes(lower)) {
    return { action: 'QUERY_CASHFLOW', confidence: 0.88 }
  }

  if (seemsCardQuery(lower)) {
    return { action: 'QUERY_CARD', query: text, confidence: 0.88 }
  }

  if (seemsGoalQuery(lower)) {
    return { action: 'QUERY_GOALS', query: text, confidence: 0.88 }
  }

  if (['gastos por categoria', 'categorias', 'onde gastei mais'].includes(lower)) {
    return { action: 'QUERY_EXPENSES_CATEGORY', confidence: 0.88 }
  }

  if (['quanto gastei', 'quanto eu gastei', 'gastos do mes', 'gastos mes'].includes(lower)) {
    return { action: 'QUERY_SPECIFIC', query: text, confidence: 0.82 }
  }

  if (seemsAdvisoryQuery(lower) || /\?$/.test(text)) {
    return { action: 'QUERY_SPECIFIC', query: text, confidence: 0.84 }
  }

  if (['ajuda', 'help', 'menu', 'comandos', 'teste'].includes(lower)) {
    return { action: 'HELP', confidence: 0.95 }
  }

  if (seemsScheduleIntent(lower)) {
    return {
      action: 'ADD_SCHEDULED',
      amount,
      description: text,
      dueDate: inferRelativeDateISO(text),
      category,
      paymentMethod: inferPaymentMethod(text),
      account: inferAccountLabel(text),
      contact: inferContact(text),
      confidence: 0.7
    }
  }

  if (seemsTransferIntent(lower)) {
    return {
      action: 'ADD_TRANSFER',
      amount,
      description: text,
      account: inferTransferTarget(text),
      paymentMethod: inferPaymentMethod(text) || (/pix/i.test(text) ? 'PIX' : null),
      contact: inferContact(text),
      date: inferRelativeDateISO(text),
      confidence: amount ? 0.82 : 0.7
    }
  }

  if (seemsGoalIntent(lower)) {
    return {
      action: 'ADD_GOAL',
      amount,
      description: inferGoalName(text) || text,
      date: inferRelativeDateISO(text),
      confidence: amount ? 0.8 : 0.68
    }
  }

  if (seemsExpenseIntent(lower) || (amount && /(despesa|pago|pixei|transferi|cartao|cartão)/i.test(lower))) {
    return {
      action: 'ADD_EXPENSE',
      amount,
      description: text,
      category,
      paymentMethod: inferPaymentMethod(text),
      account: inferAccountLabel(text),
      contact: inferContact(text),
      date: inferRelativeDateISO(text),
      installments: inferInstallments(text),
      confidence: amount ? 0.8 : 0.7
    }
  }

  if (seemsIncomeIntent(lower) || (amount && /(entrada|faturei)/i.test(lower))) {
    return {
      action: 'ADD_INCOME',
      amount,
      description: text,
      category,
      paymentMethod: inferPaymentMethod(text),
      account: inferAccountLabel(text),
      contact: inferContact(text),
      date: inferRelativeDateISO(text),
      confidence: amount ? 0.8 : 0.7
    }
  }

  if (text.length >= 8) {
    return { action: 'QUERY_SPECIFIC', query: text, confidence: 0.55 }
  }

  return { action: 'HELP', confidence: 0.4 }
}

/**
 * Interpreta uma mensagem de WhatsApp e extrai a intenção financeira.
 * Retorna um objeto estruturado com a ação a ser executada.
 */
export async function parseFinancialMessage(message, context = {}) {
  const today = new Date().toLocaleDateString('pt-BR')
  const currentMonth = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const systemPrompt = `Você é um assistente financeiro inteligente integrado ao WhatsApp.
Hoje é ${today}. Mês atual: ${currentMonth}.

Sua tarefa é interpretar mensagens em linguagem natural e retornar um JSON estruturado com a ação financeira.
O usuário NÃO precisa usar comandos. Ele fala como fala com outra pessoa e você deve entender a intenção.

TIPOS DE AÇÃO:
- ADD_INCOME: registrar entrada de dinheiro
- ADD_EXPENSE: registrar saída de dinheiro  
- ADD_TRANSFER: registrar movimentação entre contas/reserva/bancos
- ADD_GOAL: criar meta financeira
- ADD_SCHEDULED: agendar pagamento/recebimento futuro
- QUERY_BALANCE: consultar saldo
- QUERY_SUMMARY: resumo geral da empresa
- QUERY_CASHFLOW: fluxo de caixa
- QUERY_EXPENSES_CATEGORY: gastos por categoria
- QUERY_TRANSACTIONS: listar transações
- QUERY_SCHEDULED: contas a pagar/receber
- QUERY_GOALS: consultar metas e progresso
- QUERY_CARD: consultar cartão, fatura, parcelas e limite disponível
- QUERY_SPECIFIC: pergunta específica (ex: "quanto gastei com gasolina?")
- CHART_REQUEST: pedir gráfico
- HELP: ajuda/não entendido

EXEMPLOS DE FALA NATURAL QUE DEVEM SER ENTENDIDOS:
- "gastei R$ 150 no mercado"
- "paguei a conta de luz"
- "comprei uma pizza"
- "farmacia R$ 80"
- "mercado R$ 300"
- "pizzaria R$ 120"
- "loja R$ 220"
- "lanchonete R$ 45"
- "cabeleleiro R$ 60"
- "carro R$ 200"
- "shopping R$ 350"
- "lazer R$ 150"
- "passeio R$ 80"
- "combustivel R$ 250"
- "energia R$ 140"
- "conta de agua R$ 90"
- "fatura celular R$ 75"
- "fatura cartao R$ 980"
- "outros R$ 50"
- "recebi meu salário"
- "caiu meu salário"
- "recebi um PIX"
- "transferi R$ 500 para a poupança"
- "passei R$ 250 no cartão"
- "comprei um celular em 12 parcelas"
- "quanto gastei hoje?"
- "qual meu saldo?"
- "lembrar da internet dia 10"
- "quero economizar R$ 500 por mês"
- "minha esposa gastou R$ 150"
- "mostre meu resumo"
- "estou gastando demais?"

REGRAS IMPORTANTES:
- Se a mensagem indicar gasto, use ADD_EXPENSE mesmo quando o usuário falar de forma informal.
- Se a mensagem indicar entrada, use ADD_INCOME mesmo quando o usuário não usar termos técnicos.
- Se a mensagem indicar transferência entre contas, reserva, poupança ou bancos, use ADD_TRANSFER.
- Se a mensagem indicar criação de objetivo financeiro, use ADD_GOAL.
- Se faltar valor ou data, ainda identifique a ação correta; deixe campos ausentes como null.
- Sempre que possível, extraia também paymentMethod, account, contact e date quando o usuário mencionar isso.
- Para perguntas analíticas, consultivas, comparativas ou abertas sobre finanças, use QUERY_SPECIFIC.
- Para perguntas sobre cartão, limite, fatura, economia, possibilidade de compra, viagem ou financiamento, prefira QUERY_SPECIFIC quando não houver ação transacional direta.
- Para metas, família, comparação entre pessoas e perguntas amplas, prefira QUERY_SPECIFIC.
- Quando houver parcelamento no cartão de crédito, preencha installments com o número total de parcelas entre 1 e 12.

CATEGORIAS DISPONÍVEIS: Estoque, Funcionários, Aluguel, Marketing, Energia, Combustível, Alimentação, Saúde, Transporte, Serviços, Equipamentos, Impostos, Vendas, Serviços Prestados, Outros

Retorne APENAS JSON válido, sem markdown:
{
  "action": "ADD_EXPENSE",
  "amount": 180.00,
  "description": "Gasolina",
  "category": "Combustível",
  "paymentMethod": "PIX",
  "installments": null,
  "contact": null,
  "date": null,
  "dueDate": null,
  "account": "Caixa",
  "period": null,
  "query": null,
  "confidence": 0.95
}

Para QUERY_SPECIFIC, preencha "query" com a pergunta reformulada.
Para paymentMethod use uma destas opções quando houver contexto: PIX, CASH, CREDIT_CARD, DEBIT_CARD.
Para datas, use formato ISO (YYYY-MM-DD).
Datas relativas: "amanhã" = dia seguinte, "semana que vem" = próxima segunda.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })

    const parsed = JSON.parse(response.choices[0].message.content)
    logger.debug({ parsed }, 'IA interpretou mensagem')
    return parsed
  } catch (error) {
    const code = error?.code || error?.error?.code
    const isQuota = code === 'insufficient_quota' || error?.status === 429

    if (isQuota) {
      const now = Date.now()
      if (now - lastQuotaWarningAt > 10 * 60 * 1000) {
        lastQuotaWarningAt = now
        logger.warn({ code, status: error?.status }, 'OpenAI sem quota; usando fallback local')
      }
    } else {
      logger.error({ error }, 'Erro ao interpretar mensagem com IA')
    }

    return localFallbackParse(message)
  }
}

/**
 * Gera uma resposta em linguagem natural para enviar de volta ao WhatsApp.
 */
export async function generateNaturalResponse(data, userName = 'você') {
  const prompt = `Você é um assistente financeiro amigável e direto no WhatsApp.
Responda de forma concisa, clara e em português brasileiro.
Use emojis moderadamente. Não use markdown (negrito, etc.) pois o WhatsApp não renderiza.
Tutele o usuário como "${userName}".

Dados para formatar como resposta: ${JSON.stringify(data)}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500
    })
    return response.choices[0].message.content
  } catch (error) {
    logger.error({ error }, 'Erro ao gerar resposta natural')
    return 'Desculpe, tive um problema ao processar sua solicitação. Tente novamente.'
  }
}

/**
 * Gera análise financeira inteligente (insights).
 */
export async function generateFinancialInsights(summaryData) {
  const prompt = `Você é um consultor financeiro experiente. Analise os dados abaixo e gere 3 insights relevantes e acionáveis para o dono do negócio. 
Seja direto, use linguagem simples. Responda em português. Sem markdown.
Dados: ${JSON.stringify(summaryData)}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 400
    })
    return response.choices[0].message.content
  } catch {
    return null
  }
}

/**
 * Responde perguntas financeiras específicas com base nos dados do tenant.
 */
export async function answerFinancialQuestion(question, financialData) {
  const prompt = `Você é um contador inteligente. Com base nos dados financeiros abaixo, responda à pergunta do usuário de forma clara e direta.
Use números reais dos dados. Formato: linguagem natural, sem markdown.
Dados: ${JSON.stringify(financialData)}
Pergunta: ${question}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 400
    })
    return response.choices[0].message.content
  } catch {
    return 'Não consegui processar essa pergunta no momento.'
  }
}
