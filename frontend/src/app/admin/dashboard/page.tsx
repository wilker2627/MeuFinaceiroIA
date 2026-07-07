'use client'

import { useEffect, useMemo, useState } from 'react'
import adminApi from '@/lib/adminApi'
import { formatCurrency } from '@/lib/utils'
import { Activity, BadgeDollarSign, Building2, Power, RefreshCw, ShieldAlert, Trash2, UserRoundCog } from 'lucide-react'

type AnyObj = Record<string, any>

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [overview, setOverview] = useState<AnyObj | null>(null)
  const [clients, setClients] = useState<AnyObj[]>([])
  const [selectedClient, setSelectedClient] = useState<AnyObj | null>(null)
  const [commercial, setCommercial] = useState<AnyObj | null>(null)
  const [growth, setGrowth] = useState<AnyObj | null>(null)
  const [plans, setPlans] = useState<AnyObj[]>([])
  const [coupons, setCoupons] = useState<AnyObj[]>([])
  const [aiPolicy, setAiPolicy] = useState<AnyObj | null>(null)
  const [wa, setWa] = useState<AnyObj[]>([])
  const [stats, setStats] = useState<AnyObj | null>(null)
  const [tickets, setTickets] = useState<AnyObj[]>([])
  const [updates, setUpdates] = useState<AnyObj[]>([])
  const [permissions, setPermissions] = useState<AnyObj[]>([])

  const [search, setSearch] = useState('')
  const [clientStatusFilter, setClientStatusFilter] = useState<'ALL' | 'ACTIVE' | 'TRIAL' | 'CANCELED'>('ALL')
  const [broadcastTitle, setBroadcastTitle] = useState('Nova funcao disponivel')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [busyClientId, setBusyClientId] = useState<string | null>(null)
  const [selectedClientPlan, setSelectedClientPlan] = useState('')

  const planDraft = useMemo(() => ({
    name: '',
    code: '',
    priceCents: 0,
    messageLimit: null as number | null,
    userLimit: null as number | null,
    accountLimit: null as number | null,
    features: ''
  }), [])
  const [newPlan, setNewPlan] = useState(planDraft)

  const couponDraft = useMemo(() => ({
    code: '',
    description: '',
    discountPercent: 0,
    firstMonthFree: false
  }), [])
  const [newCoupon, setNewCoupon] = useState(couponDraft)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [planEditDraft, setPlanEditDraft] = useState<AnyObj | null>(null)
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null)
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    password: '',
    whatsappPhone: '',
    plan: 'FREE',
    isActive: true
  })

  const filteredClients = useMemo(() => {
    if (clientStatusFilter === 'ALL') return clients
    return clients.filter((c) => c.status === clientStatusFilter)
  }, [clients, clientStatusFilter])

  async function loadAll(searchTerm = '') {
    setError('')
    try {
      const [
        o,
        c,
        co,
        g,
        p,
        cp,
        ai,
        w,
        st,
        tk,
        up,
        pe
      ] = await Promise.all([
        adminApi.get('/admin/overview'),
        adminApi.get('/admin/clients', { params: { search: searchTerm } }),
        adminApi.get('/admin/commercial'),
        adminApi.get('/admin/growth'),
        adminApi.get('/admin/plans'),
        adminApi.get('/admin/coupons'),
        adminApi.get('/admin/ai-policy'),
        adminApi.get('/admin/whatsapp'),
        adminApi.get('/admin/statistics'),
        adminApi.get('/admin/support/tickets'),
        adminApi.get('/admin/updates/history'),
        adminApi.get('/admin/permissions')
      ])

      setOverview(o.data)
      setClients(c.data)
      setCommercial(co.data)
      setGrowth(g.data)
      setPlans(p.data)
      setCoupons(cp.data)
      setAiPolicy(ai.data)
      setWa(w.data)
      setStats(st.data)
      setTickets(tk.data)
      setUpdates(up.data)
      setPermissions(pe.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Falha ao carregar painel admin.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await loadAll(search)
  }

  async function openClient(id: string) {
    const { data } = await adminApi.get(`/admin/clients/${id}`)
    setSelectedClient(data)
    setSelectedClientPlan(data.profile.plan)
  }

  async function refreshData() {
    setLoading(true)
    await loadAll(search)
  }

  async function toggleClientStatus(client: AnyObj) {
    setBusyClientId(client.id)
    try {
      const nextIsActive = client.status === 'CANCELED'
      await adminApi.patch(`/admin/clients/${client.id}/status`, { isActive: nextIsActive })
      await loadAll(search)
      if (selectedClient?.profile?.id === client.id) {
        await openClient(client.id)
      }
    } finally {
      setBusyClientId(null)
    }
  }

  async function updateSelectedClientPlan() {
    if (!selectedClient?.profile?.id || !selectedClientPlan) return
    setBusyClientId(selectedClient.profile.id)
    try {
      await adminApi.patch(`/admin/clients/${selectedClient.profile.id}/plan`, { plan: selectedClientPlan })
      await loadAll(search)
      await openClient(selectedClient.profile.id)
    } finally {
      setBusyClientId(null)
    }
  }

  async function deleteClient(client: AnyObj) {
    const approved = window.confirm(`Excluir cliente ${client.name}? Esta acao remove dados da operacao.`)
    if (!approved) return

    setBusyClientId(client.id)
    try {
      await adminApi.delete(`/admin/clients/${client.id}`)
      if (selectedClient?.profile?.id === client.id) {
        setSelectedClient(null)
        setSelectedClientPlan('')
      }
      await loadAll(search)
    } finally {
      setBusyClientId(null)
    }
  }

  async function createClient(e: React.FormEvent) {
    e.preventDefault()
    setCreatingClient(true)
    setError('')
    setSuccessMessage('')
    try {
      const { data } = await adminApi.post('/admin/clients', newClient)
      setNewClient({ name: '', email: '', password: '', whatsappPhone: '', plan: 'FREE', isActive: true })

      let msg = 'Cliente criado com sucesso.'
      if (data?.welcome?.attempted) {
        msg = data.welcome.sent
          ? 'Cliente criado e boas-vindas enviadas no WhatsApp.'
          : `Cliente criado, mas o WhatsApp falhou: ${data.welcome.error || 'erro desconhecido'}`
      }
      setSuccessMessage(msg)

      await loadAll(search)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Falha ao criar cliente.')
    } finally {
      setCreatingClient(false)
    }
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault()
    await adminApi.post('/admin/plans', newPlan)
    setNewPlan(planDraft)
    await loadAll(search)
  }

  function beginEditPlan(plan: AnyObj) {
    setEditingPlanId(plan.id)
    setPlanEditDraft({
      code: plan.code || '',
      name: plan.name || '',
      priceCents: Number(plan.priceCents || 0),
      messageLimit: plan.messageLimit ?? null,
      userLimit: plan.userLimit ?? null,
      accountLimit: plan.accountLimit ?? null,
      features: plan.features || '',
      isActive: !!plan.isActive
    })
  }

  function cancelEditPlan() {
    setEditingPlanId(null)
    setPlanEditDraft(null)
  }

  async function updatePlan(e: React.FormEvent) {
    e.preventDefault()
    if (!editingPlanId || !planEditDraft) return
    setSavingPlanId(editingPlanId)
    try {
      await adminApi.put(`/admin/plans/${editingPlanId}`, planEditDraft)
      cancelEditPlan()
      await loadAll(search)
    } finally {
      setSavingPlanId(null)
    }
  }

  async function saveCoupon(e: React.FormEvent) {
    e.preventDefault()
    await adminApi.post('/admin/coupons', newCoupon)
    setNewCoupon(couponDraft)
    await loadAll(search)
  }

  async function saveAiPolicy(e: React.FormEvent) {
    e.preventDefault()
    await adminApi.put('/admin/ai-policy', aiPolicy)
    await loadAll(search)
  }

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault()
    if (!broadcastMessage.trim()) return
    await adminApi.post('/admin/updates/broadcast', { title: broadcastTitle, message: broadcastMessage })
    setBroadcastMessage('')
    await loadAll(search)
  }

  if (loading) {
    return <div className="p-8 text-slate-300">Carregando painel administrativo...</div>
  }

  return (
    <div className="p-6 space-y-6 bg-slate-950 min-h-screen">
      {error && <div className="rounded-lg bg-rose-900/40 border border-rose-600 p-3 text-rose-200">{error}</div>}
      {successMessage && <div className="rounded-lg bg-emerald-900/35 border border-emerald-600 p-3 text-emerald-200">{successMessage}</div>}

      <section className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 p-6 shadow-[0_20px_60px_rgba(8,47,73,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-cyan-300">FinanceIA - Centro de Controle</h2>
            <p className="text-sm text-slate-400 mt-1">Operacao de clientes, crescimento e risco em um unico cockpit.</p>
          </div>
          <button onClick={refreshData} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400/15 border border-cyan-400/35 text-cyan-200 px-3 py-2 text-sm hover:bg-cyan-400/25">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
          <Kpi title="Clientes ativos" value={String(overview?.clientsActive || 0)} icon={<Building2 size={14} />} />
          <Kpi title="MRR" value={formatCurrency(Number(overview?.mrr || 0))} icon={<BadgeDollarSign size={14} />} />
          <Kpi title="Cancelamentos" value={String(overview?.cancelamentos || 0)} icon={<ShieldAlert size={14} />} />
          <Kpi title="Novos clientes" value={String(overview?.novosClientes || 0)} icon={<UserRoundCog size={14} />} />
          <Kpi title="Mensagens hoje" value={String(overview?.mensagensHoje || 0)} icon={<Activity size={14} />} />
        </div>
      </section>

      <section id="clientes" className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-100">Clientes</h3>
            <form onSubmit={handleSearch} className="flex gap-2 flex-wrap justify-end">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome/email" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
              <select value={clientStatusFilter} onChange={(e) => setClientStatusFilter(e.target.value as any)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                <option value="ALL">Todos status</option>
                <option value="ACTIVE">Ativos</option>
                <option value="TRIAL">Trial</option>
                <option value="CANCELED">Cancelados</option>
              </select>
              <button className="bg-cyan-400 text-slate-900 px-3 rounded-lg font-semibold">Buscar</button>
            </form>
          </div>
          <div className="mt-4 space-y-2 max-h-[360px] overflow-auto pr-1">
            {filteredClients.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 hover:border-cyan-500">
                <button onClick={() => openClient(c.id)} className="w-full text-left">
                  <p className="font-medium text-slate-200">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.email} • Plano {c.plan} • {c.status}</p>
                  <p className="text-xs text-slate-500">Desde: {new Date(c.since).toLocaleDateString('pt-BR')} • Ultimo acesso: {new Date(c.lastAccess).toLocaleString('pt-BR')}</p>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => toggleClientStatus(c)}
                    disabled={busyClientId === c.id}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    <Power size={12} /> {c.status === 'CANCELED' ? 'Reativar' : 'Suspender'}
                  </button>
                  <button
                    onClick={() => deleteClient(c)}
                    disabled={busyClientId === c.id}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="font-semibold text-slate-100">Criar Cliente</h3>
          <form onSubmit={createClient} className="mt-3 space-y-2">
            <input
              value={newClient.name}
              onChange={(e) => setNewClient((v) => ({ ...v, name: e.target.value }))}
              placeholder="Nome do cliente"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              required
            />
            <input
              type="email"
              value={newClient.email}
              onChange={(e) => setNewClient((v) => ({ ...v, email: e.target.value }))}
              placeholder="E-mail"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              required
            />
            <input
              type="password"
              value={newClient.password}
              onChange={(e) => setNewClient((v) => ({ ...v, password: e.target.value }))}
              placeholder="Senha inicial (min 8)"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              required
            />
            <input
              value={newClient.whatsappPhone}
              onChange={(e) => setNewClient((v) => ({ ...v, whatsappPhone: e.target.value }))}
              placeholder="WhatsApp do cliente (opcional)"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newClient.plan}
                onChange={(e) => setNewClient((v) => ({ ...v, plan: e.target.value }))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.code}>{p.name}</option>
                ))}
              </select>
              <label className="text-sm text-slate-300 flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2">
                <input
                  type="checkbox"
                  checked={newClient.isActive}
                  onChange={(e) => setNewClient((v) => ({ ...v, isActive: e.target.checked }))}
                />
                Ativo
              </label>
            </div>
            <button
              disabled={creatingClient}
              className="w-full rounded-lg bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {creatingClient ? 'Criando...' : 'Criar cliente no admin'}
            </button>
          </form>

          <hr className="border-slate-800 my-4" />

          <h3 className="font-semibold text-slate-100">Dados do Cliente</h3>
          {!selectedClient ? (
            <p className="text-sm text-slate-500 mt-3">Selecione um cliente para visualizar detalhes.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <p><span className="text-slate-400">Nome:</span> {selectedClient.profile.name}</p>
              <p><span className="text-slate-400">Email:</span> {selectedClient.profile.email}</p>
              <p><span className="text-slate-400">Plano:</span> {selectedClient.profile.plan}</p>
              <p><span className="text-slate-400">Status:</span> {selectedClient.profile.status}</p>
              <p><span className="text-slate-400">Cadastro:</span> {new Date(selectedClient.profile.createdAt).toLocaleDateString('pt-BR')}</p>
              <p><span className="text-slate-400">Renovacao:</span> {selectedClient.profile.renewal ? new Date(selectedClient.profile.renewal).toLocaleDateString('pt-BR') : 'Nao definida'}</p>
              <p><span className="text-slate-400">Forma de pagamento:</span> {selectedClient.profile.paymentMethod}</p>
              <p><span className="text-slate-400">Usuarios:</span> {selectedClient.profile.users}</p>
              <p><span className="text-slate-400">WhatsApps vinculados:</span> {selectedClient.profile.whatsappsLinked}</p>
              <div className="pt-2">
                <label className="text-slate-400 text-xs">Plano do cliente</label>
                <div className="mt-1 flex gap-2">
                  <select value={selectedClientPlan} onChange={(e) => setSelectedClientPlan(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm">
                    {plans.map((p) => (
                      <option key={p.id} value={p.code}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                  <button
                    onClick={updateSelectedClientPlan}
                    disabled={busyClientId === selectedClient.profile.id}
                    className="rounded-lg bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    Salvar
                  </button>
                </div>
              </div>
              <hr className="border-slate-800 my-2" />
              <p><span className="text-slate-400">Lancamentos:</span> {selectedClient.metrics.lancamentos}</p>
              <p><span className="text-slate-400">Categorias:</span> {selectedClient.metrics.categorias}</p>
              <p><span className="text-slate-400">Contas:</span> {selectedClient.metrics.contas}</p>
              <p><span className="text-slate-400">Mensagens IA:</span> {selectedClient.metrics.mensagensIA}</p>
              <p><span className="text-slate-400">Espaco:</span> {selectedClient.metrics.espacoMB} MB</p>
            </div>
          )}
        </div>
      </section>

      <section id="comercial" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Dashboard Comercial">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Kpi title="Hoje" value={formatCurrency(commercial?.today || 0)} />
            <Kpi title="Ontem" value={formatCurrency(commercial?.yesterday || 0)} />
            <Kpi title="Este mes" value={formatCurrency(commercial?.month || 0)} />
            <Kpi title="Ano" value={formatCurrency(commercial?.year || 0)} />
          </div>
        </Card>

        <Card title="Painel de Crescimento">
          <ul className="space-y-1 text-sm text-slate-300">
            <li>MRR: {formatCurrency(growth?.mrr || 0)}</li>
            <li>ARR: {formatCurrency(growth?.arr || 0)}</li>
            <li>Clientes ativos: {growth?.clientesAtivos || 0}</li>
            <li>Novos na semana: {growth?.novosSemana || 0}</li>
            <li>Churn: {growth?.churn || 0}%</li>
            <li>Pagamentos pendentes: {growth?.pagamentosPendentes || 0}</li>
            <li>Plano mais vendido: {growth?.planoMaisVendido || 'N/A'}</li>
            <li>Ticket medio: {formatCurrency(growth?.ticketMedio || 0)}</li>
            <li>Mensagens processadas: {growth?.mensagensProcessadas || 0}</li>
            <li>Custo medio IA por cliente: {formatCurrency(growth?.custoMedioIACliente || 0)}</li>
            <li>Lucro por cliente: {formatCurrency(growth?.lucroPorCliente || 0)}</li>
          </ul>

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
            <p className="font-semibold text-cyan-300 mb-1">Funil de onboarding (mes)</p>
            <p>Checkouts iniciados: {growth?.funil?.checkoutStarted || 0}</p>
            <p>Pagamentos aprovados: {growth?.funil?.paymentApproved || 0}</p>
            <p>Contas criadas: {growth?.funil?.tenantCreated || 0}</p>
            <p>Conversao checkout → pago: {growth?.funil?.conversionCheckoutToPaid || 0}%</p>
          </div>
        </Card>
      </section>

      <section id="planos" className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Planos">
          <div className="space-y-2 text-sm mb-4 max-h-60 overflow-auto pr-1">
            {plans.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-800 p-3 bg-slate-950">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{p.name} ({p.code})</p>
                  <button
                    type="button"
                    onClick={() => beginEditPlan(p)}
                    className="rounded-md border border-cyan-400/35 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-400/20"
                  >
                    Editar
                  </button>
                </div>
                <p className="text-slate-400">{formatCurrency((p.priceCents || 0) / 100)} • Usuarios: {p.userLimit ?? 'Ilimitado'} • Mensagens: {p.messageLimit ?? 'Ilimitado'} • Contas: {p.accountLimit ?? 'Ilimitado'}</p>
                <p className="text-slate-500">{p.features || 'Sem descricao'} • {p.isActive ? 'Ativo' : 'Inativo'}</p>

                {editingPlanId === p.id && planEditDraft && (
                  <form onSubmit={updatePlan} className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" placeholder="Nome" value={planEditDraft.name} onChange={(e) => setPlanEditDraft((v: AnyObj) => ({ ...v, name: e.target.value }))} required />
                    <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" placeholder="Codigo" value={planEditDraft.code} onChange={(e) => setPlanEditDraft((v: AnyObj) => ({ ...v, code: e.target.value }))} required />
                    <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" type="number" placeholder="Preco em centavos" value={planEditDraft.priceCents} onChange={(e) => setPlanEditDraft((v: AnyObj) => ({ ...v, priceCents: Number(e.target.value) }))} />
                    <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" type="number" placeholder="Limite mensagens" value={planEditDraft.messageLimit ?? ''} onChange={(e) => setPlanEditDraft((v: AnyObj) => ({ ...v, messageLimit: e.target.value === '' ? null : Number(e.target.value) }))} />
                    <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" type="number" placeholder="Limite usuarios" value={planEditDraft.userLimit ?? ''} onChange={(e) => setPlanEditDraft((v: AnyObj) => ({ ...v, userLimit: e.target.value === '' ? null : Number(e.target.value) }))} />
                    <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" type="number" placeholder="Limite contas" value={planEditDraft.accountLimit ?? ''} onChange={(e) => setPlanEditDraft((v: AnyObj) => ({ ...v, accountLimit: e.target.value === '' ? null : Number(e.target.value) }))} />
                    <textarea className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" placeholder="Features" value={planEditDraft.features} onChange={(e) => setPlanEditDraft((v: AnyObj) => ({ ...v, features: e.target.value }))} />
                    <label className="col-span-2 text-xs text-slate-300 flex items-center gap-2">
                      <input type="checkbox" checked={!!planEditDraft.isActive} onChange={(e) => setPlanEditDraft((v: AnyObj) => ({ ...v, isActive: e.target.checked }))} />
                      Plano ativo
                    </label>
                    <div className="col-span-2 flex gap-2">
                      <button disabled={savingPlanId === p.id} className="flex-1 rounded-lg bg-cyan-400 text-slate-950 font-semibold py-2 disabled:opacity-50">Salvar alteracoes</button>
                      <button type="button" onClick={cancelEditPlan} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-300">Cancelar</button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={savePlan} className="grid grid-cols-2 gap-2">
            <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" placeholder="Nome" value={newPlan.name} onChange={(e) => setNewPlan((v) => ({ ...v, name: e.target.value }))} required />
            <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" placeholder="Codigo" value={newPlan.code} onChange={(e) => setNewPlan((v) => ({ ...v, code: e.target.value }))} required />
            <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" type="number" placeholder="Preco em centavos" value={newPlan.priceCents} onChange={(e) => setNewPlan((v) => ({ ...v, priceCents: Number(e.target.value) }))} />
            <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" type="number" placeholder="Limite usuarios" onChange={(e) => setNewPlan((v) => ({ ...v, userLimit: e.target.value ? Number(e.target.value) : null }))} />
            <textarea className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" placeholder="Features" value={newPlan.features} onChange={(e) => setNewPlan((v) => ({ ...v, features: e.target.value }))} />
            <button className="col-span-2 rounded-lg bg-cyan-400 text-slate-950 font-semibold py-2">Salvar plano</button>
          </form>
        </Card>

        <Card title="Cupons">
          <div className="space-y-2 text-sm mb-4 max-h-60 overflow-auto pr-1">
            {coupons.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-800 p-3 bg-slate-950">
                <p className="font-medium">{c.code}</p>
                <p className="text-slate-400">{c.firstMonthFree ? 'Primeiro mes gratis' : `${c.discountPercent || 0}%`}</p>
                <p className="text-slate-500">{c.description || 'Sem descricao'}</p>
              </div>
            ))}
          </div>
          <form onSubmit={saveCoupon} className="grid grid-cols-2 gap-2">
            <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" placeholder="Codigo" value={newCoupon.code} onChange={(e) => setNewCoupon((v) => ({ ...v, code: e.target.value }))} required />
            <input className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" type="number" placeholder="Desconto %" value={newCoupon.discountPercent} onChange={(e) => setNewCoupon((v) => ({ ...v, discountPercent: Number(e.target.value) }))} />
            <input className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm" placeholder="Descricao" value={newCoupon.description} onChange={(e) => setNewCoupon((v) => ({ ...v, description: e.target.value }))} />
            <label className="col-span-2 text-sm text-slate-300 flex items-center gap-2">
              <input type="checkbox" checked={newCoupon.firstMonthFree} onChange={(e) => setNewCoupon((v) => ({ ...v, firstMonthFree: e.target.checked }))} />
              Primeiro mes gratis
            </label>
            <button className="col-span-2 rounded-lg bg-cyan-400 text-slate-950 font-semibold py-2">Salvar cupom</button>
          </form>
        </Card>
      </section>

      <section id="ia" className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Politica de IA">
          {!aiPolicy ? null : (
            <form onSubmit={saveAiPolicy} className="space-y-2 text-sm">
              <label className="block">Modelo
                <input className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2" value={aiPolicy.modelName || ''} onChange={(e) => setAiPolicy((v: AnyObj) => ({ ...v, modelName: e.target.value }))} />
              </label>
              <label className="block">Limite diario
                <input className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2" type="number" value={aiPolicy.dailyLimit || 0} onChange={(e) => setAiPolicy((v: AnyObj) => ({ ...v, dailyLimit: Number(e.target.value) }))} />
              </label>
              <label className="block">Limite mensal
                <input className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2" type="number" value={aiPolicy.monthlyLimit || 0} onChange={(e) => setAiPolicy((v: AnyObj) => ({ ...v, monthlyLimit: Number(e.target.value) }))} />
              </label>
              <label className="block">Mensagens por cliente
                <input className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2" type="number" value={aiPolicy.messagesPerTenant || 0} onChange={(e) => setAiPolicy((v: AnyObj) => ({ ...v, messagesPerTenant: Number(e.target.value) }))} />
              </label>
              <button className="w-full rounded-lg bg-cyan-400 text-slate-950 font-semibold py-2">Salvar politica</button>
            </form>
          )}
        </Card>

        <Card title="Estatisticas globais">
          <ul className="space-y-1 text-sm text-slate-300">
            <li>Clientes: {stats?.clientes || 0}</li>
            <li>Mensagens: {stats?.mensagens || 0}</li>
            <li>Lancamentos: {stats?.lancamentos || 0}</li>
            <li>Receitas registradas: {formatCurrency(stats?.receitasRegistradas || 0)}</li>
            <li>Despesas registradas: {formatCurrency(stats?.despesasRegistradas || 0)}</li>
          </ul>
        </Card>
      </section>

      <section id="whatsapp" className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="WhatsApp conectado">
          <div className="space-y-2 text-sm max-h-64 overflow-auto pr-1">
            {wa.map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <p className="font-medium">{s.phoneNumber} • {s.status}</p>
                <p className="text-slate-400">{s.tenantName} • {s.tenantEmail}</p>
                <p className="text-slate-500">Ultima sincronizacao: {s.lastSync ? new Date(s.lastSync).toLocaleString('pt-BR') : 'nunca'}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Permissoes">
          <div className="space-y-2 text-sm">
            {permissions.map((p) => (
              <div key={p.role} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <p className="font-medium">{p.role}</p>
                <p className="text-slate-400">{(p.scopes || []).join(', ')}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section id="suporte" className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Suporte">
          <div className="space-y-2 text-sm max-h-64 overflow-auto pr-1">
            {tickets.length === 0 && <p className="text-slate-500">Sem chamados.</p>}
            {tickets.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <p className="font-medium">{t.subject} • {t.status}</p>
                <p className="text-slate-400">{t.tenant?.name} ({t.tenant?.email})</p>
                <p className="text-slate-500">{t.lastMessage || 'Sem mensagem'}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Atualizacoes para todos os clientes">
          <form onSubmit={sendBroadcast} className="space-y-2">
            <input value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Titulo" />
            <textarea value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)} className="w-full h-28 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Mensagem de atualizacao" required />
            <button className="w-full rounded-lg bg-cyan-400 text-slate-950 font-semibold py-2">Enviar via WhatsApp</button>
          </form>

          <div className="mt-4 max-h-40 overflow-auto pr-1 space-y-2 text-xs">
            {updates.map((u) => (
              <div key={u.id} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                <p className="font-semibold text-slate-200">{u.title}</p>
                <p className="text-slate-400">{u.message}</p>
                <p className="text-slate-500">Enviados: {u.sentCount} • {new Date(u.createdAt).toLocaleString('pt-BR')}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="font-semibold text-slate-100">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Kpi({ title, value, icon }: { title: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
      <p className="text-xs text-slate-400 inline-flex items-center gap-1">{icon}{title}</p>
      <p className="text-base font-semibold text-cyan-300">{value}</p>
    </div>
  )
}
