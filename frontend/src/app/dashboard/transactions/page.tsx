'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Plus, Trash2, Search, CreditCard, Wallet, QrCode, Loader, ChevronDown, ChevronRight, PencilLine } from 'lucide-react'
import ConfirmModal from '@/components/ConfirmModal'
import EmptyState, { LoadingSkeleton } from '@/components/EmptyState'
import ExportData from '@/components/ExportData'
import { validateAmount, validateDescription } from '@/lib/exportUtils'
import { triggerDashboardRefresh } from '@/lib/dashboardRefresh'

interface Transaction {
  id: string; type: string; amount: number; description: string
  paymentMethod?: 'PIX' | 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD'
  isPaid?: boolean
  dueDate?: string
  installments?: number | null
  installmentNumber?: number | null
  groupId?: string | null
  date: string; category?: { name: string; color: string }
  account?: { name: string }; user?: { name: string }
  from?: { name: string }
  to?: { name: string }
}

const PAYMENT_METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CREDIT_CARD', label: 'Cartao de credito' },
  { value: 'DEBIT_CARD', label: 'Cartao de debito' },
] as const

const CREDIT_CARD_BRANDS = [
  'PAO DE ACUCAR',
  'AZUL',
  'SICREDI',
  'MERCADO PAGO',
  'BANCO DO BRASIL',
  'BRADESCO',
  'NUBANK',
  'ITAU',
  'BV',
  'DIGIO',
  'SANTANDER',
] as const

const CUSTOM_CARD_VALUE = '__CUSTOM__'

