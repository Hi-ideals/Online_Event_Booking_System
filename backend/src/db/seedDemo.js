// Demo data for development: a demo organizer and attendee plus a dozen published events.
// Run with `npm run seed:demo`. Safe to run twice (skips if the demo organizer exists).
import bcrypt from 'bcryptjs';
import pool, { query } from '../config/db.js';
import * as events from '../modules/events/events.service.js';
import * as venues from '../modules/venues/venues.service.js';

const DEMO_PASSWORD = 'Demo@12345';
const ORGANIZER_EMAIL = 'organizer@demo.com';
const ATTENDEE_EMAIL = 'attendee@demo.com';

/** ISO time in India for `days` from today at hh:mm. */
function istAt(days, hh, mm = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const base = new Date(`${today}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`);
  return new Date(base.getTime() + days * 864e5).toISOString();
}

const rows = (labels, seats, blocked) => labels.split('').map((label) => ({ label, seats, ...(blocked && { blocked }) }));

const VENUES = {
  palace: { name: 'Palace Grounds', addressLine: 'Jayamahal Main Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560006', capacity: 20000 },
  chowdiah: { name: 'Chowdiah Memorial Hall', addressLine: '16th Cross, Malleshwaram', city: 'Bengaluru', state: 'Karnataka', pincode: '560003', capacity: 1100 },
  bic: { name: 'Bangalore International Centre', addressLine: 'Domlur 2nd Stage', city: 'Bengaluru', state: 'Karnataka', pincode: '560071', capacity: 400 },
  mysuru: { name: 'Mysuru Exhibition Grounds', addressLine: 'Doddakere Maidan', city: 'Mysuru', state: 'Karnataka', pincode: '570010', capacity: 15000 },
  rangayana: { name: 'Rangayana Bhoomigeetha', addressLine: 'Vinoba Road', city: 'Mysuru', state: 'Karnataka', pincode: '570005', capacity: 350 },
  mangaluru: { name: 'Panambur Beach Grounds', addressLine: 'Panambur', city: 'Mangaluru', state: 'Karnataka', pincode: '575010', capacity: 8000 },
  hubballi: { name: 'Gokul Garden Convention Centre', addressLine: 'Gokul Road', city: 'Hubballi', state: 'Karnataka', pincode: '580030', capacity: 1500 },
  mumbai: { name: 'NSCI Dome', addressLine: 'Lala Lajpat Rai Marg, Worli', city: 'Mumbai', state: 'Maharashtra', pincode: '400018', capacity: 8000 },
};

