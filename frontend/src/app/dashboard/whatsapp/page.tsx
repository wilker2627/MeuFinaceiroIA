'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Smartphone, Trash2, CheckCircle, XCircle } from 'lucide-react'

export default function WhatsAppPage() {
  const waEnabled = process.env.NEXT_PUBLIC_WA_ENABLED === 'true'
  const [sessions, setSessions] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'

  async function load() {
    const { data } = await api.get('/whatsapp/sessions')
    setSessions(data)
  }

  useEffect(() => { load() }, [])

  if (!waEnabled) {
    return (
      <div className="relative p-4 md:p-6">
        <div className="relative space-y-6">
          <div className={`p-6 dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]`}>
            <h1 className="text-2xl md:text-3xl font-black text-white">Canal desativado</h1>
            <p className="text-slate-300 mt-2">Este ambiente esta em modo app-only. Use a tela de Lancamentos para registrar gastos e entradas manualmente.</p>
          </div>
        </div>
      </div>
    )
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setConnecting(true)
    try {
      const { data } = await api.post('/whatsapp/sessions', { phoneNumber })
      setQrCode(data.qrCode)
      // Polling a cada 3s para ver se conectou
      const interval = setInterval(async () => {
        await load()
        const session = (await api.get('/whatsapp/sessions')).data
        const connected = session.find((s: any) => s.isActive && s.phoneNumber === phoneNumber)
        if (connected) {
          clearInterval(interval)
          setQrCode('')
          setShowForm(false)
          setPhoneNumber('')
          setConnecting(false)
        }
      }, 3000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao conectar.')
      setConnecting(false)
    }
  }

  async function handleDisconnect(id: string) {
    if (!confirm('Desconectar este número?')) return
    await api.delete(`/whatsapp/sessions/${id}`)
    load()
  }

  return (
    <div className="relative p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">WhatsApp</h1>
          <p className="text-slate-400 text-sm mt-1">Conecte os números que vão usar o assistente</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold px-4 py-2 rounded-lg">
          <Smartphone size={18} /> Conectar Número
        </button>
      </div>

      {showForm && (
        <div className={`p-6 ${panelClass}`}>
          {!qrCode ? (
            <form onSubmit={handleConnect} className="space-y-4">
              <h3 className="text-white font-semibold">Conectar novo número</h3>
              {error && <div className="bg-red-900/40 border border-red-500 text-red-300 rounded-lg p-3 text-sm">{error}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Número WhatsApp</label>
                  <input required value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2"
                    placeholder="5511999999999" />
                  <p className="text-gray-500 text-xs mt-1">Com código do país. Ex: 5511999999999</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={connecting}
                  className="bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 font-semibold px-4 py-2 rounded-lg">
                  {connecting ? 'Gerando QR...' : 'Gerar QR Code'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setQrCode('') }}
                  className="bg-slate-800 text-white px-4 py-2 rounded-lg">Cancelar</button>
              </div>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <h3 className="text-white font-semibold">Escaneie o QR Code com o WhatsApp</h3>
              <div className="bg-white inline-block p-4 rounded-xl">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`}
                  alt="QR Code WhatsApp" className="w-48 h-48" />
              </div>
              <p className="text-gray-400 text-sm">
                Abra o WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
              </p>
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                Aguardando conexão...
              </div>
              <button onClick={() => { setShowForm(false); setQrCode('') }}
                className="text-gray-500 text-sm hover:text-gray-300">Cancelar</button>
            </div>
          )}
        </div>
      )}

      {/* Sessões */}
      <div className="stagger-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.length === 0 ? (
          <div className={`col-span-3 p-12 text-center ${panelClass}`}>
            <Smartphone size={48} className="text-gray-700 mx-auto mb-4" />
            <h3 className="text-white font-semibold mb-2">Nenhum número conectado</h3>
            <p className="text-gray-500 text-sm">Conecte um número WhatsApp para começar a usar o assistente financeiro.</p>
          </div>
        ) : sessions.map(s => (
          <div key={s.id} className={`p-6 ${panelClass}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="bg-cyan-500/10 p-3 rounded-xl">
                <Smartphone size={24} className="text-cyan-300" />
              </div>
              {s.isActive ? (
                <div className="flex items-center gap-1 bg-green-500/10 text-green-400 px-2 py-1 rounded-full text-xs">
                  <CheckCircle size={12} /> Conectado
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-red-500/10 text-red-400 px-2 py-1 rounded-full text-xs">
                  <XCircle size={12} /> Desconectado
                </div>
              )}
            </div>
            <div className="text-white font-semibold font-mono">+{s.phoneNumber}</div>
            {s.connectedAt && (
              <div className="text-gray-500 text-xs mt-1">
                Conectado em {new Date(s.connectedAt).toLocaleDateString('pt-BR')}
              </div>
            )}
            <button onClick={() => handleDisconnect(s.id)}
              className="mt-4 flex items-center gap-2 text-gray-600 hover:text-red-400 transition-colors text-sm">
              <Trash2 size={14} /> Desconectar
            </button>
          </div>
        ))}
      </div>

      {/* Instruções */}
      <div className={`p-6 ${panelClass}`}>
        <h3 className="text-white font-semibold mb-4">💬 Como usar o assistente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-400">
          <div>
            <div className="font-medium text-white mb-2">📝 Registrar lançamentos</div>
            <div className="space-y-1 bg-slate-950 rounded-lg p-3 font-mono text-xs border border-cyan-500/15">
              <div className="text-green-400">"Paguei R$ 180 de gasolina"</div>
              <div className="text-green-400">"Recebi R$ 5.000 de salário"</div>
              <div className="text-green-400">"Comprei estoque R$ 2.350"</div>
            </div>
          </div>
          <div>
            <div className="font-medium text-white mb-2">📊 Consultar informações</div>
            <div className="space-y-1 bg-slate-950 rounded-lg p-3 font-mono text-xs border border-cyan-500/15">
              <div className="text-blue-400">"Saldo"</div>
              <div className="text-blue-400">"Resumo da família"</div>
              <div className="text-blue-400">"Meus gastos"</div>
              <div className="text-blue-400">"Contas a pagar"</div>
            </div>
          </div>
          <div>
            <div className="font-medium text-white mb-2">📅 Agendar contas</div>
            <div className="space-y-1 bg-slate-950 rounded-lg p-3 font-mono text-xs border border-cyan-500/15">
              <div className="text-yellow-400">"Agende energia R$ 540 dia 10"</div>
              <div className="text-yellow-400">"Pagar fornecedor R$ 3.200 dia 8"</div>
            </div>
          </div>
          <div>
            <div className="font-medium text-white mb-2">🔀 Múltiplas contas</div>
            <div className="space-y-1 bg-slate-950 rounded-lg p-3 font-mono text-xs border border-cyan-500/15">
              <div className="text-purple-400">"na Ótica: paguei R$ 200"</div>
              <div className="text-purple-400">"na Família: mercado R$ 350"</div>
              <div className="text-purple-400">"Minhas contas"</div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