const PAYMENT_METHOD_META: Record<string, { label: string; icon: any; className: string }> = {
  PIX: { label: 'PIX', icon: QrCode, className: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
  CASH: { label: 'Dinheiro', icon: Wallet, className: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  CREDIT_CARD: { label: 'Cartao de credito', icon: CreditCard, className: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
  DEBIT_CARD: { label: 'Cartao de debito', icon: CreditCard, className: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
}

const getPaymentMethodMeta = (method?: string) => PAYMENT_METHOD_META[method || 'CASH'] || PAYMENT_METHOD_META.CASH

const BARCODE_SCAN_FORMATS = [
  BarcodeFormat.ITF,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
]

const QR_SCAN_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.PDF_417,
  BarcodeFormat.AZTEC,
  BarcodeFormat.DATA_MATRIX,
]

const CARD_TAG_REGEX = /\|\s*Cartao:\s*([^|]+)/i
const PERSON_TAG_REGEX = /\|\s*Pessoa:\s*(.+)$/i
const DOC_CODE_TAG_REGEX = /\|\s*DocCode:\s*([^|]+)/i
const PIX_COPY_TAG_REGEX = /\|\s*Pix:\s*([^|]+)/i

function extractCardBrandFromDescription(description: string) {
  const match = String(description || '').match(CARD_TAG_REGEX)
  return match?.[1]?.trim() || ''
}

function extractPersonFromDescription(description: string) {
  const match = String(description || '').match(PERSON_TAG_REGEX)
  return match?.[1]?.trim() || ''
}

function cleanDescription(description: string) {
  return String(description || '')
    .replace(CARD_TAG_REGEX, '')
    .replace(PERSON_TAG_REGEX, '')
    .replace(DOC_CODE_TAG_REGEX, '')
    .replace(PIX_COPY_TAG_REGEX, '')
    .trim()
}

function stripCardAndPersonTags(description: string) {
  return String(description || '')
    .replace(CARD_TAG_REGEX, '')
    .replace(PERSON_TAG_REGEX, '')
    .trim()
}

function extractDocumentCodeFromDescription(description: string) {
  const match = String(description || '').match(DOC_CODE_TAG_REGEX)
  return match?.[1]?.trim() || ''
}

function extractPixCopyFromDescription(description: string) {
  const match = String(description || '').match(PIX_COPY_TAG_REGEX)
  return match?.[1]?.trim() || ''
}

function formatIsoDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function modulo10(value: string) {
  let sum = 0
  let factor = 2
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const digit = Number(value[i])
    let partial = digit * factor
    if (partial > 9) partial = Math.floor(partial / 10) + (partial % 10)
    sum += partial
    factor = factor === 2 ? 1 : 2
  }
  const remainder = sum % 10
  return remainder === 0 ? 0 : 10 - remainder
}

function modulo11BankingDAC(value: string) {
  let sum = 0
  let factor = 2
  for (let i = value.length - 1; i >= 0; i -= 1) {
    sum += Number(value[i]) * factor
    factor = factor === 9 ? 2 : factor + 1
  }
  const remainder = sum % 11
  const dac = 11 - remainder
  if (dac === 0 || dac === 10 || dac === 11) return 1
  return dac
}

function modulo11Arrecadacao(value: string) {
  let sum = 0
  let factor = 2
  for (let i = value.length - 1; i >= 0; i -= 1) {
    sum += Number(value[i]) * factor
    factor = factor === 9 ? 2 : factor + 1
  }
  const remainder = sum % 11
  if (remainder === 0 || remainder === 1) return 0
  if (remainder === 10) return 1
  return 11 - remainder
}

function validateBoleto44(barcode: string) {
  if (!/^\d{44}$/.test(barcode)) return false

  if (barcode.startsWith('8')) {
    const ref = barcode[2]
    const raw = `${barcode.slice(0, 3)}${barcode.slice(4)}`
    const expected = ['6', '7'].includes(ref)
      ? modulo10(raw)
      : modulo11Arrecadacao(raw)
    return Number(barcode[3]) === expected
  }

  const raw = `${barcode.slice(0, 4)}${barcode.slice(5)}`
  const expected = modulo11BankingDAC(raw)
  return Number(barcode[4]) === expected
}

function convertLinhaDigitavel47ToBarcode(line: string) {
  return `${line.slice(0, 4)}${line.slice(32, 33)}${line.slice(33, 47)}${line.slice(4, 9)}${line.slice(10, 20)}${line.slice(21, 31)}`
}

function validateLinhaDigitavel47(line: string) {
  if (!/^\d{47}$/.test(line)) return false

  const field1 = line.slice(0, 9)
  const field2 = line.slice(10, 20)
  const field3 = line.slice(21, 31)

  const ok1 = modulo10(field1) === Number(line[9])
  const ok2 = modulo10(field2) === Number(line[20])
  const ok3 = modulo10(field3) === Number(line[31])
  if (!ok1 || !ok2 || !ok3) return false

  const barcode = convertLinhaDigitavel47ToBarcode(line)
  return validateBoleto44(barcode)
}

function convertLinhaDigitavel48ToBarcode(line: string) {
  return `${line.slice(0, 11)}${line.slice(12, 23)}${line.slice(24, 35)}${line.slice(36, 47)}`
}

function convertBarcode44ToLinhaDigitavel47(barcode: string) {
  if (!/^\d{44}$/.test(barcode) || barcode.startsWith('8')) return undefined

  const field1Data = `${barcode.slice(0, 4)}${barcode.slice(19, 24)}`
  const field2Data = barcode.slice(24, 34)
  const field3Data = barcode.slice(34, 44)
  const field4 = barcode.slice(4, 5)
  const field5 = barcode.slice(5, 19)

  const dv1 = String(modulo10(field1Data))
  const dv2 = String(modulo10(field2Data))
  const dv3 = String(modulo10(field3Data))

  return `${field1Data}${dv1}${field2Data}${dv2}${field3Data}${dv3}${field4}${field5}`
}

function validateLinhaDigitavel48(line: string) {
  if (!/^\d{48}$/.test(line) || !line.startsWith('8')) return false
  const ref = line[2]

  for (let i = 0; i < 4; i += 1) {
    const block = line.slice(i * 12, (i + 1) * 12)
    const data = block.slice(0, 11)
    const dac = Number(block[11])
    const expected = ['6', '7'].includes(ref)
      ? modulo10(data)
      : modulo11Arrecadacao(data)
    if (dac !== expected) return false
  }

  const barcode = convertLinhaDigitavel48ToBarcode(line)
  return validateBoleto44(barcode)
}

function parseDueDateFromFactor(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return undefined

  const legacyBase = new Date('1997-10-07T00:00:00.000Z')
  const legacyDue = new Date(legacyBase.getTime() + factor * 24 * 60 * 60 * 1000)
  const resetBase = new Date('2025-02-22T00:00:00.000Z')

  // Since 2025 the fator de vencimento restarted at 1000.
  if (factor >= 1000) {
    const modernDue = new Date(resetBase.getTime() + (factor - 1000) * 24 * 60 * 60 * 1000)
    if (legacyDue < resetBase) {
      return formatIsoDate(modernDue)
    }
  }

  return formatIsoDate(legacyDue)
}

function parsePaymentCode(rawCode: string): { amount?: number; dueDate?: string; normalizedCode?: string; lineCode?: string } {
  const digits = String(rawCode || '').replace(/\D/g, '')
  if (!digits) return {}

  let barcode = ''
  let amount: number | undefined
  let dueDate: string | undefined
  let lineCode: string | undefined

  if (digits.length === 44) {
    if (!validateBoleto44(digits)) return {}
    barcode = digits
    lineCode = convertBarcode44ToLinhaDigitavel47(digits)
  } else if (digits.length === 47) {
    if (!validateLinhaDigitavel47(digits)) return {}
    barcode = convertLinhaDigitavel47ToBarcode(digits)
    lineCode = digits
  } else if (digits.length === 48 && digits.startsWith('8')) {
    // Convenio/arrecadacao line digitavel: remove DV at the end of each 12-digit block.
    if (!validateLinhaDigitavel48(digits)) return {}
    barcode = convertLinhaDigitavel48ToBarcode(digits)
    lineCode = digits
  } else {
    return { normalizedCode: digits }
  }

  if (barcode.startsWith('8')) {
    const amountRef = barcode[2]
    const amountCentsRaw = Number(barcode.slice(4, 15))
    if (['6', '8'].includes(amountRef) && Number.isFinite(amountCentsRaw) && amountCentsRaw > 0) {
      amount = amountCentsRaw / 100
    }
  } else {
    const factor = Number(barcode.slice(5, 9))
    const amountCents = Number(barcode.slice(9, 19))
    dueDate = parseDueDateFromFactor(factor)
    amount = Number.isFinite(amountCents) && amountCents > 0 ? amountCents / 100 : undefined
  }

  return { amount, dueDate, normalizedCode: barcode, lineCode }
}

function getInvoiceMonthKey(tx: Transaction) {
  if (tx.paymentMethod !== 'CREDIT_CARD' || !tx.dueDate) return null
  const dueDate = new Date(tx.dueDate)
  return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`
}

function formatInvoiceMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export default function TransactionsPage() {
  const { tenant } = useAuth()
  const { addToast } = useToast()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('')
  const [businessStatusFilter, setBusinessStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{ type: string; amount: string; description: string; categoryId: string; paymentMethod: string; personName: string; installments: string; creditBillingOption: string; cardBrand: string; customCardBrand: string; businessDueDate: string; businessDocCode: string; businessPixCopy: string }>({
    type: 'EXPENSE',
    amount: '',
    description: '',
    categoryId: '',
    paymentMethod: 'CASH',
    personName: '',
    installments: '1',
    creditBillingOption: '1',
    cardBrand: CREDIT_CARD_BRANDS[0],
    customCardBrand: '',
    businessDueDate: '',
    businessDocCode: '',
    businessPixCopy: ''
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; txIds: string[] }>({ open: false, txIds: [] })
  const [deleting, setDeleting] = useState(false)
  const [paymentConfirm, setPaymentConfirm] = useState<{ open: boolean; tx: Transaction | null; nextPaid: boolean }>({ open: false, tx: null, nextPaid: false })
  const [updatingPayment, setUpdatingPayment] = useState(false)
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([])
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState<{ amount: string; cardBrand: string; customCardBrand: string; dueMonth: string }>({
    amount: '',
    cardBrand: CREDIT_CARD_BRANDS[0],
    customCardBrand: '',
    dueMonth: ''
  })
  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'
  const selectedFormPayment = getPaymentMethodMeta(form.paymentMethod)
  const isBusinessPlan = String(tenant?.plan || '').toUpperCase() === 'EMPRESA'
  const isBusinessExpense = isBusinessPlan
  const selectedFilterPayment = paymentMethodFilter ? getPaymentMethodMeta(paymentMethodFilter) : null
  const isCreditExpense = form.type === 'EXPENSE' && form.paymentMethod === 'CREDIT_CARD'
  const selectedCardBrand = form.cardBrand === CUSTOM_CARD_VALUE
    ? form.customCardBrand.trim().toUpperCase()
    : form.cardBrand
  const editSelectedCardBrand = editForm.cardBrand === CUSTOM_CARD_VALUE
    ? editForm.customCardBrand.trim().toUpperCase()
    : editForm.cardBrand
  const isEditingCreditExpense = editingTransaction?.type === 'EXPENSE' && editingTransaction?.paymentMethod === 'CREDIT_CARD'
  const editPreviewDescription = useMemo(() => {
    if (!editingTransaction) return ''
    const currentPerson = extractPersonFromDescription(editingTransaction.description)
    const baseDescription = stripCardAndPersonTags(editingTransaction.description)
    const personTag = currentPerson ? ` | Pessoa: ${currentPerson}` : ''

    if (isEditingCreditExpense) {
      const cardTag = editSelectedCardBrand ? ` | Cartao: ${editSelectedCardBrand}` : ''
      return `${baseDescription}${cardTag}${personTag}`
    }

    return `${baseDescription}${personTag}`
  }, [editingTransaction, editSelectedCardBrand, isEditingCreditExpense])
  const allVisibleSelected = transactions.length > 0 && transactions.every((tx) => selectedTransactionIds.includes(tx.id))
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerMode, setScannerMode] = useState<'qr' | 'barcode'>('barcode')
  const [scannerLoading, setScannerLoading] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('Posicione o QR Code ou codigo de barras dentro da camera.')
  const [scannerError, setScannerError] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null)
  const pendingScanRef = useRef<{ key: string; mode: 'qr' | 'barcode'; at: number } | null>(null)

  useEffect(() => {
    if (!isBusinessPlan) return
    setForm((prev) => ({
      ...prev,
      type: 'EXPENSE',
      paymentMethod: 'PIX',
    }))
    setTypeFilter('')
    setPaymentMethodFilter('')
  }, [isBusinessPlan])

  const getResponsibleName = (tx: Transaction) => tx.user?.name || tx.from?.name || tx.to?.name || extractPersonFromDescription(tx.description) || 'Sem responsavel'

  const getEffectiveDate = (tx: Transaction) => tx.type === 'EXPENSE' && tx.isPaid === false && tx.dueDate ? tx.dueDate : tx.date

  const groupedTransactions = useMemo(() => {
    const invoiceMap = new Map<string, { groupKey: string; monthKey: string; label: string; cardBrand: string; total: number; items: Transaction[] }>()
    const regularItems: Transaction[] = []

    transactions.forEach((tx) => {
      const invoiceMonthKey = getInvoiceMonthKey(tx)
      if (!invoiceMonthKey) {
        regularItems.push(tx)
        return
      }

      const cardBrand = extractCardBrandFromDescription(tx.description) || 'Sem cartao'
      const invoiceKey = `${invoiceMonthKey}__${cardBrand}`

      const existing = invoiceMap.get(invoiceKey)
      if (existing) {
        existing.items.push(tx)
        existing.total += Number(tx.amount || 0)
        return
      }

      invoiceMap.set(invoiceKey, {
        groupKey: invoiceKey,
        monthKey: invoiceMonthKey,
        label: formatInvoiceMonth(invoiceMonthKey),
        cardBrand,
        total: Number(tx.amount || 0),
        items: [tx],
      })
    })

    const invoiceGroups = Array.from(invoiceMap.values())
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => {
          const dateDiff = new Date(getEffectiveDate(a)).getTime() - new Date(getEffectiveDate(b)).getTime()
          if (dateDiff !== 0) return dateDiff
          return Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0)
        })
      }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

    const monthlyInvoiceSummary = invoiceGroups.reduce((acc, group) => {
      const existing = acc.get(group.monthKey) || {
        monthKey: group.monthKey,
        label: group.label,
        total: 0,
        pending: 0,
        count: 0,
      }

      existing.total += group.total
      existing.pending += group.items
        .filter((item) => item.isPaid === false)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0)
      existing.count += group.items.length
      acc.set(group.monthKey, existing)
      return acc
    }, new Map<string, { monthKey: string; label: string; total: number; pending: number; count: number }>())

    return {
      invoiceGroups,
      monthlyInvoiceSummary: Array.from(monthlyInvoiceSummary.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
      regularItems,
    }
  }, [transactions])

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev }
      groupedTransactions.invoiceGroups.forEach((group) => {
        if (!(group.groupKey in next)) next[group.groupKey] = false
      })
      if (groupedTransactions.regularItems.length > 0 && !('regular' in next)) next.regular = true
      return next
    })
  }, [groupedTransactions])

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  useEffect(() => {
    if (!scannerOpen) return

    let cancelled = false

    async function startScannerAfterMount() {
      setScannerLoading(true)
      setScannerError('')
      setScannerMessage(scannerMode === 'qr'
        ? 'Posicione o QR Code do Pix dentro da camera.'
        : 'Posicione o codigo de barras do boleto dentro da camera.')

      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Este dispositivo nao suporta acesso a camera.')
        }

        // Wait for the camera modal/video element to be mounted before binding ZXing.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

        if (cancelled) return

        const videoElement = videoRef.current
        if (!videoElement) {
          throw new Error('Nao foi possivel inicializar a camera.')
        }

        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, scannerMode === 'qr' ? QR_SCAN_FORMATS : BARCODE_SCAN_FORMATS)
        hints.set(DecodeHintType.TRY_HARDER, true)

        const reader = new BrowserMultiFormatReader(hints)
        scannerControlsRef.current = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              advanced: [{ focusMode: 'continuous' } as any]
            }
          },
          videoElement,
          (result, error) => {
            if (result) {
              const rawValue = String(result.getText()).trim()
              if (rawValue) {
                const scanKey = rawValue.replace(/\s+/g, '')
                const now = Date.now()
                const pending = pendingScanRef.current

                if (pending && pending.key === scanKey && pending.mode === scannerMode && (now - pending.at) < 1800) {
                  applyScannedCode(rawValue, scannerMode)
                  setScannerOpen(false)
                  stopScanner()
                  return
                }

                pendingScanRef.current = { key: scanKey, mode: scannerMode, at: now }
                setScannerMessage('Leitura detectada. Mantenha o codigo parado por 1 segundo para confirmar.')
              }
            }

            if (error && String(error?.name || '') !== 'NotFoundException') {
              setScannerError('Nao foi possivel ler a camera. Tente aproximar o codigo ou usar colar manualmente.')
            }
          }
        )

        if (!cancelled) setScannerLoading(false)
      } catch (err: any) {
        if (!cancelled) {
          setScannerLoading(false)
          setScannerError(err?.message || 'Nao foi possivel abrir a camera.')
          stopScanner()
        }
      }
    }

    startScannerAfterMount()

    return () => {
      cancelled = true
    }
  }, [scannerOpen, scannerMode])

  function stopScanner() {
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
    }
    if (scannerControlsRef.current) {
      try {
        scannerControlsRef.current.stop()
      } catch {
        // Ignore stop errors from partially initialized streams.
      }
      scannerControlsRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    pendingScanRef.current = null
  }

  function isLikelyPixPayload(value: string) {
    const normalized = String(value || '').trim().toUpperCase()
    return normalized.startsWith('000201') || normalized.includes('BR.GOV.BCB.PIX')
  }

  function applyScannedCode(rawValue: string, mode: 'qr' | 'barcode' = 'barcode') {
    const scanned = String(rawValue || '').trim()
    const digits = scanned.replace(/\D/g, '')
    const isBarcode = digits.length === 44 || digits.length === 47 || (digits.length === 48 && digits.startsWith('8'))

    if (mode === 'qr' && !isLikelyPixPayload(scanned)) {
      addToast('Esse conteudo nao parece um QR Pix. Tente o modo Código de Barras.', 'warning')
      return
    }

    if (mode === 'barcode' && isLikelyPixPayload(scanned)) {
      addToast('Esse conteudo parece QR Pix. Use o botão Ler QR Code.', 'warning')
      return
    }

    if (isBarcode) {
      const parsed = parsePaymentCode(digits)
      if (!parsed.normalizedCode) {
        addToast('Codigo de barras invalido. Tente enquadrar novamente.', 'warning')
        return
      }
      setForm((prev) => ({
        ...prev,
        businessDocCode: parsed.lineCode || parsed.normalizedCode || digits,
        amount: parsed.amount ? String(parsed.amount.toFixed(2)) : prev.amount,
        businessDueDate: parsed.dueDate || prev.businessDueDate,
      }))
      addToast('Codigo de barras lido com sucesso.', 'success')
      return
    }

    if (isLikelyPixPayload(scanned)) {
      setForm((prev) => ({
        ...prev,
        businessPixCopy: scanned,
        paymentMethod: 'PIX'
      }))
      addToast('QR/Pix lido com sucesso.', 'success')
      return
    }

    if (mode === 'barcode') {
      addToast('Leitura detectada, mas nao parece um boleto valido. Tente aproximar e enquadrar apenas a linha de barras.', 'warning')
      return
    }

    addToast('Leitura detectada, mas nao parece um QR Pix valido.', 'warning')
  }

  async function openCameraScanner(mode: 'qr' | 'barcode') {
    setScannerMode(mode)
    setScannerOpen(true)
  }

  function closeCameraScanner() {
    setScannerOpen(false)
    stopScanner()
  }

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (isBusinessPlan) {
      params.set('type', 'EXPENSE')
    } else {
      if (typeFilter) params.set('type', typeFilter)
      if (paymentMethodFilter) params.set('paymentMethod', paymentMethodFilter)
    }
    if (isBusinessPlan && businessStatusFilter) params.set('status', businessStatusFilter)
    const [t, c, a] = await Promise.all([
      api.get(`/dashboard/transactions?${params}`),
      api.get('/dashboard/categories?catalog=1'),
      api.get('/dashboard/accounts'),
    ])
    const nextTransactions = t.data.transactions
    setTransactions(nextTransactions)
    setSelectedTransactionIds((prev) => prev.filter((id) => nextTransactions.some((tx: Transaction) => tx.id === id)))
    setCategories(c.data)
    setAccounts(a.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [search, typeFilter, paymentMethodFilter, businessStatusFilter, isBusinessPlan])

  const businessExpenseSummary = useMemo(() => {
    const expenses = transactions.filter((tx) => tx.type === 'EXPENSE')
    const now = new Date()
    const pending = expenses.filter((tx) => tx.isPaid === false)
    const overdue = pending.filter((tx) => tx.dueDate && new Date(tx.dueDate) < now)
    const paid = expenses.filter((tx) => tx.isPaid === true)

    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
    }
  }, [transactions])

  function handleParseBusinessCode() {
    const parsed = parsePaymentCode(form.businessDocCode || form.businessPixCopy)

    setForm((prev) => ({
      ...prev,
      amount: parsed.amount ? String(parsed.amount.toFixed(2)) : prev.amount,
      businessDueDate: parsed.dueDate || prev.businessDueDate,
      businessDocCode: parsed.lineCode || parsed.normalizedCode || prev.businessDocCode,
      paymentMethod: prev.paymentMethod || 'PIX',
    }))

    if (parsed.amount || parsed.dueDate) {
      addToast('Dados identificados e preenchidos automaticamente quando disponiveis.', 'success')
    } else {
      addToast('Nao foi possivel identificar valor/vencimento automaticamente. Complete manualmente.', 'warning')
    }
  }

  async function handleTogglePaid(tx: Transaction) {
    try {
      setUpdatingPayment(true)
      await api.patch(`/dashboard/transactions/${tx.id}`, {
        isPaid: !Boolean(tx.isPaid)
      })
      addToast(tx.isPaid ? 'Despesa marcada como pendente.' : 'Despesa marcada como paga.', 'success')
      setPaymentConfirm({ open: false, tx: null, nextPaid: false })
      load()
      triggerDashboardRefresh()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao atualizar status do pagamento.', 'error')
    } finally {
      setUpdatingPayment(false)
    }
  }

  function requestTogglePaid(tx: Transaction) {
    setPaymentConfirm({ open: true, tx, nextPaid: !Boolean(tx.isPaid) })
  }

  async function handlePaymentConfirm() {
    if (!paymentConfirm.tx) return
    await handleTogglePaid(paymentConfirm.tx)
  }

  async function copyText(value: string, successMessage: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      addToast(successMessage, 'success')
    } catch {
      addToast('Nao foi possivel copiar automaticamente neste navegador.', 'warning')
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    
    // Validar
    const errors: Record<string, string> = {}
    const amountValidation = validateAmount(form.amount)
    const descriptionValidation = validateDescription(form.description)
    
    if (!amountValidation.valid) errors.amount = amountValidation.error || ''
    if (!descriptionValidation.valid) errors.description = descriptionValidation.error || ''
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    
    setFormErrors({})
    setSaving(true)
    try {
      if (isCreditExpense && !selectedCardBrand) {
        addToast('Informe o nome do banco/cartao para lancamento no credito.', 'error')
        setSaving(false)
        return
      }

      const installments = isBusinessPlan ? 1 : (isCreditExpense ? Math.min(Math.max(parseInt(form.creditBillingOption) || 1, 1), 12) : 1)
      const baseAmount = Number(form.amount)
      const cardTag = isCreditExpense ? ` | Cartao: ${selectedCardBrand}` : ''
      const personTag = form.personName.trim() ? ` | Pessoa: ${form.personName.trim()}` : ''
      const documentCode = isBusinessExpense ? form.businessDocCode.trim() : ''
      const pixCopyPaste = isBusinessExpense ? form.businessPixCopy.trim() : ''
      const docTag = documentCode ? ` | DocCode: ${documentCode}` : ''
      const pixTag = pixCopyPaste ? ` | Pix: ${pixCopyPaste}` : ''
      const baseDescription = `${form.description}${cardTag}${personTag}${docTag}${pixTag}`
      const currentBillDate = !isBusinessPlan && isCreditExpense && form.creditBillingOption === 'CURRENT_BILL' ? new Date() : undefined
      const enterpriseDueDate = isBusinessExpense && form.businessDueDate
        ? new Date(`${form.businessDueDate}T00:00:00.000Z`)
        : undefined
      const shouldStartAsPending = isBusinessExpense
      const nextType = isBusinessPlan ? 'EXPENSE' : form.type
      const nextPaymentMethod = isBusinessPlan ? 'PIX' : form.paymentMethod

      await api.post('/dashboard/transactions', {
        type: nextType,
        amount: baseAmount,
        description: baseDescription,
        categoryId: form.categoryId || undefined,
        paymentMethod: nextPaymentMethod,
        accountId: isBusinessPlan ? undefined : (isCreditExpense ? undefined : (accounts[0]?.id || undefined)),
        personName: form.personName.trim() || undefined,
        installments,
        isPaid: shouldStartAsPending ? false : (isCreditExpense ? false : true),
        dueDate: enterpriseDueDate ? enterpriseDueDate.toISOString() : (currentBillDate ? currentBillDate.toISOString() : undefined),
        date: currentBillDate ? currentBillDate.toISOString() : undefined,
      })

      addToast(`${form.type === 'EXPENSE' ? 'Despesa' : 'Entrada'} registrada com sucesso!`, 'success')
      setShowForm(false)
      setForm({ type: 'EXPENSE', amount: '', description: '', categoryId: '', paymentMethod: 'CASH', personName: '', installments: '1', creditBillingOption: '1', cardBrand: CREDIT_CARD_BRANDS[0], customCardBrand: '', businessDueDate: '', businessDocCode: '', businessPixCopy: '' })
      load()
      triggerDashboardRefresh()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar lançamento.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConfirm() {
    if (deleteConfirm.txIds.length === 0) return
    
    setDeleting(true)
    try {
      if (deleteConfirm.txIds.length === 1) {
        await api.delete(`/dashboard/transactions/${deleteConfirm.txIds[0]}`)
      } else {
        await api.post('/dashboard/transactions/bulk-delete', { ids: deleteConfirm.txIds })
      }
      addToast(deleteConfirm.txIds.length === 1 ? 'Lançamento removido com sucesso.' : 'Lançamentos removidos com sucesso.', 'success')
      setDeleteConfirm({ open: false, txIds: [] })
      setSelectedTransactionIds([])
      load()
      triggerDashboardRefresh()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao remover lançamento.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  function toggleTransactionSelection(txId: string) {
    setSelectedTransactionIds((prev) => prev.includes(txId) ? prev.filter((id) => id !== txId) : [...prev, txId])
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedTransactionIds([])
      return
    }
    setSelectedTransactionIds(transactions.map((tx) => tx.id))
  }

  function toggleGroup(groupKey: string) {
    setOpenGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }

  function openEditTransaction(tx: Transaction) {
    const currentCardBrand = extractCardBrandFromDescription(tx.description)
    const isKnownBrand = CREDIT_CARD_BRANDS.includes(currentCardBrand as typeof CREDIT_CARD_BRANDS[number])
    const currentDueDate = new Date(getEffectiveDate(tx))

    setEditingTransaction(tx)
    setEditForm({
      amount: String(Number(tx.amount || 0).toFixed(2)),
      cardBrand: isKnownBrand ? currentCardBrand : CUSTOM_CARD_VALUE,
      customCardBrand: isKnownBrand ? '' : currentCardBrand,
      dueMonth: tx.type === 'EXPENSE' && tx.paymentMethod === 'CREDIT_CARD'
        ? `${currentDueDate.getFullYear()}-${String(currentDueDate.getMonth() + 1).padStart(2, '0')}`
        : ''
    })
  }

  async function handleSaveEditTransaction(e: React.FormEvent) {
    e.preventDefault()

    if (!editingTransaction) return

    const nextAmount = Number(String(editForm.amount || '').replace(',', '.'))
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      addToast('Informe um valor valido.', 'error')
      return
    }

    const isCreditExpenseEdit = editingTransaction.type === 'EXPENSE' && editingTransaction.paymentMethod === 'CREDIT_CARD'
    const nextCardBrand = editSelectedCardBrand

    if (isCreditExpenseEdit && !nextCardBrand) {
      addToast('Informe o nome do banco/cartao.', 'error')
      return
    }

    try {
      const currentPerson = extractPersonFromDescription(editingTransaction.description)
      const baseDescription = stripCardAndPersonTags(editingTransaction.description)
      const personTag = currentPerson ? ` | Pessoa: ${currentPerson}` : ''
      const nextDescription = isCreditExpenseEdit
        ? `${baseDescription} | Cartao: ${nextCardBrand}${personTag}`
        : `${baseDescription}${personTag}`

      await api.patch(`/dashboard/transactions/${editingTransaction.id}`, {
        amount: nextAmount,
        description: nextDescription,
        dueDate: isCreditExpenseEdit && editForm.dueMonth ? new Date(`${editForm.dueMonth}-01T00:00:00.000Z`).toISOString() : undefined,
      })

      addToast('Lançamento atualizado com sucesso.', 'success')
      setEditingTransaction(null)
      setEditForm({ amount: '', cardBrand: CREDIT_CARD_BRANDS[0], customCardBrand: '', dueMonth: '' })
      load()
      triggerDashboardRefresh()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao atualizar lançamento.', 'error')
    }
  }

  function renderTransactionItem(tx: Transaction) {
    const isSelected = selectedTransactionIds.includes(tx.id)
    const isBusinessExpenseItem = isBusinessPlan && tx.type === 'EXPENSE'
    const isOverdue = isBusinessExpenseItem && tx.isPaid === false && tx.dueDate ? new Date(tx.dueDate) < new Date() : false
    const paymentStatusLabel = tx.isPaid ? 'Pago' : (isOverdue ? 'Vencido' : 'Pendente')
    const paymentStatusClass = tx.isPaid
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : isOverdue
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    const documentCode = extractDocumentCodeFromDescription(tx.description)
    const pixCopy = extractPixCopyFromDescription(tx.description)

    return (
      <div key={tx.id} className="rounded-xl border border-cyan-500/10 bg-slate-950/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleTransactionSelection(tx.id)}
              className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-400"
            />
            <div>
              <p className="text-white font-medium">{cleanDescription(tx.description)}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                <span>{formatDate(getEffectiveDate(tx))}</span>
                <span>{getResponsibleName(tx)}</span>
                {tx.installments && tx.installments > 1 && (
                  <span>{tx.installmentNumber || 1}/{tx.installments}</span>
                )}
                {tx.type === 'EXPENSE' && tx.isPaid === false && tx.dueDate && (
                  <span className="text-amber-300">Vence em {formatDate(tx.dueDate)}</span>
                )}
              </div>
              {isBusinessExpenseItem && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${paymentStatusClass}`}>{paymentStatusLabel}</span>
                  {documentCode && (
                    <button
                      type="button"
                      onClick={() => copyText(documentCode, 'Codigo de barras copiado.')}
                      className="rounded-full border border-slate-600 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300 hover:border-cyan-400 hover:text-cyan-200"
                    >
                      Copiar codigo
                    </button>
                  )}
                  {pixCopy && (
                    <button
                      type="button"
                      onClick={() => copyText(pixCopy, 'Pix copia e cola copiado.')}
                      className="rounded-full border border-slate-600 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300 hover:border-cyan-400 hover:text-cyan-200"
                    >
                      Copiar Pix
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className={`font-semibold ${tx.type === 'INCOME' ? 'text-green-400' : 'text-red-400'}`}>
              {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
            </p>
            <div className="mt-2 flex items-center justify-end gap-2">
              <PaymentMethodChip meta={getPaymentMethodMeta(tx.paymentMethod)} />
              <button onClick={() => openEditTransaction(tx)} className="text-slate-500 hover:text-cyan-300 transition-colors">
                <PencilLine size={16} />
              </button>
              {isBusinessExpenseItem && (
                <button
                  type="button"
                  onClick={() => requestTogglePaid(tx)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${tx.isPaid ? 'border-amber-500/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'}`}
                >
                  {tx.isPaid ? 'Marcar pendente' : 'Marcar pago'}
                </button>
              )}
              <button onClick={() => setDeleteConfirm({ open: true, txIds: [tx.id] })} className="text-slate-500 hover:text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3">
          {tx.category ? (
            <span className="px-2 py-1 rounded-full text-xs text-white" style={{ backgroundColor: tx.category.color + '40', color: tx.category.color }}>
              {tx.category.name}
            </span>
          ) : (
            <span className="text-xs text-slate-600">Sem categoria</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">{isBusinessPlan ? 'Contas a Pagar' : 'Lançamentos'}</h1>
          <p className="text-slate-400 text-sm mt-1">{transactions.length} {isBusinessPlan ? 'conta(s) encontrada(s)' : 'transações encontradas'}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {transactions.length > 0 && (
            <>
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              >
                {allVisibleSelected ? 'Limpar selecao' : 'Selecionar todos'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm({ open: true, txIds: selectedTransactionIds })}
                disabled={selectedTransactionIds.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
              >
                <Trash2 size={16} /> Excluir selecionados
              </button>
            </>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={18} /> {isBusinessPlan ? 'Adicionar boleto' : 'Novo Lançamento'}
          </button>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <form onSubmit={handleAdd} className={`p-6 grid grid-cols-2 md:grid-cols-6 gap-4 ${panelClass}`}>
          {isBusinessPlan ? (
            <div className="col-span-2 md:col-span-6 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
              Lançamento empresarial fixo em boleto/Pix. Use este formulário apenas para contas a pagar.
            </div>
          ) : (
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
                <option value="EXPENSE">Saída</option>
                <option value="INCOME">Entrada</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Valor (R$)</label>
            <input type="number" step="0.01" required value={form.amount} onChange={e => {
              setForm(p => ({ ...p, amount: e.target.value }))
              if (e.target.value) {
                const validation = validateAmount(e.target.value)
                if (!validation.valid) {
                  setFormErrors(p => ({ ...p, amount: validation.error || '' }))
                } else {
                  setFormErrors(p => ({ ...p, amount: '' }))
                }
              }
            }}
              className={`w-full bg-slate-950 border ${formErrors.amount ? 'border-rose-500' : 'border-cyan-500/20'} text-white rounded-lg px-3 py-2`} placeholder="0,00" />
            {formErrors.amount && <p className="text-rose-400 text-xs mt-1">{formErrors.amount}</p>}
          </div>
          <div className="col-span-2">
            <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Descrição</label>
            <input type="text" required value={form.description} onChange={e => {
              setForm(p => ({ ...p, description: e.target.value }))
              if (e.target.value) {
                const validation = validateDescription(e.target.value)
                if (!validation.valid) {
                  setFormErrors(p => ({ ...p, description: validation.error || '' }))
                } else {
                  setFormErrors(p => ({ ...p, description: '' }))
                }
              }
            }}
              className={`w-full bg-slate-950 border ${formErrors.description ? 'border-rose-500' : 'border-cyan-500/20'} text-white rounded-lg px-3 py-2`} placeholder={isBusinessPlan ? 'Ex: Fornecedor A' : 'Ex: Gasolina'} />
            {formErrors.description && <p className="text-rose-400 text-xs mt-1">{formErrors.description}</p>}
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Pessoa</label>
            <input type="text" value={form.personName} onChange={e => setForm(p => ({ ...p, personName: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2" placeholder="Ex: Maria" />
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Categoria</label>
            <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
              <option value="">Sem categoria</option>
              {categories.filter(c => c.type === (isBusinessPlan ? 'EXPENSE' : form.type)).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {isBusinessPlan ? (
            <>
              <div className="col-span-2 md:col-span-3">
                <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Codigo de barras / linha digitavel</label>
                <input
                  type="text"
                  value={form.businessDocCode}
                  onChange={e => setForm(p => ({ ...p, businessDocCode: e.target.value }))}
                  className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2"
                  placeholder="Cole o codigo do boleto"
                />
              </div>
              <div className="col-span-2 md:col-span-3">
                <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Pix copia e cola / payload QR</label>
                <input
                  type="text"
                  value={form.businessPixCopy}
                  onChange={e => setForm(p => ({ ...p, businessPixCopy: e.target.value }))}
                  className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2"
                  placeholder="Cole o Pix copia e cola"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Vencimento</label>
                <input
                  type="date"
                  value={form.businessDueDate}
                  onChange={e => setForm(p => ({ ...p, businessDueDate: e.target.value }))}
                  className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleParseBusinessCode}
                  className="w-full rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20"
                >
                  Ler codigo/QR e preencher
                </button>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => openCameraScanner('qr')}
                  className="w-full rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20"
                >
                  Ler QR Code
                </button>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => openCameraScanner('barcode')}
                  className="w-full rounded-lg border border-indigo-500/35 bg-indigo-500/10 px-3 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/20"
                >
                  Ler Codigo de Barras
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Forma de pagamento</label>
                <select value={form.paymentMethod} onChange={e => setForm(p => ({ ...p, paymentMethod: e.target.value }))}
                  className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>{method.label}</option>
                  ))}
                </select>
                <div className="mt-2">
                  <PaymentMethodChip meta={selectedFormPayment} />
                </div>
              </div>
              {isCreditExpense && (
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Cartao</label>
                  <select value={form.cardBrand} onChange={e => setForm(p => ({ ...p, cardBrand: e.target.value }))}
                    className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
                    {CREDIT_CARD_BRANDS.map((card) => (
                      <option key={card} value={card}>{card}</option>
                    ))}
                    <option value={CUSTOM_CARD_VALUE}>Outro (cadastrar banco/cartao)</option>
                  </select>
                </div>
              )}
              {isCreditExpense && form.cardBrand === CUSTOM_CARD_VALUE && (
                <div className="col-span-2 md:col-span-3">
                  <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Nome do banco/cartão</label>
                  <input
                    type="text"
                    value={form.customCardBrand}
                    onChange={e => setForm(p => ({ ...p, customCardBrand: e.target.value }))}
                    className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2"
                    placeholder="Ex: XP, C6, Inter..."
                  />
                </div>
              )}
              {isCreditExpense && (
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-[0.16em] block mb-1">Fatura do cartao</label>
                  <select value={form.creditBillingOption} onChange={e => setForm(p => ({ ...p, creditBillingOption: e.target.value }))}
                    className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
                    <option value="CURRENT_BILL">Fatura atual</option>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                      <option key={value} value={String(value)}>{value}x</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <div className="col-span-2 md:col-span-6 flex items-center justify-between gap-3 pt-2">
            {isBusinessPlan ? (
              <p className="text-xs text-slate-400">Lançamento empresarial criado como boleto/Pix e fica pendente até ser marcado como pago.</p>
            ) : (
              <p className="text-xs text-slate-400">Use cartões de crédito apenas para parcelamentos. O restante segue o fluxo padrão.</p>
            )}
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className="bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
              {saving && <Loader size={16} className="animate-spin" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setFormErrors({}) }} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors">Cancelar</button>
          </div>
        </form>
      )}

      {scannerOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-cyan-500/25 bg-slate-900 p-5 shadow-[0_20px_60px_rgba(2,8,23,0.65)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">Leitura por camera</p>
                <h3 className="text-lg font-bold text-white">
                  {scannerMode === 'qr' ? 'Escanear QR Code Pix' : 'Escanear codigo de barras do boleto'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeCameraScanner}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-black/60 p-2">
              <video ref={videoRef} className="h-72 w-full rounded-xl bg-black object-contain" muted playsInline autoPlay />
            </div>

            <p className="mt-3 text-sm text-slate-300">{scannerMessage}</p>
            {scannerLoading && <p className="mt-1 text-xs text-cyan-300">Inicializando camera...</p>}
            {scannerError && <p className="mt-1 text-xs text-rose-300">{scannerError}</p>}
          </div>
        </div>
      )}

      {isBusinessPlan && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">A pagar</p>
            <p className="mt-1 text-xl font-black text-amber-100">{businessExpenseSummary.pendingCount}</p>
            <p className="text-xs text-amber-200/80">{formatCurrency(businessExpenseSummary.pendingAmount)}</p>
          </div>
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-rose-200/80">Vencidas</p>
            <p className="mt-1 text-xl font-black text-rose-100">{businessExpenseSummary.overdueCount}</p>
            <p className="text-xs text-rose-200/80">{formatCurrency(businessExpenseSummary.overdueAmount)}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">Pagas</p>
            <p className="mt-1 text-xl font-black text-emerald-100">{businessExpenseSummary.paidCount}</p>
            <p className="text-xs text-emerald-200/80">{formatCurrency(businessExpenseSummary.paidAmount)}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className={`flex flex-wrap gap-3 p-4 ${panelClass}`}>
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-cyan-400"
            placeholder="Buscar lançamento..." />
        </div>
        {isBusinessPlan ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBusinessStatusFilter('')}
              className={`rounded-lg border px-3 py-2 text-sm ${businessStatusFilter === '' ? 'border-cyan-400 bg-cyan-400/20 text-cyan-100' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-500/40'}`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setBusinessStatusFilter('PENDING')}
              className={`rounded-lg border px-3 py-2 text-sm ${businessStatusFilter === 'PENDING' ? 'border-amber-400 bg-amber-400/20 text-amber-100' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-amber-500/40'}`}
            >
              A vencer
            </button>
            <button
              type="button"
              onClick={() => setBusinessStatusFilter('OVERDUE')}
              className={`rounded-lg border px-3 py-2 text-sm ${businessStatusFilter === 'OVERDUE' ? 'border-rose-400 bg-rose-400/20 text-rose-100' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-rose-500/40'}`}
            >
              Vencidas
            </button>
            <button
              type="button"
              onClick={() => setBusinessStatusFilter('PAID')}
              className={`rounded-lg border px-3 py-2 text-sm ${businessStatusFilter === 'PAID' ? 'border-emerald-400 bg-emerald-400/20 text-emerald-100' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-emerald-500/40'}`}
            >
              Pagas
            </button>
          </div>
        ) : (
          <>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Todos</option>
              <option value="INCOME">Entradas</option>
              <option value="EXPENSE">Saídas</option>
            </select>
            <select value={paymentMethodFilter} onChange={e => setPaymentMethodFilter(e.target.value)}
              className="bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Todas as formas</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
            {selectedFilterPayment && <PaymentMethodChip meta={selectedFilterPayment} />}
          </>
        )}
        <ExportData
          data={transactions}
          columns={[
            { key: 'description', label: 'Descrição' },
            { key: 'type', label: 'Tipo' },
            { key: 'amount', label: 'Valor' },
            { key: 'date', label: 'Data' },
            { key: 'paymentMethod', label: 'Pagamento' },
          ]}
          filename="lançamentos"
        />
      </div>

      {/* Lancamentos agrupados */}
      <div className={`${panelClass} overflow-hidden`}>
        {loading ? (
          <div className="p-6">
            <LoadingSkeleton />
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            title="Nenhum lançamento encontrado"
            description={search || typeFilter || paymentMethodFilter || businessStatusFilter
              ? "Tente ajustar os filtros para encontrar o que você procura"
              : (isBusinessPlan ? "Comece adicionando seus boletos e contas a pagar" : "Comece adicionando suas primeiras entradas e saídas")}
            action={{
              label: isBusinessPlan ? 'Adicionar boleto' : 'Novo Lançamento',
              onClick: () => setShowForm(true),
            }}
          />
        ) : (
          <div className="space-y-4 p-4 md:p-6">
            <div className="flex items-center gap-3 rounded-xl border border-cyan-500/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-400"
              />
              <span>Selecionar todos os lançamentos visíveis</span>
            </div>

            {!isBusinessPlan && groupedTransactions.monthlyInvoiceSummary.length > 0 && (
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-violet-200/80 mb-3">Resumo geral das faturas</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {groupedTransactions.monthlyInvoiceSummary.map((summary) => (
                    <div key={summary.monthKey} className="rounded-xl border border-violet-500/20 bg-slate-950/60 p-3">
                      <p className="text-sm font-semibold text-white">{summary.label}</p>
                      <p className="text-xs text-slate-400 mt-1">{summary.count} lançamento(s) no cartão</p>
                      <p className="text-sm text-violet-100 mt-1">Total geral: {formatCurrency(summary.total)}</p>
                      <p className="text-xs text-amber-200 mt-1">Pendente geral: {formatCurrency(summary.pending)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isBusinessPlan && groupedTransactions.invoiceGroups.map((group) => {
              const isOpen = openGroups[group.groupKey] ?? false
              return (
                <div key={group.groupKey} className="rounded-2xl border border-violet-500/20 bg-violet-500/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.groupKey)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown size={18} className="text-violet-200" /> : <ChevronRight size={18} className="text-violet-200" />}
                      <div>
                        <p className="text-sm font-semibold text-white">Fatura de {group.label}</p>
                        <p className="text-xs text-violet-100/75">{group.cardBrand} • {group.items.length} lançamento(s)</p>
                      </div>
                    </div>
                    <p className="text-lg font-black text-violet-100">{formatCurrency(group.total)}</p>
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t border-violet-500/15 bg-slate-950/35 p-4">
                      {group.items.map(renderTransactionItem)}
                    </div>
                  )}
                </div>
              )
            })}

            {isBusinessPlan ? (
              <div className="space-y-3">
                {transactions.map(renderTransactionItem)}
              </div>
            ) : groupedTransactions.regularItems.length > 0 && (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup('regular')}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    {(openGroups.regular ?? true) ? <ChevronDown size={18} className="text-cyan-200" /> : <ChevronRight size={18} className="text-cyan-200" />}
                    <div>
                      <p className="text-sm font-semibold text-white">Outros lançamentos</p>
                      <p className="text-xs text-cyan-100/75">Entradas, saídas e itens fora de fatura</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-cyan-100">{groupedTransactions.regularItems.length} item(ns)</p>
                </button>

                {(openGroups.regular ?? true) && (
                  <div className="space-y-3 border-t border-cyan-500/15 bg-slate-950/35 p-4">
                    {groupedTransactions.regularItems.map(renderTransactionItem)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de confirmação de delete */}
      <ConfirmModal
        isOpen={paymentConfirm.open}
        title={paymentConfirm.nextPaid ? 'Marcar como Pago' : 'Marcar como Pendente'}
        message={paymentConfirm.tx
          ? `${paymentConfirm.nextPaid ? 'Deseja marcar como pago' : 'Deseja marcar como pendente'} o lançamento "${cleanDescription(paymentConfirm.tx.description)}"?`
          : 'Deseja confirmar esta alteração?'}
        confirmText="Sim"
        cancelText="Não"
        isLoading={updatingPayment}
        onConfirm={handlePaymentConfirm}
        onCancel={() => setPaymentConfirm({ open: false, tx: null, nextPaid: false })}
      />

      <ConfirmModal
        isOpen={deleteConfirm.open}
        title={deleteConfirm.txIds.length > 1 ? 'Remover Lancamentos' : 'Remover Lancamento'}
        message={deleteConfirm.txIds.length > 1 ? `Tem certeza que deseja remover ${deleteConfirm.txIds.length} lancamentos? Esta acao nao pode ser desfeita.` : 'Tem certeza que deseja remover este lancamento? Esta acao nao pode ser desfeita.'}
        confirmText="Sim"
        cancelText="Não"
        isDestructive
        isLoading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ open: false, txIds: [] })}
      />

      {editingTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-cyan-500/20 bg-slate-900 p-6 shadow-[0_18px_60px_rgba(2,8,23,0.6)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-white">Editar lançamento</h3>
                <p className="text-sm text-slate-400">Ajuste valor, cartão/banco e mês da fatura quando for lançamento no crédito.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTransaction(null)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveEditTransaction} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Valor</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  placeholder="0,00"
                />
              </div>

              {editingTransaction.type === 'EXPENSE' && editingTransaction.paymentMethod === 'CREDIT_CARD' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Mês da fatura</label>
                    <input
                      type="month"
                      value={editForm.dueMonth}
                      onChange={(e) => setEditForm((p) => ({ ...p, dueMonth: e.target.value }))}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Cartão</label>
                    <select
                      value={editForm.cardBrand}
                      onChange={(e) => setEditForm((p) => ({ ...p, cardBrand: e.target.value }))}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    >
                      {CREDIT_CARD_BRANDS.map((card) => (
                        <option key={card} value={card}>{card}</option>
                      ))}
                      <option value={CUSTOM_CARD_VALUE}>Outro (cadastrar banco/cartão)</option>
                    </select>
                  </div>

                  {editForm.cardBrand === CUSTOM_CARD_VALUE && (
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Nome do banco/cartão</label>
                      <input
                        type="text"
                        value={editForm.customCardBrand}
                        onChange={(e) => setEditForm((p) => ({ ...p, customCardBrand: e.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                        placeholder="Ex: XP, C6, Inter..."
                      />
                    </div>
                  )}
                </>
              )}

              <div className="md:col-span-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Pré-visualização da descrição</p>
                <p className="mt-1 text-sm text-cyan-100 break-words">{editPreviewDescription || 'Sem descrição'}</p>
              </div>

              <div className="md:col-span-2 flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300"
                >
                  Salvar alterações
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTransaction(null)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function PaymentMethodChip({ meta }: { meta: { label: string; icon: any; className: string } }) {
  const PaymentIcon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs ${meta.className}`}>
      <PaymentIcon size={12} />
      {meta.label}
    </span>
  )
}
