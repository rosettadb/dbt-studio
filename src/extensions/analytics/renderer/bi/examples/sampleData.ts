/**
 * Deterministic sample data for the example dashboards. Generated from a
 * fixed seed so every user sees the same numbers, with no connection needed.
 */

/* eslint-disable no-bitwise -- unsigned 32-bit arithmetic for a seeded PRNG */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pick = <T>(r: () => number, items: T[], weights?: number[]): T => {
  if (!weights) return items[Math.floor(r() * items.length)];
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < items.length; i += 1) {
    x -= weights[i];
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Data covers 2025-11-01 .. 2026-10-31. */
export const SAMPLE_START = '2025-11-01';
export const SAMPLE_END = '2026-10-31';

function eachDay(fn: (day: Date, index: number) => void) {
  const start = new Date(`${SAMPLE_START}T00:00:00Z`);
  const end = new Date(`${SAMPLE_END}T00:00:00Z`);
  for (
    let d = new Date(start), i = 0;
    d <= end;
    d.setUTCDate(d.getUTCDate() + 1), i += 1
  ) {
    fn(new Date(d), i);
  }
}

// ── Orders ─────────────────────────────────────────────────────────────────
export interface OrderRow {
  order_date: string;
  region: string;
  channel: string;
  category: string;
  customer: string;
  revenue: number;
  cost: number;
}

export const REGIONS = [
  'North America',
  'Europe',
  'Asia Pacific',
  'Latin America',
];
export const CHANNELS = ['Web', 'Store', 'Partner'];
export const CATEGORIES = ['Hardware', 'Software', 'Services', 'Accessories'];
const CUSTOMERS = [
  'Acme Corp',
  'Globex',
  'Initech',
  'Umbrella',
  'Hooli',
  'Stark Industries',
  'Wayne Enterprises',
  'Wonka Industries',
  'Soylent',
  'Tyrell',
  'Cyberdyne',
  'Aperture',
  'Vandelay',
  'Pied Piper',
  'Massive Dynamic',
  'Oscorp',
  'Gringotts',
  'Monarch',
  'Dunder Mifflin',
  'Prestige Worldwide',
];

let ordersCache: OrderRow[] | null = null;

export function sampleOrders(): OrderRow[] {
  if (ordersCache) return ordersCache;
  const r = rng(97);
  const rows: OrderRow[] = [];
  eachDay((day, i) => {
    const trend = 1 + i / 365; // steady growth over the year
    const weekday = day.getUTCDay();
    const n = Math.round(
      (weekday === 0 || weekday === 6 ? 5 : 9) * trend + r() * 4,
    );
    for (let k = 0; k < n; k += 1) {
      const category = pick(r, CATEGORIES, [3, 4, 2, 2]);
      const base = {
        Hardware: 900,
        Software: 650,
        Services: 1400,
        Accessories: 120,
      }[category]!;
      const revenue = round2(base * (0.4 + r() * 1.2));
      const margin = {
        Hardware: 0.32,
        Software: 0.78,
        Services: 0.45,
        Accessories: 0.55,
      }[category]!;
      rows.push({
        order_date: iso(day),
        region: pick(r, REGIONS, [5, 4, 3, 1.5]),
        channel: pick(r, CHANNELS, [5, 3, 2]),
        category,
        customer: pick(r, CUSTOMERS),
        revenue,
        cost: round2(revenue * (1 - margin) * (0.9 + r() * 0.2)),
      });
    }
  });
  ordersCache = rows;
  return rows;
}

// ── Support tickets ────────────────────────────────────────────────────────
export interface TicketRow {
  created_date: string;
  priority: string;
  channel: string;
  agent: string;
  category: string;
  resolution_hours: number | null;
  csat: number | null;
  status: string;
}

export const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];
const AGENTS = ['Ana', 'Ben', 'Chen', 'Dara', 'Eli', 'Fatima', 'Goran', 'Hana'];
const TICKET_CATEGORIES = [
  'Billing',
  'Login',
  'Bug',
  'How-to',
  'Feature request',
];

let ticketsCache: TicketRow[] | null = null;

