/**
 * The configuration a test needs to reach the validated app config.
 *
 * The suite runs without the app's `.env`, and Vite occupies `BASE_URL` as `/`
 * — not an origin, which `config`'s schema rejects. Any test that touches the
 * global `db` goes through `config.databaseUrl` and therefore through
 * `loadConfig()`, so a database-backed suite seeds the few required values it
 * does not otherwise provide. Everything else has a default.
 *
 * Idempotent and deliberately narrow: it fills a gap, it never overrides a
 * value a test set for itself (including a deliberately invalid one).
 */
export function seedTestConfigEnv(): void {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/quackback_test'
  if (!process.env.BASE_URL?.startsWith('http')) process.env.BASE_URL = 'http://localhost:3000'
  process.env.SECRET_KEY =
    process.env.SECRET_KEY || 'test-secret-key-for-the-suite-0123456789abcdef'
}
