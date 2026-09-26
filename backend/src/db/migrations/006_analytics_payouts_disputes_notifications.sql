-- Phase 6: organizer payouts, refund requests (disputes), email outbox

CREATE TYPE payout_status AS ENUM ('pending', 'paid');
CREATE TYPE refund_request_status AS ENUM ('open', 'approved', 'rejected');
CREATE TYPE email_status AS ENUM ('queued', 'sent', 'failed');

-- One payout per completed event, owed to the organizer after commission and refunds.
CREATE TABLE payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    UUID NOT NULL REFERENCES users(id),
  event_id        UUID NOT NULL UNIQUE REFERENCES events(id),
  gross_sales     NUMERIC(12, 2) NOT NULL,
  refunds         NUMERIC(12, 2) NOT NULL,
  commission      NUMERIC(12, 2) NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status          payout_status NOT NULL DEFAULT 'pending',
  payout_details  JSONB NOT NULL DEFAULT '{}'::jsonb,
  reference       VARCHAR(100),
  notes           TEXT,
  paid_by         UUID REFERENCES users(id),
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX payouts_organizer_idx ON payouts (organizer_id, created_at DESC);
CREATE TRIGGER payouts_updated_at BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Attendee refund requests outside the automatic cancellation policy, resolved by an admin.
CREATE TABLE refund_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  reason        TEXT NOT NULL,
  status        refund_request_status NOT NULL DEFAULT 'open',
  admin_note    TEXT,
  refund_id     UUID REFERENCES refunds(id),
  resolved_by   UUID REFERENCES users(id),
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX refund_requests_one_open_per_order ON refund_requests (order_id) WHERE status = 'open';
CREATE INDEX refund_requests_status_idx ON refund_requests (status, created_at);
CREATE TRIGGER refund_requests_updated_at BEFORE UPDATE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Transactional outbox: emails are queued in the same transaction as the change that triggers them.
CREATE TABLE email_outbox (
  id          BIGSERIAL PRIMARY KEY,
  template    VARCHAR(60) NOT NULL,
  to_email    VARCHAR(255) NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key  VARCHAR(200) UNIQUE,
  status      email_status NOT NULL DEFAULT 'queued',
  subject     TEXT,
  attempts    INT NOT NULL DEFAULT 0,
  error       TEXT,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX email_outbox_queued_idx ON email_outbox (created_at) WHERE status = 'queued';