const EVENTS = [
  {
    title: 'Arijit Singh Live in Concert', category: 'music', venue: 'palace', start: [12, 18, 30], hours: 4, featured: true,
    layout: { name: 'Concert Arena', sections: [
      { key: 'PLAT', name: 'Platinum', rows: rows('ABC', 20, [10, 11]) },
      { key: 'GOLD', name: 'Gold', rows: rows('DEFGH', 24, [12, 13]) },
      { key: 'SILV', name: 'Silver', rows: rows('JKLMN', 28) },
    ] },
    tiers: [{ name: 'Platinum', price: 4999, sectionKeys: ['PLAT'] }, { name: 'Gold', price: 2499, sectionKeys: ['GOLD'] }, { name: 'Silver', price: 1299, sectionKeys: ['SILV'] }],
    summary: 'An unforgettable evening of soulful melodies with the voice of a generation.',
    description: 'Arijit Singh returns to Bengaluru with a two-and-a-half hour set spanning his biggest Bollywood hits and new independent releases, backed by a 20-piece live band.\n\nGates open at 5:00 PM. Food and beverage stalls available inside the venue. No outside food, cameras or umbrellas allowed.',
    tags: ['bollywood', 'live band', 'concert'], refundCutoffHours: 72, refundPercent: 75,
  },
  {
    title: 'Sunburn Arena ft. DJ Snake', category: 'nightlife', venue: 'mumbai', start: [20, 17], hours: 6, featured: true,
    tiers: [
      { name: 'Early Bird', price: 1499, quantity: 300, description: 'Limited early bird passes', saleEndDays: 5 },
      { name: 'General Admission', price: 1999, quantity: 2500 },
      { name: 'VIP Lounge', price: 4999, quantity: 200, description: 'Elevated viewing deck, express entry and lounge access', maxPerOrder: 4 },
    ],
    summary: "India's biggest electronic music festival brings DJ Snake to Mumbai.",
    description: 'Sunburn Arena is back with DJ Snake headlining a night of high-energy EDM, with supporting sets from the best Indian electronic artists.\n\nThis is a 18+ event. Valid government photo ID is mandatory for entry.',
    tags: ['edm', '18+', 'festival'], refundAllowed: false,
  },
  {
    title: 'Comedy Night with Zakir Khan', category: 'comedy', venue: 'chowdiah', start: [6, 20], hours: 2, featured: true,
    layout: { name: 'Main Auditorium', sections: [
      { key: 'FRONT', name: 'Front Stalls', rows: rows('ABCDE', 18, [9, 10]) },
      { key: 'REAR', name: 'Rear Stalls', rows: rows('FGHJK', 18, [9, 10]) },
      { key: 'BALC', name: 'Balcony', rows: rows('LM', 22) },
    ] },
    tiers: [{ name: 'Front Stalls', price: 1499, sectionKeys: ['FRONT'] }, { name: 'Rear Stalls', price: 999, sectionKeys: ['REAR'] }, { name: 'Balcony', price: 699, sectionKeys: ['BALC'] }],
    summary: 'Sakht launda is back with brand new stories and his trademark storytelling.',
    description: "Zakir Khan's new hour of stand-up about family, friendship and growing up in a small town. Language: Hindi.\n\nRecommended for ages 16 and above.",
    tags: ['stand-up', 'hindi'], refundCutoffHours: 48, refundPercent: 100,
  },
  {
    title: 'Mysuru Dasara Food & Culture Festival', category: 'festivals', venue: 'mysuru', start: [9, 11], hours: 10, featured: true,
    tiers: [{ name: 'Day Entry', price: 199, quantity: 5000 }, { name: 'Family Pass (4)', price: 599, quantity: 800, description: 'Entry for up to 4 family members' }],
    summary: 'Ten hours of Karnataka cuisine, folk performances and handicrafts.',
    description: 'Celebrate Dasara with over 80 food stalls from across Karnataka, Yakshagana and Dollu Kunitha performances, and a craft bazaar featuring Channapatna toys and Mysore silk.',
    tags: ['food', 'culture', 'family friendly'],
  },
  {
    title: 'Bengaluru Tech Summit 2026', category: 'conferences', venue: 'bic', start: [25, 9, 30], hours: 8,
    tiers: [{ name: 'Delegate Pass', price: 2999, quantity: 300, description: 'All talks, lunch and networking' }, { name: 'Student Pass', price: 499, quantity: 100, description: 'Valid student ID required at entry' }],
    summary: 'Talks and workshops on AI, cloud and startups from industry leaders.',
    description: 'A full day of keynotes, panel discussions and hands-on workshops on applied AI, cloud-native engineering and building startups in India.',
    tags: ['ai', 'startups', 'networking'], refundCutoffHours: 168, refundPercent: 90,
  },
  {
    title: 'Jokumaraswamy - Kannada Theatre', category: 'theatre', venue: 'rangayana', start: [15, 19], hours: 2,
    layout: { name: 'Bhoomigeetha Hall', sections: [
      { key: 'A', name: 'Stalls', rows: rows('ABCDEFG', 16, [8, 9]) },
    ] },
    tiers: [{ name: 'Stalls', price: 350, sectionKeys: ['A'] }],
    summary: "Chandrashekhar Kambar's classic folk play, staged by Rangayana.",
    description: 'A celebrated production of the Kannada folk play exploring power, desire and rural life, with live music.\n\nPerformed in Kannada with English surtitles.',
    tags: ['kannada', 'folk', 'drama'],
  },
  {
    title: 'Pottery Workshop for Beginners', category: 'workshops', venue: 'bic', start: [4, 10], hours: 3,
    tiers: [{ name: 'Workshop Seat', price: 1200, quantity: 20, maxPerOrder: 2, description: 'All materials included. Take home two pieces.' }],
    summary: 'Get your hands dirty on the wheel in this relaxed 3-hour class.',
    description: 'Learn centering, pulling and shaping on the pottery wheel with an experienced ceramic artist. Your pieces will be glazed and fired, ready for pickup in two weeks.',
    tags: ['hands-on', 'art', 'weekend'], maxTicketsPerOrder: 2,
  },
  {
    title: 'Mangaluru Coastal Marathon 2026', category: 'sports', venue: 'mangaluru', start: [35, 5, 30], hours: 5,
    tiers: [{ name: '5K Fun Run', price: 499, quantity: 1500 }, { name: '10K Run', price: 799, quantity: 1000 }, { name: 'Half Marathon', price: 1299, quantity: 600, description: 'Timing chip, medal and finisher tee' }],
    summary: 'Run along the Arabian Sea at sunrise. 5K, 10K and half marathon.',
    description: 'A scenic coastal route starting and finishing at Panambur Beach. All finishers receive a medal. Hydration stations every 2.5 km.',
    tags: ['running', 'fitness', 'beach'], refundCutoffHours: 240, refundPercent: 50,
  },
  {
    title: 'Kids Science Carnival', category: 'kids-family', venue: 'hubballi', start: [10, 10], hours: 7,
    tiers: [{ name: 'Child Entry', price: 299, quantity: 800, description: 'Ages 5-14' }, { name: 'Adult Entry', price: 99, quantity: 800 }],
    summary: 'Robots, rockets and slime labs for curious young minds.',
    description: 'Over 30 interactive science stations, a planetarium dome show every hour and live experiments with our science educators.',
    tags: ['kids', 'stem', 'family friendly'],
  },
  {
    title: 'Contemporary Indian Art Expo', category: 'exhibitions', venue: 'mumbai', start: [3, 11], hours: 9,
    tiers: [{ name: 'Free Entry', price: 0, quantity: 3000 }],
    summary: 'Works from 60 emerging Indian artists. Free entry with registration.',
    description: 'Paintings, sculpture and digital installations from emerging artists across India. Guided walkthroughs every two hours.',
    tags: ['art', 'free'],
  },
  {
    title: 'The Local Train - Indie Night', category: 'music', venue: 'mangaluru', start: [18, 19], hours: 3,
    tiers: [{ name: 'General Admission', price: 999, quantity: 2000 }, { name: 'Fan Pit', price: 1799, quantity: 300, description: 'Closest to the stage' }],
    summary: 'Hindi rock favourites live by the beach.',
    description: 'The Local Train performs songs from Aalas Ka Pedh, Vaaqif and Mehfooz with an opening act from the Mangaluru indie scene.',
    tags: ['rock', 'indie'], refundCutoffHours: 48, refundPercent: 100,
  },
  {
    title: 'Sunrise Yoga & Wellness Retreat', category: 'workshops', venue: 'mysuru', start: [7, 6], hours: 5,
    tiers: [{ name: 'Retreat Pass', price: 1499, quantity: 150, description: 'Yoga session, breathwork, satvik brunch' }],
    summary: 'A morning of Ashtanga yoga, breathwork and a satvik brunch.',
    description: 'Start your weekend with a guided Ashtanga session led by certified teachers from Mysuru, followed by pranayama and a wholesome brunch.',
    tags: ['yoga', 'wellness', 'morning'],
  },
];

