# Deploy Gratis (Casal) - MeuFinanceiroAI

Este guia publica o app sem notebook ligado usando:
- Frontend: Vercel (free)
- Backend: Render (free)
- Banco: Neon Postgres (free)

## 1) Criar banco gratis (Neon)
1. Crie conta em Neon.
2. Crie um projeto Postgres.
3. Copie a connection string (DATABASE_URL) com `sslmode=require`.

## 2) Backend no Render
1. Suba este repositorio no GitHub.
2. No Render, clique em "New +" -> "Blueprint".
3. Selecione o repo e use o arquivo `render.yaml` da raiz.
4. Preencha env vars obrigatorias:
   - `DATABASE_URL` (Neon)
   - `JWT_SECRET` (string forte)
   - `OPENAI_API_KEY` (sua chave)
   - `FRONTEND_URL` (deixe provisoriamente vazio ou use URL do Vercel depois)
5. Deploy.
6. Ao final, copie a URL publica do backend, ex: `https://meufinanceiro-backend.onrender.com`.

## 3) Frontend no Vercel
1. No Vercel, importe o mesmo repo.
2. Configure `Root Directory` = `frontend`.
3. Defina env vars:
   - `NEXT_PUBLIC_API_URL` = `https://SEU_BACKEND.onrender.com/api`
   - `API_SERVER_URL` = `https://SEU_BACKEND.onrender.com`
   - `NEXT_PUBLIC_WA_ENABLED` = `false`
4. Deploy.
5. Copie a URL publica do frontend, ex: `https://meufinanceiro-ai.vercel.app`.

## 4) Ajustar CORS no Render
1. Volte no backend (Render) e atualize:
   - `FRONTEND_URL` = URL do Vercel
2. Redeploy backend.

## 5) Teste final
1. Abra no celular: URL do Vercel.
2. Faça login.
3. Crie um lancamento manual.

## 6) Instalar no iPhone
1. Abra o app no Safari.
2. Compartilhar -> Adicionar a Tela de Inicio.

## Observacoes do plano gratis
- Pode haver "sleep" por inatividade (primeiro acesso demora).
- Para 2 pessoas, costuma funcionar bem no inicio.

## Seguranca
- Revogue a chave OpenAI antiga se ela foi exposta.
- Gere nova chave antes de publicar.
