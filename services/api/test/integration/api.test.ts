import type { AskResponse, Manual } from "@torquespec/shared-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManualsService } from "../../src/modules/manuals/manuals.service.js";
import { MotorcyclesService } from "../../src/modules/motorcycles/motorcycles.service.js";
import { bearer, createTestContext, login, multipart, sampleManualPdf, TEST_POSTGRES_URL, type TestContext } from "./helpers.js";

describe.skipIf(!TEST_POSTGRES_URL)("API (integração com Postgres + pgvector)", () => {
  let ctx: TestContext;
  let mechanicToken: string;
  let motorcycleId: string;
  let manual: Manual;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe("auth", () => {
    it("registra mecânico, autentica e devolve o perfil", async () => {
      const register = await ctx.app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { name: "Mecânico", email: "Mecanico@Oficina.com", password: "senha-segura" },
      });
      expect(register.statusCode).toBe(201);
      expect(register.json().user).toMatchObject({ email: "mecanico@oficina.com", role: "mechanic" });

      mechanicToken = await login(ctx.app, "mecanico@oficina.com", "senha-segura");
      const me = await ctx.app.inject({ method: "GET", url: "/v1/auth/me", headers: bearer(mechanicToken) });
      expect(me.json()).toMatchObject({ name: "Mecânico", role: "mechanic" });
    });

    it("recusa e-mail duplicado, senha errada e token inválido", async () => {
      const duplicate = await ctx.app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { name: "Outro", email: "mecanico@oficina.com", password: "senha-segura" },
      });
      expect(duplicate.statusCode).toBe(409);

      const wrong = await ctx.app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "mecanico@oficina.com", password: "errada" },
      });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json().error.code).toBe("UNAUTHORIZED");

      const invalid = await ctx.app.inject({ method: "GET", url: "/v1/auth/me", headers: bearer("x.y.z") });
      expect(invalid.statusCode).toBe(401);
    });

    it("valida o corpo com os schemas compartilhados", async () => {
      const response = await ctx.app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { name: "A", email: "nao-e-email", password: "123" },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("motos", () => {
    it("somente admin cadastra", async () => {
      const payload = { brand: "Yamaha", model: "XTZ 250 Lander (ABS) Blueflex", year: 2019 };
      const asMechanic = await ctx.app.inject({
        method: "POST",
        url: "/v1/motorcycles",
        headers: bearer(mechanicToken),
        payload,
      });
      expect(asMechanic.statusCode).toBe(403);

      const created = await ctx.app.inject({ method: "POST", url: "/v1/motorcycles", headers: bearer(ctx.adminToken), payload });
      expect(created.statusCode).toBe(201);
      motorcycleId = created.json().id;

      const duplicate = await ctx.app.inject({ method: "POST", url: "/v1/motorcycles", headers: bearer(ctx.adminToken), payload });
      expect(duplicate.statusCode).toBe(409);
    });

    it("lista e atualiza", async () => {
      const updated = await ctx.app.inject({
        method: "PATCH",
        url: `/v1/motorcycles/${motorcycleId}`,
        headers: bearer(ctx.adminToken),
        payload: { year: 2020 },
      });
      expect(updated.json()).toMatchObject({ year: 2020, manualCount: 0 });

      const list = await ctx.app.inject({ method: "GET", url: "/v1/motorcycles", headers: bearer(mechanicToken) });
      expect(list.json()).toHaveLength(1);
    });
  });

  describe("manuais", () => {
    it("rejeita arquivo que não é PDF e moto inexistente", async () => {
      const notPdf = multipart({ motorcycleId }, { name: "manual.pdf", type: "application/pdf", data: Buffer.from("olá") });
      const response = await ctx.app.inject({
        method: "POST",
        url: "/v1/manuals",
        headers: { ...bearer(ctx.adminToken), ...notPdf.headers },
        payload: notPdf.payload,
      });
      expect(response.statusCode).toBe(415);

      const pdf = await sampleManualPdf();
      const unknown = multipart(
        { motorcycleId: "00000000-0000-4000-8000-000000000000" },
        { name: "manual.pdf", type: "application/pdf", data: pdf },
      );
      const missing = await ctx.app.inject({
        method: "POST",
        url: "/v1/manuals",
        headers: { ...bearer(ctx.adminToken), ...unknown.headers },
        payload: unknown.payload,
      });
      expect(missing.statusCode).toBe(404);
    });

    it("rejeita PDF acima do limite", async () => {
      const big = new Uint8Array(1024 * 1024 + 10);
      big.set(Buffer.from("%PDF-1.7"));
      const body = multipart({ motorcycleId }, { name: "grande.pdf", type: "application/pdf", data: big });
      const response = await ctx.app.inject({
        method: "POST",
        url: "/v1/manuals",
        headers: { ...bearer(ctx.adminToken), ...body.headers },
        payload: body.payload,
      });
      expect(response.statusCode).toBe(413);
    });

    it("recebe o PDF, indexa e expõe os fragmentos", async () => {
      const body = multipart(
        { motorcycleId, title: "Manual de Serviço Lander 250" },
        { name: "lander.pdf", type: "application/pdf", data: await sampleManualPdf() },
      );
      const upload = await ctx.app.inject({
        method: "POST",
        url: "/v1/manuals",
        headers: { ...bearer(ctx.adminToken), ...body.headers },
        payload: body.payload,
      });
      expect(upload.statusCode).toBe(202);

      // Com a fila inline a ingestão já terminou; em produção o cliente faz polling em GET /manuals/:id.
      const detail = await ctx.app.inject({
        method: "GET",
        url: `/v1/manuals/${upload.json().id}`,
        headers: bearer(mechanicToken),
      });
      manual = detail.json();
      expect(manual).toMatchObject({ status: "indexed", progress: 100, pageCount: 10, title: "Manual de Serviço Lander 250" });
      expect(manual.chunkCount).toBeGreaterThan(10);

      const chunks = await ctx.app.inject({
        method: "GET",
        url: `/v1/manuals/${manual.id}/chunks?pageNumber=3&pageSize=50`,
        headers: bearer(ctx.adminToken),
      });
      expect(chunks.json().items.every((chunk: { pageNumber: number }) => chunk.pageNumber === 3)).toBe(true);
      expect(chunks.json().items.map((chunk: { content: string }) => chunk.content).join("\n")).toContain(
        "Porca do eixo da roda traseira: 4,6 kgf.m (46 N.m)",
      );
    });
  });

  describe("perguntas (RAG)", () => {
    const ask = (question: string, manualId = manual.id) =>
      ctx.app.inject({
        method: "POST",
        url: `/v1/manuals/${manualId}/ask`,
        headers: bearer(mechanicToken),
        payload: { question },
      });

    it("responde com o torque correto citando a página do manual", async () => {
      const response = await ask("Qual o torque de aperto da porca do eixo traseiro?");
      expect(response.statusCode).toBe(200);
      const body: AskResponse = response.json();
      expect(body.answer).toContain("4,6 kgf.m (46 N.m)");
      expect(body.grounded).toBe(true);
      expect(body.citations[0]).toMatchObject({ page: 3 });
      expect(body.citations[0]!.excerpt.length).toBeGreaterThan(0);
    });

    it("encontra termos técnicos exatos (busca lexical) sem depender de acentos", async () => {
      const body: AskResponse = (await ask("Qual a vela de ignicao? DR8EA")).json();
      expect(body.answer).toContain("NGK DR8EA-N");
      expect(body.citations.map((citation) => citation.page)).toContain(3);
    });

    it("não inventa quando o manual não cobre o assunto", async () => {
      const body: AskResponse = (await ask("Quem ganhou a Copa de 1970?")).json();
      expect(body.grounded).toBe(false);
      expect(body.citations).toEqual([]);
    });

    it("guarda o histórico do usuário e alimenta as métricas do painel", async () => {
      const history = await ctx.app.inject({ method: "GET", url: "/v1/queries", headers: bearer(mechanicToken) });
      expect(history.json().total).toBe(3);
      expect(history.json().items[0]).toMatchObject({ manualTitle: "Manual de Serviço Lander 250" });

      const stats = await ctx.app.inject({ method: "GET", url: "/v1/admin/stats", headers: bearer(ctx.adminToken) });
      expect(stats.statusCode).toBe(200);
      expect(stats.json()).toMatchObject({
        motorcycles: 1,
        manuals: { indexed: 1, pending: 0, processing: 0, failed: 0 },
        totalVectors: manual.chunkCount,
        totalQueries: 3,
      });
      expect(stats.json().usageLast30Days).toHaveLength(30);

      const forbidden = await ctx.app.inject({ method: "GET", url: "/v1/admin/stats", headers: bearer(mechanicToken) });
      expect(forbidden.statusCode).toBe(403);
    });

    it("recusa perguntas em manual que ainda não foi indexado", async () => {
      await ctx.db.query("UPDATE manuals SET status = 'processing' WHERE id = $1", [manual.id]);
      const response = await ask("Qual o torque?");
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("MANUAL_NOT_READY");
      await ctx.db.query("UPDATE manuals SET status = 'indexed' WHERE id = $1", [manual.id]);
    });
  });

  describe("consistência", () => {
    const brokenQueue = {
      enqueue: async () => {
        throw new Error("Redis indisponível");
      },
      close: async () => {},
    };
    const noStorage = { save: async () => ({ key: "", size: 0 }), read: async () => new Uint8Array(), readHeader: async () => new Uint8Array(), remove: async () => {} };

    it("não deixa manual órfão quando a fila está fora do ar", async () => {
      const service = new ManualsService(ctx.db, noStorage, brokenQueue);
      const data = { motorcycleId, title: "x", originalFilename: "x.pdf", storageKey: "orfao.pdf", fileSizeBytes: 1, uploadedBy: null as unknown as string };
      await expect(service.create(data)).rejects.toThrow("Redis indisponível");
      const { rowCount } = await ctx.db.query("SELECT 1 FROM manuals WHERE storage_key = 'orfao.pdf'");
      expect(rowCount).toBe(0);

      await expect(service.reindex(manual.id)).rejects.toThrow("Redis indisponível");
      expect((await service.get(manual.id)).status).toBe("failed");
      await ctx.db.query("UPDATE manuals SET status = 'indexed', error = NULL WHERE id = $1", [manual.id]);
    });

    it("responde 404 se a moto sumir entre a validação e o cadastro do manual", async () => {
      const service = new ManualsService(ctx.db, noStorage, brokenQueue);
      const data = { motorcycleId: "00000000-0000-4000-8000-000000000000", title: "x", originalFilename: "x.pdf", storageKey: "k.pdf", fileSizeBytes: 1, uploadedBy: null as unknown as string };
      await expect(service.create(data)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("remove a moto com seus manuais e devolve as chaves dos arquivos", async () => {
      const motorcycles = new MotorcyclesService(ctx.db);
      const other = await motorcycles.create({ brand: "Honda", model: "CB 500F", year: 2023 });
      await ctx.db.query(
        "INSERT INTO manuals (motorcycle_id, title, original_filename, storage_key, file_size_bytes) VALUES ($1, 't', 't.pdf', 'cb.pdf', 1)",
        [other.id],
      );
      expect(await motorcycles.remove(other.id)).toEqual(["cb.pdf"]);
      await expect(motorcycles.get(other.id)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("infra", () => {
    it("health, sugestões e OpenAPI", async () => {
      expect((await ctx.app.inject({ method: "GET", url: "/health" })).json()).toMatchObject({ status: "ok" });
      expect((await ctx.app.inject({ method: "GET", url: "/v1/suggestions" })).json()).toContainEqual(
        expect.objectContaining({ label: "Troca de óleo" }),
      );
      const openapi = await ctx.app.inject({ method: "GET", url: "/docs/json" });
      expect(Object.keys(openapi.json().paths)).toContain("/v1/manuals/{id}/ask");
    });

    it("libera PATCH e DELETE no preflight de CORS (painel web)", async () => {
      const preflight = await ctx.app.inject({
        method: "OPTIONS",
        url: "/v1/motorcycles/00000000-0000-0000-0000-000000000000",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "DELETE",
          "access-control-request-headers": "authorization",
        },
      });
      expect(preflight.statusCode).toBe(204);
      const methods = String(preflight.headers["access-control-allow-methods"]).split(",").map((method) => method.trim());
      expect(methods).toEqual(expect.arrayContaining(["PATCH", "DELETE"]));
    });

    it("remove manual (cascata nos fragmentos)", async () => {
      const removed = await ctx.app.inject({
        method: "DELETE",
        url: `/v1/manuals/${manual.id}`,
        headers: bearer(ctx.adminToken),
      });
      expect(removed.statusCode).toBe(204);
      const { rows } = await ctx.db.query("SELECT count(*)::int AS total FROM manual_chunks");
      expect(rows[0].total).toBe(0);
    });
  });
});
