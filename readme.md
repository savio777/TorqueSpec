# ⚙️ TorqueSpec — RAG Copilot para Manuais Técnicos

O **TorqueSpec** é uma aplicação completa de RAG (_Retrieval-Augmented Generation_) projetada para consultar especificações técnicas, torques de aperto e procedimentos de manutenção em manuais automotivos e industriais complexos.

A plataforma combina uma **interface Web administrativa** para ingestão e indexação de manuais em PDF com um **aplicativo Mobile** focado na consulta rápida e precisa por mecânicos e entusiastas.

---

## 🎯 Problema que Resolve

Manuais de oficina possuem centenas de páginas e dezenas de megabytes com dados críticos (tabelas de torque, esquemas elétricos e especificações de fluidos). Encontrar uma informação específica durante um procedimento manual consome tempo e pode levar a erros de manutenção.

O TorqueSpec permite perguntas em linguagem natural e entrega **respostas exatas acompanhadas da citação da página original do manual**.

---

## 🛠️ Arquitetura & Tecnologias

### Backend & RAG Engine

- **Linguagem / Runtime:** Node.js (TypeScript) / Python (FastAPI)
- **LLM & Embeddings:** Google AI Studio (Gemini 1.5 Flash / Pro) + `nomic-embed-text` (deve ter conector para poder utilizar uma LLM diferente)
- **Vector Database:** PostgreSQL com extensão `pgvector`
- **Busca Híbrida:** Combinação de Busca Vetorial (similaridade de cosseno) com Full-Text Search (BM25)
- **Processamento Assíncrono:** Redis + BullMQ para _chunking_ e geração de embeddings em segundo plano
- **ENV Variables:** Configuração de variáveis de ambiente para conexão com PostgreSQL, Redis e credenciais da LLM (ex.: `POSTGRES_URL`, `REDIS_URL`, `LLM_API_KEY`)

### Frontend & Mobile

- **Painel Web (Admin):** Next.js / React + Tailwind CSS
- **App Mobile:** React Native (Expo) com suporte a _Dark Mode_ nativo

---

## 🚀 Funcionalidades Principais

- 📄 **Ingestão Inteligente de PDFs:** Upload e segmentação semântica (_chunking_) de manuais de até 100 MB.
- 🔍 **Busca de Alta Precisão:** Identificação rápida de torques ($N\cdot m$), capacidades de óleos e folgas de válvulas.
- 📌 **Citação de Fontes:** Respostas com indicação exata da página do manual para verificação imediata.
- 🚀 **Sugestões Rápidas (Chips):** Atalhos para buscas recorrentes (_Troca de óleo_, _Esquema elétrico_, _Aperto de parafusos_).

---

## 🗂️ Estrutura do Repositório

```text
TorqueSpec/
├── apps/
│   ├── web/            # Painel Administrativo em Next.js
│   └── mobile/         # App Mobile em React Native (Expo)
├── services/
│   ├── api/            # core + auth num só (modular monolith)
│   └── ai-engine/      # RAG isolado, com justificativa
├── packages/
│   ├── shared-types/   # contratos/DTOs usados por web, mobile e api
│   └── api-client/
├── docs/
│   ├── architecture.md # diagrama + decisões (ADRs curtos)
│   └── screenshots/
├── infrastructure/
│   └── docker-compose.yml
├── .github/workflows/  # CI: lint, testes, build
└── README.md
```
