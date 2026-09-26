-- Phase 3: orders, order items, inventory holds

CREATE TYPE order_status AS ENUM ('pending_payment', 'confirmed', 'expired', 'failed', 'cancelled');

-- Seats and general tickets can be temporarily held by a pending order.
ALTER TYPE seat_status ADD VALUE 'held';

ALTER TABLE ticket_tiers
  ADD COLUMN held_count INT NOT NULL DEFAULT 0 CHECK (held_count >= 0),
  DROP CONSTRAINT ticket_tiers_check,
  ADD CONSTRAINT ticket_tiers_inventory_check CHECK (sold_count + held_count <= quantity);

CREATE TABLE orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number         VARCHAR(20) NOT NULL UNIQUE,
  user_id              UUID NOT NULL REFERENCES users(id),
  event_id             UUID NOT NULL REFERENCES events(id),
  status               order_status NOT NULL DEFAULT 'pending_payment',
  ticket_count         INT NOT NULL CHECK (ticket_count > 0),
  subtotal             NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  fee_amount           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  total_amount         NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  currency             CHAR(3) NOT NULL DEFAULT 'INR',
  contact_name         VARCHAR(120) NOT NULL,
  contact_email        VARCHAR(255) NOT NULL,
  contact_phone        VARCHAR(20),
  expires_at           TIMESTAMPTZ NOT NULL,
  confirmed_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancellation_reason  TEXT,
  cancelled_by         UUID REFERENCES users(id),
  refund_amount        NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_event_status_idx ON orders (event_id, status);
CREATE INDEX orders_pending_expiry_idx ON orders (expires_at) WHERE status = 'pending_payment';
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tier_id        UUID NOT NULL REFERENCES ticket_tiers(id),
  event_seat_id  UUID REFERENCES event_seats(id),
  quantity       INT NOT NULL CHECK (quantity > 0),
  unit_price     NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  line_total     NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
  CHECK (event_seat_id IS NULL OR quantity = 1)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_seat_idx ON order_items (event_seat_id) WHERE event_seat_id IS NOT NULL;

-- The order currently holding or owning a seat.
ALTER TABLE event_seats ADD COLUMN order_id UUID REFERENCES orders(id);
CREATE INDEX event_seats_order_idx ON event_seats (order_id) WHERE order_id IS NOT NULL;
