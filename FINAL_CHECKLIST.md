# Final Checklist - MeuFinanceiroAI

## 1. Runtime
- Backend ativo em http://localhost:3001
- Frontend ativo em http://localhost:3000
- Prisma migrations aplicadas
- Prisma client gerado

## 2. Seguranca e estabilidade
- Antiduplicacao de mensagens WhatsApp ativa
- Cooldown de reparo por sessao ativo
- Limite diario de reparo por tenant ativo
- Auditoria de reparo persistida em banco

## 3. Diagnostico
- Endpoint GET /api/dashboard/system/health retornando:
  - database status
  - whatsapp runtime
  - repairAudit
  - repairLimit

## 4. Validacao funcional
- Rodar: npm run smoke
- Conferir resultado [SMOKE PASS]

## 5. Preparacao para deploy
- Definir variaveis de ambiente de producao
- Definir backup do arquivo SQLite (backend/prisma/dev.db)
- Configurar restart automatico do processo (PM2/servico)
- Garantir apenas uma instancia do backend em execucao
- Rodar backup manual: npm run backup:db
- Subida de producao local com pre-check: npm run start:prod
- Parada segura de producao local: npm run stop:prod
- Simulacao de parada sem derrubar processos: npm run stop:prod:dry

## 6. Opcional antes do go-live
- Exportacao CSV da auditoria de reparo
- Alertas de observabilidade externos (uptime/log)
- Teste manual de reconexao WhatsApp com celular real

## 7. Operacao diaria
- Seguir o guia: RUNBOOK.md
