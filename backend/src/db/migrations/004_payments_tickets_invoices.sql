-- Phase 4: payments, webhook log, tickets, invoices, refunds, commission

CREATE TYPE payment_status AS ENUM ('created', 'captured', 'failed');
CREATE TYPE ticket_status AS ENUM ('valid', 'cancelled');
CREATE TYPE refund_status AS ENUM ('pending', 'processed', 'failed');
CREATE TYPE refund_type AS ENUM ('attendee_cancellation', 'event_cancellation', 'late_payment', 'admin');

-- Platform-wide settings (admin-managed). Commission is the platform's share of ticket sales.
CREATE TABLE platform_settings (
  key         VARCHAR(60) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_settings (key, value) VALUES ('commission_percent', '10');

-- Optional per-organizer commission override.
ALTER TABLE organizer_profiles ADD COLUMN commission_percent NUMERIC(5, 2) CHECK (commission_percent BETWEEN 0 AND 100);

-- Commission rate locked in when the order is confirmed.
ALTER TABLE orders ADD COLUMN commission_percent NUMERIC(5, 2);

CREATE TABLE payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES orders(id),
  provider             VARCHAR(20) NOT NULL,
  provider_order_id    VARCHAR(64) NOT NULL UNIQUE,
  provider_payment_id  VARCHAR(64) UNIQUE,
  amount               NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency             CHAR(3) NOT NULL DEFAULT 'INR',
  status               payment_status NOT NULL DEFAULT 'created',
  method               VARCHAR(30),
  failure_reason       TEXT,
  captured_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every webhook received, so duplicates are ignored and events can be audited.
CREATE TABLE payment_webhook_events (
  id            BIGSERIAL PRIMARY KEY,
  provider      VARCHAR(20) NOT NULL,
  event_id      VARCHAR(100) NOT NULL,
  event_type    VARCHAR(60) NOT NULL,
  payload       JSONB NOT NULL,
  processed_at  TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, event_id)
);

CREATE TABLE tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code     VARCHAR(20) NOT NULL UNIQUE,
  order_id        UUID NOT NULL REFERENCES orders(id),
  order_item_id   UUID NOT NULL REFERENCES order_items(id),
  event_id        UUID NOT NULL REFERENCES events(id),
  tier_id         UUID NOT NULL REFERENCES ticket_tiers(id),
  event_seat_id   UUID REFERENCES event_seats(id),
  attendee_name   VARCHAR(120) NOT NULL,
  status          ticket_status NOT NULL DEFAULT 'valid',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX tickets_order_idx ON tickets (order_id);
CREATE INDEX tickets_event_idx ON tickets (event_id, status);
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Gapless invoice numbering per Indian financial year (April-March).
CREATE TABLE invoice_sequences (
  financial_year  VARCHAR(7) PRIMARY KEY,
  last_number     INT NOT NULL DEFAULT 0
);

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  VARCHAR(30) NOT NULL UNIQUE,
  order_id        UUID NOT NULL UNIQUE REFERENCES orders(id),
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id),
  payment_id          UUID NOT NULL REFERENCES payments(id),
  type                refund_type NOT NULL,
  amount              NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  reason              TEXT,
  status              refund_status NOT NULL DEFAULT 'pending',
  provider_refund_id  VARCHAR(64) UNIQUE,
  attempts            INT NOT NULL DEFAULT 0,
  failure_reason      TEXT,
  initiated_by        UUID REFERENCES users(id),
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX refunds_order_idx ON refunds (order_id);
CREATE INDEX refunds_pending_idx ON refunds (created_at) WHERE status = 'pending';
CREATE TRIGGER refunds_updated_at BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
