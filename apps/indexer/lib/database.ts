import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { ensure } from './types.ts';

let pool: pg.Pool | undefined;
export function getIndexerPool(): pg.Pool {
  ensure(process.env.DATABASE_URL, 'database_not_configured');
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000, statement_timeout: 15000, application_name: 'manekineko-indexer' });
    attachDatabasePool(pool);
  }
  return pool;
}