async function main() {
  const existing = await query('SELECT id FROM users WHERE email = $1', [ORGANIZER_EMAIL]);
  if (existing.rowCount) {
    console.log('Demo data already exists. Skipping.');
    return;
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const { rows: [organizer] } = await query(
    `INSERT INTO users (name, email, password_hash, phone, role, status) VALUES ('Ravi Kumar', $1, $2, '9876543210', 'organizer', 'active') RETURNING id`,
    [ORGANIZER_EMAIL, hash]
  );
  await query(
    `INSERT INTO organizer_profiles (user_id, organization_name, contact_phone, city, gst_number, description, payout_details, reviewed_at)
     VALUES ($1, 'Namma Live Events', '9876543210', 'Bengaluru', '29ABCDE1234F1Z5', 'Concerts, comedy and cultural events across India.',
             '{"accountHolderName":"Namma Live Events","bankName":"Canara Bank","accountNumber":"1234567890","ifscCode":"CNRB0001234"}', NOW())`,
    [organizer.id]
  );
  await query(
    `INSERT INTO users (name, email, password_hash, phone, role, status) VALUES ('Asha Rao', $1, $2, '9123456780', 'attendee', 'active')`,
    [ATTENDEE_EMAIL, hash]
  );

  const { rows: categories } = await query('SELECT id, slug FROM categories');
  const categoryId = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  const venueIds = {};
  for (const [key, venue] of Object.entries(VENUES)) {
    venueIds[key] = (await venues.createVenue(organizer.id, venue)).id;
  }

  for (const e of EVENTS) {
    let seatLayoutId = null;
    if (e.layout) {
      const layout = await venues.createLayout(organizer.id, venueIds[e.venue], { name: e.layout.name, definition: { sections: e.layout.sections } });
      seatLayoutId = layout.id;
    }
    const [days, hh, mm] = e.start;
    const startAt = istAt(days, hh, mm);
    const created = await events.createEvent(organizer.id, {
      title: e.title,
      summary: e.summary,
      description: e.description,
      categoryId: categoryId[e.category],
      venueId: venueIds[e.venue],
      seatingType: e.layout ? 'seated' : 'general',
      seatLayoutId,
      startAt,
      endAt: new Date(new Date(startAt).getTime() + e.hours * 36e5).toISOString(),
      tags: e.tags ?? [],
      maxTicketsPerOrder: e.maxTicketsPerOrder ?? 10,
      refundAllowed: e.refundAllowed ?? true,
      refundCutoffHours: e.refundCutoffHours ?? 24,
      refundPercent: e.refundPercent ?? 100,
    });
    for (const [index, t] of e.tiers.entries()) {
      await events.createTier(organizer.id, created.id, {
        name: t.name,
        description: t.description,
        price: t.price,
        quantity: t.quantity,
        sectionKeys: t.sectionKeys,
        maxPerOrder: t.maxPerOrder,
        saleEndAt: t.saleEndDays ? istAt(t.saleEndDays, 23, 59) : undefined,
        sortOrder: index,
        isActive: true,
      });
    }
    await events.publishEvent(organizer.id, created.id);
    if (e.featured) await query('UPDATE events SET is_featured = TRUE WHERE id = $1', [created.id]);
    console.log(`  + ${e.title}`);
  }

  console.log(`\nDemo data created (${EVENTS.length} events).`);
  console.log(`  Organizer: ${ORGANIZER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Attendee:  ${ATTENDEE_EMAIL} / ${DEMO_PASSWORD}`);
}

try {
  await main();
} catch (err) {
  console.error('Demo seed failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
