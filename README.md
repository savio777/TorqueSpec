# ⚙️ TorqueSpec — RAG Copilot para Manuais Técnicos

![TorqueSpec](docs/screenshots/TorqueSpec-banner.jpeg)

O **TorqueSpec** é uma aplicação completa de RAG (_Retrieval-Augmented Generation_) projetada para consultar especificações técnicas, torques de aperto e procedimentos de manutenção em manuais automotivos e industriais complexos.

A plataforma combina uma **interface Web administrativa** para ingestão e indexação de manuais em PDF com um **aplicativo Mobile** focado na consulta rápida e precisa por mecânicos e entusiastas.

![Painel administrativo e app mobile](docs/screenshots/TorqueSpec-screens.jpeg)

---

## 🎯 Problema que Resolve

Manuais de oficina possuem centenas de páginas e dezenas de megabytes com dados críticos (tabelas de torque, esquemas elétricos e especificações de fluidos). Encontrar uma informação específica durante um procedimento manual consome tempo e pode levar a erros de manutenção.

O TorqueSpec permite perguntas em linguagem natural e entrega **respostas exatas acompanhadas da citação da página original do manual**.

---

## 📍 Status

| Parte | Status |
| --- | --- |
| **API** (`services/api`) | ✅ Auth, motos, upload/ingestão de PDFs, busca híbrida, perguntas com citação, histórico, métricas, OpenAPI |
| Contratos (`packages/shared-types`) | ✅ Schemas Zod usados pela API (e prontos para web/mobile) |
| Painel Web (`apps/web`) | 🔜 |
| App Mobile (`apps/mobile`) | 🔜 |
| AI Engine isolado (`services/ai-engine`) | 🔜 hoje é um módulo da API — veja o [ADR-001](docs/architecture.md#adr-001--monólito-modular-em-vez-de-microsserviços) |

---

## 🛠️ Arquitetura & Tecnologias

### Backend & RAG Engine

- **Linguagem / Runtime:** Node.js 22 + TypeScript, [Fastify 5](https://fastify.dev) com validação/serialização via Zod e OpenAPI gerado automaticamente
- **LLM & Embeddings:** Google AI Studio (Gemini) + `nomic-embed-text` (Ollama), com **conectores plugáveis**: qualquer API compatível com OpenAI (`/chat/completions`) ou embeddings do Gemini — troca só por variável de ambiente
- **Vector Database:** PostgreSQL com extensão `pgvector` (índice HNSW, distância de cosseno)
- **Busca Híbrida:** Busca Vetorial (similaridade de cosseno) + Full-Text Search em português sem acentos (`ts_rank_cd`), fundidas por _Reciprocal Rank Fusion_
- **Processamento Assíncrono:** Redis + BullMQ para _chunking_ e geração de embeddings em segundo plano
- **ENV Variables:** conexão com PostgreSQL, Redis e credenciais da LLM (`POSTGRES_URL`, `REDIS_URL`, `LLM_API_KEY`…) — veja [`.env.example`](.env.example)

Detalhes, diagramas e decisões em [`docs/architecture.md`](docs/architecture.md).

### Frontend & Mobile

- **Painel Web (Admin):** Next.js / React + Tailwind CSS
- **App Mobile:** React Native (Expo) com suporte a _Dark Mode_ nativo

---

## 🚀 Funcionalidades Principais

- 📄 **Ingestão Inteligente de PDFs:** Upload e segmentação (_chunking_) por página de manuais de até 100 MB, com progresso acompanhável.
- 🔍 **Busca de Alta Precisão:** Identificação rápida de torques ($N\cdot m$), capacidades de óleos e folgas de válvulas — inclusive códigos exatos como `DR8EA-N` ou `520VD2`.
- 📌 **Citação de Fontes:** Respostas com indicação exata da página do manual; páginas que não vieram da busca são descartadas (anti-alucinação).
- 🚀 **Sugestões Rápidas (Chips):** Atalhos para buscas recorrentes (_Troca de óleo_, _Esquema elétrico_, _Aperto de parafusos_).

---

## ▶️ Rodando localmente

Pré-requisitos: Node.js 22+, pnpm 10 e Docker (ou Postgres 16 com pgvector + Redis instalados).

```bash
pnpm install
```

```bash
cp .env.example .env
```

Para rodar sem chave de API, use `LLM_PROVIDER=fake` e `EMBEDDING_PROVIDER=fake` no `.env` (respostas extrativas, sem custo). Para respostas reais, preencha `LLM_API_KEY` com uma chave do [Google AI Studio](https://aistudio.google.com/apikey) e suba o Ollama para os embeddings.

```bash
docker compose -f infrastructure/docker-compose.yml up -d postgres redis
```

```bash
pnpm --filter @torquespec/api seed
```

O seed aplica as migrations, cria o admin (`admin@torquespec.dev` / `torquespec-admin`) e indexa o manual de exemplo da [Yamaha XTZ 250 Lander](docs/manuals/yamaha-xtz250-lander.md), convertido para PDF.

Em dois terminais:

```bash
pnpm dev:api
```

```bash
pnpm dev:worker
```

A documentação interativa (Swagger) fica em <http://localhost:3333/docs>.

Stack completa em containers (API + worker + Postgres + Redis):

```bash
docker compose -f infrastructure/docker-compose.yml --profile app up --build
```

### Exemplo

Resposta ilustrativa com `LLM_PROVIDER=gemini` para o manual de exemplo:

```bash
curl -s -X POST localhost:3333/v1/manuals/$MANUAL_ID/ask \
  -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"question": "Qual o torque de aperto da porca do eixo traseiro?"}'
```

```json
{
  "answer": "De acordo com a pág. 3 do manual, o torque de aperto da porca do eixo da roda traseira é de 4,6 kgf·m (46 N·m).",
  "grounded": true,
  "citations": [{ "page": 3, "chunkId": 18, "excerpt": "Porca do eixo da roda traseira: 4,6 kgf.m (46 N.m)…", "score": 0.0325 }],
  "model": "gemini-2.5-flash",
  "usage": { "promptTokens": 1635, "completionTokens": 41 },
  "latencyMs": 912
}
```

---

## 🔌 Endpoints (v1)

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| `POST` | `/v1/auth/register` | público | Cria conta de mecânico |
| `POST` | `/v1/auth/login` | público | Devolve JWT |
| `GET` | `/v1/auth/me` | autenticado | Perfil |
| `GET` | `/v1/motorcycles` | autenticado | Lista motos |
| `POST` / `PATCH` / `DELETE` | `/v1/motorcycles[/:id]` | admin | Cadastro de motos |
| `GET` | `/v1/manuals?motorcycleId&status` | autenticado | Lista manuais (paginado) |
| `GET` | `/v1/manuals/:id` | autenticado | Detalhe + status/progresso da indexação |
| `POST` | `/v1/manuals` | admin | Upload do PDF (multipart: `file`, `motorcycleId`, `title?`) → 202 |
| `POST` | `/v1/manuals/:id/reindex` | admin | Reprocessa o manual |
| `DELETE` | `/v1/manuals/:id` | admin | Remove manual, fragmentos e PDF |
| `GET` | `/v1/manuals/:id/chunks?pageNumber` | admin | Inspeciona fragmentos |
| `POST` | `/v1/manuals/:id/ask` | autenticado | Pergunta → resposta com citações |
| `GET` | `/v1/queries?manualId` | autenticado | Histórico do usuário |
| `GET` | `/v1/suggestions` | público | Chips de sugestões |
| `GET` | `/v1/admin/stats` | admin | Vetores, manuais por status, consumo da LLM (30 dias) |
| `GET` | `/health` | público | Liveness + banco |

Erros seguem sempre o formato `{ "error": { "code", "message", "details?" } }`.

---

## 🧪 Qualidade

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
TEST_POSTGRES_URL=postgres://torque:torque@localhost:5432/torquespec_test pnpm test
```

- **Unitários:** chunker, RRF, prompt/citações, provedores offline, validação de env.
- **Integração:** API real (Fastify `inject`) contra Postgres + pgvector — upload do PDF de exemplo, indexação, perguntas com citação da página correta, RBAC, limites de upload e métricas. Sem `TEST_POSTGRES_URL`, essa suíte é pulada.
- **CI** (`.github/workflows/ci.yml`): lint, typecheck, testes com Postgres/pgvector como service container, build e build da imagem Docker.

---

## 🗂️ Estrutura do Repositório

```text
TorqueSpec/
├── apps/
│   ├── web/            # Painel Administrativo em Next.js (em breve)
│   └── mobile/         # App Mobile em React Native/Expo (em breve)
├── services/
│   └── api/            # core + auth + RAG (modular monolith)
│       ├── src/
│       │   ├── modules/    # auth, motorcycles, manuals, ingestion, rag, admin
│       │   ├── providers/  # conectores de LLM e embeddings (gemini, openai, ollama, fake)
│       │   ├── db/         # pool, migrations SQL
│       │   ├── server.ts   # processo HTTP
│       │   └── worker.ts   # processo da fila de ingestão
│       ├── scripts/        # seed, markdown → PDF
│       └── test/           # unitários e integração
├── packages/
│   └── shared-types/   # contratos/DTOs (Zod) usados por web, mobile e api
├── docs/
│   ├── architecture.md # diagrama + decisões (ADRs curtos)
│   ├── manuals/        # manual de exemplo (Markdown)
│   └── screenshots/
├── infrastructure/
│   └── docker-compose.yml
├── .github/workflows/  # CI: lint, testes, build
└── README.md
```

> Manuais em PDF não são versionados (`*.pdf` no `.gitignore`) por questões de direitos autorais; o manual de exemplo está em Markdown e é convertido em PDF pelo seed e pelos testes.
