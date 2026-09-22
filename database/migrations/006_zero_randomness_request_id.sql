-- Request status and NULL identify an absent request. A valid uint256 request
-- hash can be zero, so zero must not serve as an application/database sentinel.
BEGIN;

ALTER TABLE manekineko_collection_state
  DROP CONSTRAINT manekineko_collection_state_randomness_request_id_check,
  ADD CONSTRAINT manekineko_state_randomness_request_id_check CHECK (
    randomness_request_id BETWEEN 0 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935
  );

COMMIT;
