-- Phase 5: QR check-in at the gate

CREATE TYPE check_in_result AS ENUM (
  'checked_in', 'already_checked_in', 'cancelled', 'wrong_event', 'invalid', 'not_open', 'undone'
);
CREATE TYPE check_in_method AS ENUM ('qr', 'code', 'offline_sync', 'manual_undo');

ALTER TABLE tickets
  ADD COLUMN checked_in_at    TIMESTAMPTZ,
  ADD COLUMN checked_in_by    UUID REFERENCES users(id),
  ADD COLUMN check_in_gate    VARCHAR(60);
CREATE INDEX tickets_checked_in_idx ON tickets (event_id, checked_in_at) WHERE checked_in_at IS NOT NULL;

-- Every scan attempt, successful or not, for auditing and gate statistics.
CREATE TABLE check_in_logs (
  id          BIGSERIAL PRIMARY KEY,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_id   UUID REFERENCES tickets(id),
  scanned_by  UUID REFERENCES users(id),
  gate        VARCHAR(60),
  method      check_in_method NOT NULL,
  result      check_in_result NOT NULL,
  note        TEXT,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX check_in_logs_event_idx ON check_in_logs (event_id, scanned_at DESC);
CREATE INDEX check_in_logs_ticket_idx ON check_in_logs (ticket_id);