export function sampleTickets(): TicketRow[] {
  if (ticketsCache) return ticketsCache;
  const r = rng(2026);
  const rows: TicketRow[] = [];
  const end = new Date(`${SAMPLE_END}T00:00:00Z`).getTime();
  eachDay((day) => {
    const weekday = day.getUTCDay();
    const n = (weekday === 0 || weekday === 6 ? 6 : 18) + Math.floor(r() * 8);
    for (let k = 0; k < n; k += 1) {
      const priority = pick(r, PRIORITIES, [1, 3, 8, 4]);
      const speed = { Urgent: 4, High: 12, Normal: 30, Low: 60 }[priority]!;
      const ageDays = (end - day.getTime()) / 86400000;
      const open = ageDays < 10 && r() < 0.6 - ageDays * 0.05;
      const hours = open
        ? null
        : Math.round(speed * (0.3 + r() * 1.6) * 10) / 10;
      const csat =
        open || r() < 0.35
          ? null
          : Math.max(
              1,
              Math.min(5, Math.round(5 - (hours ?? 0) / 40 - r() * 1.6)),
            );
      rows.push({
        created_date: iso(day),
        priority,
        channel: pick(r, ['Email', 'Chat', 'Phone'], [5, 4, 1]),
        agent: pick(r, AGENTS),
        category: pick(r, TICKET_CATEGORIES, [3, 2, 3, 4, 1]),
        resolution_hours: hours,
        csat,
        status: open ? 'Open' : 'Solved',
      });
    }
  });
  ticketsCache = rows;
  return rows;
}

// ── Product accounts ───────────────────────────────────────────────────────
export interface AccountRow {
  account: string;
  plan: string;
  signup_month: string;
  seats: number;
  weekly_active_users: number;
  sessions_per_user: number;
  mrr: number;
  uses_reports: boolean;
  uses_alerts: boolean;
  uses_api: boolean;
  churned: boolean;
}

export const PLANS = ['Free', 'Starter', 'Growth', 'Enterprise'];

let accountsCache: AccountRow[] | null = null;

export function sampleAccounts(): AccountRow[] {
  if (accountsCache) return accountsCache;
  const r = rng(4242);
  const rows: AccountRow[] = [];
  const syllables = [
    'zen',
    'lu',
    'ka',
    'tor',
    'mi',
    'ra',
    'vo',
    'nex',
    'pi',
    'sol',
    'qua',
    'bri',
  ];
  for (let i = 0; i < 420; i += 1) {
    const plan = pick(r, PLANS, [5, 4, 2.5, 1]);
    const seats = { Free: 3, Starter: 10, Growth: 40, Enterprise: 180 }[plan]!;
    const s = Math.max(1, Math.round(seats * (0.5 + r())));
    const engagement = 0.25 + r() * 0.7;
    const month = new Date(Date.UTC(2025, 10 + Math.floor(r() * 12), 1));
    const price = { Free: 0, Starter: 12, Growth: 25, Enterprise: 40 }[plan]!;
    const wau = Math.round(s * engagement);
    let suffix = '';
    if (i % 7 === 0) suffix = ' Labs';
    else if (i % 5 === 0) suffix = ' Inc';
    rows.push({
      account: `${pick(r, syllables)}${pick(r, syllables)}${suffix}`.replace(
        /^./,
        (c) => c.toUpperCase(),
      ),
      plan,
      signup_month: iso(month),
      seats: s,
      weekly_active_users: wau,
      sessions_per_user: Math.round((2 + engagement * 12 + r() * 3) * 10) / 10,
      mrr: price * s,
      uses_reports: r() < 0.3 + engagement * 0.6,
      uses_alerts: r() < 0.15 + engagement * 0.5,
      uses_api: plan === 'Enterprise' ? r() < 0.8 : r() < 0.15,
      churned: r() < 0.22 - engagement * 0.2,
    });
  }
  accountsCache = rows;
  return rows;
}

// ── Tiny query helpers used by the example resolvers ──────────────────────
export type Row = Record<string, unknown>;

export function groupBy<T>(
  rows: T[],
  keyFn: (row: T) => string,
  aggregate: (group: T[], key: string) => Row,
): Row[] {
  const groups = new Map<string, T[]>();
  rows.forEach((row) => {
    const k = keyFn(row);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(row);
  });
  return Array.from(groups, ([k, g]) => aggregate(g, k));
}

export const sum = <T>(rows: T[], fn: (row: T) => number | null) =>
  round2(rows.reduce((a, row) => a + (fn(row) ?? 0), 0));

export const avg = <T>(rows: T[], fn: (row: T) => number | null) => {
  const values = rows.map(fn).filter((v): v is number => v !== null);
  return values.length
    ? round2(values.reduce((a, b) => a + b, 0) / values.length)
    : null;
};

export const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

/** SQL LIKE with % wildcards, case-sensitive like most warehouses. */
export function like(value: string, pattern: string): boolean {
  const re = new RegExp(
    `^${pattern
      .split('%')
      .map((part) =>
        part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.'),
      )
      .join('.*')}$`,
  );
  return re.test(value);
}

export { round2 };
