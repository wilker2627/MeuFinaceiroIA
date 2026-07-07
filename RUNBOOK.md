# RUNBOOK - Operacao do MeuFinanceiroAI

## 1. Inicio do dia (operacao normal)
1. Abrir terminal na raiz do projeto.
2. Rodar backup rapido:
   - `npm run backup:db`
3. Subir ambiente local de operacao:
   - `npm run start:prod`
4. Verificar saude:
   - `http://localhost:3001/health`
   - `http://localhost:3001/api/dashboard/system/health` (com token)
   - `http://localhost:3000`

## Admin (operacao interna)
1. Abrir: `http://localhost:3000/admin/login`
2. Usar credenciais definidas em `backend/.env`:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
3. Painel mostra clientes, planos, cupons, IA, WhatsApp, suporte e atualizacoes.

## Assinatura self-service
1. Fluxo publico em `http://localhost:3000/subscribe`.
2. Retornos de pagamento:
   - `http://localhost:3000/subscribe/success`
   - `http://localhost:3000/subscribe/pending`
   - `http://localhost:3000/subscribe/failure`
3. Webhook de pagamento: `POST /api/billing/webhook`
4. Se `MP_WEBHOOK_SECRET` estiver definido, enviar o header `x-webhook-secret`.
5. Convite de familiar:
   - geracao: `POST /api/tenants/family-invites`
   - aceite: `http://localhost:3000/invite/{token}`

## 2. Validacao funcional minima
1. Rodar smoke:
   - `npm run smoke`
2. Confirmar retorno `[SMOKE PASS]`.
3. No dashboard, abrir painel de diagnostico e validar:
   - status backend/banco
   - runtime WhatsApp
   - `repairLimit`

## 3. Parada controlada
1. Simular parada sem derrubar nada:
   - `npm run stop:prod:dry`
2. Parar processos ativos:
   - `npm run stop:prod`

## 4. Recuperacao de incidente (API fora do ar)
1. Rodar parada controlada:
   - `npm run stop:prod`
2. Rodar novo backup antes de subir novamente:
   - `npm run backup:db`
3. Subir de novo:
   - `npm run start:prod`
4. Revalidar:
   - `npm run smoke`

## 5. Recuperacao WhatsApp sem resposta
1. Abrir Dashboard > Diagnostico do Sistema.
2. Usar "Reparar sessao" para o numero afetado.
3. Confirmar em duas etapas e escanear novo QR.
4. Validar no painel:
   - evento de auditoria `SUCCESS`
   - consumo de `repairLimit`

## 6. Rotina semanal recomendada
1. Revisar pasta `backups/` e espaco em disco.
2. Revisar auditoria de reparos no diagnostico.
3. Executar `npm run smoke` apos qualquer mudanca de codigo.

## 7. Alertas importantes
1. Manter apenas uma instancia do backend na porta 3001.
2. Nao executar reparo de sessao em loop: existe cooldown e limite diario.
3. Em producao, usar segredos reais e rotacionados para JWT e OpenAI.
