// Хранилище «ключ → JSON-строка» с TTL — абстракция над БД, повторяющая тот
// минимум Cloudflare KV, что реально используется приложением: get / put /
// delete. Рантайм-независимо: ниже реализация на Postgres, но интерфейс
// позволяет подменить бэкенд (Redis/SQLite/иное), не трогая маршруты в index.ts.

import { Pool } from 'pg';

export interface Store {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// Одна таблица «ключ-значение» с необязательным сроком жизни. expires_at = NULL
// — вечный ключ (роли, профили, график, продажи, оргструктура). Не-NULL — сессии,
// коды входа, заявки на свап (как expirationTtl в KV).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS kv_expires_at_idx ON kv (expires_at) WHERE expires_at IS NOT NULL;
`;

export class PgStore implements Store {
  private constructor(private pool: Pool) {}

  // Создаёт пул, проверяет соединение и накатывает схему (идемпотентно).
  // ssl=true — для управляемого Postgres (Supabase/RDS и т.п.), который требует
  // TLS. rejectUnauthorized:false — не проверяем CA провайдера (трафик всё равно
  // шифруется); достаточно для подключения без подкладывания сертификата.
  static async create(connectionString: string, opts?: { ssl?: boolean }): Promise<PgStore> {
    const pool = new Pool({
      connectionString,
      ...(opts?.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    await pool.query(SCHEMA);
    return new PgStore(pool);
  }

  async get(key: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ value: string }>(
      'SELECT value FROM kv WHERE key = $1 AND (expires_at IS NULL OR expires_at > now())',
      [key],
    );
    return rows.length ? rows[0].value : null;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    const ttl = opts?.expirationTtl;
    const expiresAt = ttl && ttl > 0 ? new Date(Date.now() + ttl * 1000) : null;
    await this.pool.query(
      `INSERT INTO kv (key, value, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [key, value, expiresAt],
    );
  }

  async delete(key: string): Promise<void> {
    await this.pool.query('DELETE FROM kv WHERE key = $1', [key]);
  }

  // Чистка протухших ключей (в KV это делалось автоматически). Возвращает кол-во.
  async sweepExpired(): Promise<number> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at <= now()',
    );
    return rowCount ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
