import type { RegisterInput, User, UserRole } from "@torquespec/shared-types";
import { compare, hash } from "bcryptjs";
import type { Queryable } from "../../db/pool.js";
import { isUniqueViolation } from "../../db/errors.js";
import { conflict, notFound, unauthorized } from "../../lib/errors.js";

const BCRYPT_ROUNDS = 12;
// Hash de uma senha aleatória: comparar contra ele quando o e-mail não existe
// mantém o tempo de resposta do login igual, sem revelar quais e-mails estão cadastrados.
const DUMMY_HASH = "$2b$12$Pz8WUzHVVCSQmZx68Gn7Fetj.fXQCdKDH6cZd7AZLxEx.hcregk5m";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  password_hash: string;
  created_at: Date;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  createdAt: row.created_at.toISOString(),
});

export class AuthService {
  constructor(private readonly db: Queryable) {}

  async register(input: RegisterInput, role: UserRole = "mechanic"): Promise<User> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *`,
        [input.name, input.email, await hash(input.password, BCRYPT_ROUNDS), role],
      );
      return toUser(rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("E-mail já cadastrado");
      throw error;
    }
  }

  async authenticate(email: string, password: string): Promise<User> {
    const { rows } = await this.db.query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
    const row = rows[0];
    const valid = await compare(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !valid) throw unauthorized("E-mail ou senha inválidos");
    return toUser(row);
  }

  async findById(id: string): Promise<User> {
    const { rows } = await this.db.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
    if (!rows[0]) throw notFound("Usuário");
    return toUser(rows[0]);
  }

  /** Cria (ou promove/atualiza a senha de) um administrador. Usado pelo seed. */
  async ensureAdmin(input: RegisterInput): Promise<User> {
    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash
       RETURNING *`,
      [input.name, input.email, await hash(input.password, BCRYPT_ROUNDS)],
    );
    return toUser(rows[0]!);
  }
}
