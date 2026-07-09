'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import api from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

type Plan = {
  id: string
  code: string
  name: string
  priceCents: number
  features?: string | null
  userLimit?: number | null
  messageLimit?: number | null
}

export default function SubscribePage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    planCode: 'FAMILIA',
    couponCode: ''
  })

  const [checkout, setCheckout] = useState<any>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/billing/plans')
        setPlans(data)
        if (Array.isArray(data) && data[0]) {
          setForm((f) => ({ ...f, planCode: data[0].code }))
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'Falha ao carregar planos.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const selectedPlan = useMemo(
    () => plans.find((p) => p.code === form.planCode),
    [plans, form.planCode]
  )

  async function createCheckout(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Senha deve ter no minimo 8 caracteres.')
      return
    }

    setCreating(true)
    try {
      const { data } = await api.post('/billing/checkout', form)
      if (data.status === 'PAID' && data.token && data.tenant) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('tenant', JSON.stringify(data.tenant))
        router.push('/dashboard')
        return
      }
      setCheckout(data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Falha ao criar checkout.')
    } finally {
      setCreating(false)
    }
  }

  async function refreshCheckoutStatus() {
    if (!checkout?.checkoutId) return
    try {
      const { data } = await api.get(`/billing/checkout/${checkout.checkoutId}/status`)
      if (data.status === 'PAID' && data.token && data.tenant) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('tenant', JSON.stringify(data.tenant))
        router.push('/dashboard')
      } else {
        setCheckout((prev: any) => ({ ...prev, status: data.status }))
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Falha ao consultar status do pagamento.')
    }
  }

  async function simulateApprove() {
    if (!checkout?.checkoutId) return
    try {
      await api.post('/billing/webhook', { checkoutId: checkout.checkoutId, status: 'approved' })
      await refreshCheckoutStatus()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Falha ao simular aprovacao.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="text-center">
          <div className="flex justify-center mb-4">
            <Image src="/financeiroai-logo.svg?v=20260709r1" alt="FinanceiroAI" width={116} height={116} className="rounded-[1.8rem] shadow-[0_16px_44px_rgba(34,211,238,0.30)]" />
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-cyan-300">FinanceiroAI</h1>
          <p className="text-gray-400 mt-2">Escolha o plano, cadastre-se, pague e comece em minutos.</p>
        </header>

        {error && <div className="rounded-lg border border-rose-500 bg-rose-900/30 p-3 text-rose-200">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="text-lg font-semibold">1) Escolha o plano</h2>
            {loading ? (
              <p className="text-sm text-gray-400 mt-3">Carregando planos...</p>
            ) : (
              <div className="mt-3 space-y-2">
                {plans.map((plan) => (
                  <label key={plan.id} className="block rounded-lg border border-gray-800 bg-gray-950 p-3 cursor-pointer hover:border-cyan-400">
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="planCode"
                        checked={form.planCode === plan.code}
                        onChange={() => setForm((f) => ({ ...f, planCode: plan.code }))}
                      />
                      <div>
                        <p className="font-medium">{plan.name} ({plan.code})</p>
                        <p className="text-cyan-300 text-sm">{formatCurrency((plan.priceCents || 0) / 100)}</p>
                        <p className="text-xs text-gray-400">{plan.features || 'Sem descricao'}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="text-lg font-semibold">2) Cadastro e pagamento</h2>
            <form onSubmit={createCheckout} className="mt-3 space-y-3">
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2" placeholder="Nome da familia" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2" type="password" placeholder="Senha (8+ caracteres)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
              <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2" placeholder="Cupom (opcional)" value={form.couponCode} onChange={(e) => setForm((f) => ({ ...f, couponCode: e.target.value }))} />

              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-sm text-gray-300">
                Plano selecionado: <span className="text-white font-semibold">{selectedPlan?.name || form.planCode}</span>
              </div>

              <button disabled={creating} className="w-full rounded-lg bg-cyan-400 hover:bg-cyan-300 text-gray-900 font-semibold py-2 disabled:opacity-60">
                {creating ? 'Criando checkout...' : 'Continuar para pagamento'}
              </button>
            </form>
          </section>
        </div>

        {checkout && (
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <h2 className="text-lg font-semibold">3) Finalizacao</h2>
            <p className="text-sm text-gray-300">Checkout: {checkout.checkoutId}</p>
            <p className="text-sm text-gray-300">Status: <span className="font-semibold text-cyan-300">{checkout.status}</span></p>
            <p className="text-sm text-gray-300">Valor: <span className="font-semibold">{formatCurrency((checkout.amountCents || 0) / 100)}</span></p>

            <div className="flex flex-wrap gap-2">
              {checkout.checkoutUrl && (
                <a href={checkout.checkoutUrl} target="_blank" className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-gray-900 px-3 py-2 text-sm font-semibold">
                  Abrir checkout
                </a>
              )}
              <button onClick={refreshCheckoutStatus} className="rounded-lg bg-gray-800 hover:bg-gray-700 px-3 py-2 text-sm">Ja paguei, verificar</button>
              {checkout.simulated && (
                <button onClick={simulateApprove} className="rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-900 px-3 py-2 text-sm font-semibold">
                  Simular pagamento aprovado
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

