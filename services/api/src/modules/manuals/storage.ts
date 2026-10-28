import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Abstração de armazenamento: hoje disco local, amanhã S3/R2 sem tocar nos módulos. */
export interface FileStorage {
  save(stream: Readable, extension: string): Promise<{ key: string; size: number }>;
  read(key: string): Promise<Uint8Array>;
  readHeader(key: string, bytes: number): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  async save(stream: Readable, extension: string) {
    await mkdir(this.root, { recursive: true });
    // A chave é sempre gerada aqui: o nome enviado pelo cliente nunca vira caminho no disco.
    const key = `${randomUUID()}.${extension.replace(/[^a-z0-9]/gi, "")}`;
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
    });
    try {
      await pipeline(stream, createWriteStream(this.path(key)));
    } catch (error) {
      await this.remove(key); // não deixa arquivo parcial para trás (ex.: upload acima do limite)
      throw error;
    }
    return { key, size };
  }

  async read(key: string) {
    return new Uint8Array(await readFile(this.path(key)));
  }

  async readHeader(key: string, bytes: number) {
    const handle = await open(this.path(key), "r");
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }

  async remove(key: string) {
    await unlink(this.path(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  private path(key: string) {
    if (!/^[\w-]+\.\w+$/.test(key)) throw new Error(`chave de arquivo inválida: ${key}`);
    return join(this.root, key);
  }
}
