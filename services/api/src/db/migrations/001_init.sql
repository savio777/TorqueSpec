-- TorqueSpec — schema inicial

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Configuração de full-text em português que ignora acentos:
-- "oleo" encontra "óleo", "pressao" encontra "pressão".
CREATE TEXT SEARCH CONFIGURATION pt_unaccent (COPY = portuguese);
ALTER TEXT SEARCH CONFIGURATION pt_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'mechanic' CHECK (role IN ('admin', 'mechanic')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE motorcycles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand      text NOT NULL,
  model      text NOT NULL,
  year       integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand, model, year)
);

CREATE TABLE manuals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorcycle_id     uuid NOT NULL REFERENCES motorcycles (id) ON DELETE CASCADE,
  title             text NOT NULL,
  original_filename text NOT NULL,
  storage_key       text NOT NULL,
  file_size_bytes   bigint NOT NULL,
  page_count        integer,
  chunk_count       integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'indexed', 'failed')),
  progress          smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error             text,
  uploaded_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  indexed_at        timestamptz
);
CREATE INDEX manuals_motorcycle_id_idx ON manuals (motorcycle_id);

-- Cada fragmento pertence a uma única página: é isso que permite citar "pág. N".
CREATE TABLE manual_chunks (
  id             bigserial PRIMARY KEY,
  manual_id      uuid NOT NULL REFERENCES manuals (id) ON DELETE CASCADE,
  page_number    integer NOT NULL,
  chunk_index    integer NOT NULL,
  content        text NOT NULL,
  token_estimate integer NOT NULL,
  embedding      vector(768) NOT NULL,
  tsv            tsvector GENERATED ALWAYS AS (to_tsvector('pt_unaccent'::regconfig, content)) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manual_id, chunk_index)
);
CREATE INDEX manual_chunks_manual_page_idx ON manual_chunks (manual_id, page_number);
CREATE INDEX manual_chunks_tsv_idx ON manual_chunks USING gin (tsv);
CREATE INDEX manual_chunks_embedding_idx ON manual_chunks USING hnsw (embedding vector_cosine_ops);

-- Histórico de perguntas + base para métricas de consumo da LLM.
CREATE TABLE queries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES users (id) ON DELETE SET NULL,
  manual_id         uuid NOT NULL REFERENCES manuals (id) ON DELETE CASCADE,
  question          text NOT NULL,
  answer            text NOT NULL,
  grounded          boolean NOT NULL,
  citations         jsonb NOT NULL DEFAULT '[]'::jsonb,
  model             text NOT NULL,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  latency_ms        integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX queries_user_created_idx ON queries (user_id, created_at DESC);
CREATE INDEX queries_created_idx ON queries (created_at);
