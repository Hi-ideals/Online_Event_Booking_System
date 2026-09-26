-- Phase 2: categories, venues, seat layouts, events, ticket tiers, per-event seat inventory

CREATE TYPE event_status AS ENUM ('draft', 'published', 'sales_closed', 'completed', 'cancelled');
CREATE TYPE seating_type AS ENUM ('general', 'seated');
CREATE TYPE seat_status AS ENUM ('available', 'blocked', 'sold');

CREATE TABLE categories (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(60) NOT NULL,
  slug         VARCHAR(80) NOT NULL UNIQUE,
  description  VARCHAR(300),
  icon         VARCHAR(40),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX categories_name_unique ON categories (LOWER(name));
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE venues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(160) NOT NULL,
  address_line  VARCHAR(300) NOT NULL,
  city          VARCHAR(100) NOT NULL,
  state         VARCHAR(100),
  pincode       VARCHAR(10),
  country       VARCHAR(60) NOT NULL DEFAULT 'India',
  capacity      INT CHECK (capacity IS NULL OR capacity > 0),
  map_url       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX venues_organizer_idx ON venues (organizer_id);
CREATE INDEX venues_city_idx ON venues (LOWER(city));
CREATE TRIGGER venues_updated_at BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A reusable seat map for a venue. `definition` = { sections: [{ key, name, rows: [{ label, seats, blocked? }] }] }
CREATE TABLE seat_layouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name         VARCHAR(120) NOT NULL,
  definition   JSONB NOT NULL,
  total_seats  INT NOT NULL CHECK (total_seats > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venue_id, name)
);
CREATE TRIGGER seat_layouts_updated_at BEFORE UPDATE ON seat_layouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id          UUID NOT NULL REFERENCES users(id),
  category_id           INT NOT NULL REFERENCES categories(id),
  venue_id              UUID NOT NULL REFERENCES venues(id),
  seat_layout_id        UUID REFERENCES seat_layouts(id),
  title                 VARCHAR(200) NOT NULL,
  slug                  VARCHAR(240) NOT NULL UNIQUE,
  summary               VARCHAR(300),
  description           TEXT,
  banner_url            TEXT,
  tags                  TEXT[] NOT NULL DEFAULT '{}',
  start_at              TIMESTAMPTZ NOT NULL,
  end_at                TIMESTAMPTZ NOT NULL,
  status                event_status NOT NULL DEFAULT 'draft',
  seating_type          seating_type NOT NULL DEFAULT 'general',
  max_tickets_per_order INT NOT NULL DEFAULT 10 CHECK (max_tickets_per_order BETWEEN 1 AND 50),
  refund_allowed        BOOLEAN NOT NULL DEFAULT TRUE,
  refund_cutoff_hours   INT NOT NULL DEFAULT 24 CHECK (refund_cutoff_hours >= 0),
  refund_percent        INT NOT NULL DEFAULT 100 CHECK (refund_percent BETWEEN 0 AND 100),
  is_featured           BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked            BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_reason        TEXT,
  blocked_by            UUID REFERENCES users(id),
  blocked_at            TIMESTAMPTZ,
  published_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  cancellation_reason   TEXT,
  search_vector         TSVECTOR GENERATED ALWAYS AS (
                          setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
                          setweight(to_tsvector('english', COALESCE(summary, '')), 'B') ||
                          setweight(to_tsvector('english', COALESCE(description, '')), 'C')
                        ) STORED,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at),
  CHECK (seating_type = 'general' OR seat_layout_id IS NOT NULL OR status = 'draft')
);
CREATE INDEX events_public_idx ON events (status, start_at) WHERE is_blocked = FALSE;
CREATE INDEX events_organizer_idx ON events (organizer_id, created_at DESC);
CREATE INDEX events_category_idx ON events (category_id);
CREATE INDEX events_venue_idx ON events (venue_id);
CREATE INDEX events_search_idx ON events USING GIN (search_vector);
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ticket_tiers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           VARCHAR(80) NOT NULL,
  description    VARCHAR(500),
  price          NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  quantity       INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  sold_count     INT NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
  max_per_order  INT CHECK (max_per_order IS NULL OR max_per_order > 0),
  section_keys   TEXT[] NOT NULL DEFAULT '{}',
  sale_start_at  TIMESTAMPTZ,
  sale_end_at    TIMESTAMPTZ,
  sort_order     INT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sold_count <= quantity),
  CHECK (sale_end_at IS NULL OR sale_start_at IS NULL OR sale_end_at > sale_start_at)
);
CREATE UNIQUE INDEX ticket_tiers_name_unique ON ticket_tiers (event_id, LOWER(name));
CREATE TRIGGER ticket_tiers_updated_at BEFORE UPDATE ON ticket_tiers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Each seated event gets its own copy of seat inventory, generated from the layout at publish time.
CREATE TABLE event_seats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id      UUID NOT NULL REFERENCES ticket_tiers(id) ON DELETE CASCADE,
  section_key  VARCHAR(40) NOT NULL,
  row_label    VARCHAR(10) NOT NULL,
  seat_number  INT NOT NULL,
  seat_label   VARCHAR(60) NOT NULL,
  status       seat_status NOT NULL DEFAULT 'available',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, section_key, row_label, seat_number)
);
CREATE INDEX event_seats_tier_idx ON event_seats (tier_id, status);
CREATE TRIGGER event_seats_updated_at BEFORE UPDATE ON event_seats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO categories (name, slug, description, icon, sort_order) VALUES
  ('Music', 'music', 'Concerts, gigs and live music', 'music', 1),
  ('Comedy', 'comedy', 'Stand-up and comedy shows', 'smile', 2),
  ('Sports', 'sports', 'Matches, marathons and tournaments', 'trophy', 3),
  ('Theatre', 'theatre', 'Plays, musicals and performing arts', 'drama', 4),
  ('Workshops', 'workshops', 'Hands-on classes and training', 'wrench', 5),
  ('Conferences', 'conferences', 'Tech, business and academic conferences', 'presentation', 6),
  ('Festivals', 'festivals', 'Cultural and food festivals', 'party', 7),
  ('Exhibitions', 'exhibitions', 'Expos, art and trade shows', 'image', 8),
  ('Nightlife', 'nightlife', 'Club nights and parties', 'moon', 9),
  ('Kids & Family', 'kids-family', 'Events for children and families', 'users', 10);
