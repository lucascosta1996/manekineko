/** Shared by the live repository and concurrency regressions against PostgreSQL. */
export const AFFILIATE_RATE_SQL = `INSERT INTO manekineko_affiliate_rate_limits(collection_id,scope,subject_hash,window_start,attempts)
  VALUES($1::uuid,$2,$3,date_bin(interval '10 minutes',now(),timestamptz '2000-01-01'),1)
  ON CONFLICT(collection_id,scope,subject_hash,window_start) DO UPDATE SET attempts=manekineko_affiliate_rate_limits.attempts+1
  WHERE manekineko_affiliate_rate_limits.attempts < $4 RETURNING attempts`;
export const AFFILIATE_CONSUME_SQL = `UPDATE manekineko_affiliate_challenges SET consumed_at=clock_timestamp()
  WHERE id=$1::uuid AND collection_id=$2::uuid AND wallet=$3 AND consumed_at IS NULL AND expires_at > clock_timestamp()`;
