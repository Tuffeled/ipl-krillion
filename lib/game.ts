// Client-safe: no dataset import here, so the 600 KB player file stays on the server.
export const TYPES = ['teammate', 'squad', 'pair', 'role', 'bowling', 'hand', 'season', 'journeyman'] as const;
const EVERY_CLIMB = 'teammate'; // always asked; the other 6 slots are 6 of the remaining 7 types
export type QuestionType = (typeof TYPES)[number];
export type Question = { type: QuestionType; id: string; prompt: string; hint: string; recent: boolean; dead: boolean };export type Verdict =
  | { correct: false; reason: string }
  | { correct: true; name: string; points: number; appearances: number; eligible: number };

export function dateKey() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

// One question of each type, in a seeded random order; same seed = same climb.
// 7 questions: always a teammate question plus 6 other types, one each.
// Per type, a coin flip picks recent (last 6 seasons) or any-season questions. Defunct teams only exist in the
// any-season half, so this alone halves how often they appear (30% → 15%, checked in scripts/answer_key.ts).
export function makeQuestions(pool: Question[], seed: string) {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  const rand = (k: number) => { n = (Math.imul(n, 1664525) + 1013904223) | 0; return (n >>> 0) % k; };
  const pick = (g: Question[]) => {
    const want = rand(2) === 0;
    const half = g.some(q => q.recent === want) ? g.filter(q => q.recent === want) : g;
    return half[rand(half.length)];
  };
  const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const types = [EVERY_CLIMB, ...shuffle(TYPES.filter(t => t !== EVERY_CLIMB)).slice(0, 6)];
  return shuffle(types.map(t => pool.filter(q => q.type === t)).filter(g => g.length).map(pick));
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function lev(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// "Did you mean" for the answer box. Order: nickname, start of the name, start of a later word ("dhoni"),
// then the closest spelling (whole name or one word, e.g. "dhony"). Searches every player, so it never hints at the answer.
export type Suggestion = { name: string; kind: 'complete' | 'fix' };
export function suggest(text: string, names: string[], aliases: Record<string, string>): Suggestion | null {
  const key = norm(text);
  if (key.length < 2) return null;
  const keys = names.map(n => [n, norm(n)] as const);
  if (keys.some(([, k]) => k === key)) return null; // already a full, correct name
  if (aliases[key]) return { name: aliases[key], kind: 'fix' };
  const shortest = (list: (readonly [string, string])[]) => list.sort((a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0]))[0]?.[0];
  const start = shortest(keys.filter(([, k]) => k.startsWith(key)));
  if (start) return { name: start, kind: norm(start).startsWith(key) && start.toLowerCase().startsWith(text.trimStart().toLowerCase()) ? 'complete' : 'fix' };
  if (key.length >= 3) {
    const word = shortest(keys.filter(([, k]) => k.split(' ').slice(1).some(w => w.startsWith(key))));
    if (word) return { name: word, kind: 'fix' };
    const nick = Object.keys(aliases).find(a => a.startsWith(key));
    if (nick) return { name: aliases[nick], kind: 'fix' };
  }
  if (key.length < 4) return null;
  const limit = key.length < 7 ? 1 : 2;
  let best: string | undefined, bestD = limit + 1;
  for (const [n, k] of keys) {
    const d = Math.min(lev(key, k), ...k.split(' ').map(w => lev(key, w) + (w === k ? 0 : .5)));
    if (d < bestD || (d === bestD && best && n.length < best.length)) { best = n; bestD = d; }
  }
  return best ? { name: best, kind: 'fix' } : null;
}

// Spec scoring: fewest IPL appearances = 1000 m, most = 100 m, ties share.
export function score(all: number[], mine: number) {
  if (all.length <= 1) return 1000;
  const fewer = all.filter(a => a < mine).length;
  return Math.round(100 + 900 * (1 - fewer / (all.length - 1)));
}
