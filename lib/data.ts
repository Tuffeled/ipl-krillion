import players from '../data/players.json';
import aliasFile from '../data/aliases.json';
import { lev, norm, score, type Question, type QuestionType, type Verdict } from './game';

type Player = { name: string; appearances: number | null; role?: string; batting?: string; bowling?: string; teams: { team: string; years: string[] }[] };
const ALIAS: Record<string, string> = { 'Rising Pune Supergiants': 'Rising Pune Supergiant' };
const lastYear = Math.max(...(players as Player[]).flatMap(p => p.teams.flatMap(t => t.years.map(Number))));
const SINCE = lastYear - 5; // "last 6 years of IPL", e.g. 2021–2026
const DEAD = new Set(['Deccan Chargers', 'Kochi Tuskers Kerala', 'Pune Warriors', 'Gujarat Lions', 'Rising Pune Supergiant']);
const roster = (players as Player[]).map(p => {
  const stints = p.teams.map(t => ({ team: ALIAS[t.team] ?? t.team, years: t.years }));
  return {
    name: p.name, key: norm(p.name), apps: p.appearances, role: p.role ?? '', batting: p.batting ?? '', bowling: p.bowling ?? '',
    teams: new Set(stints.map(s => s.team)),
    recentTeams: new Set(stints.filter(s => s.years.some(y => +y >= SINCE)).map(s => s.team)),
    seasons: new Set(stints.flatMap(s => s.years.map(y => s.team + '|' + y))),
  };
});
type P = (typeof roster)[number];
const teams = [...new Set(roster.flatMap(p => [...p.teams]))].sort();
const years = [...new Set(roster.flatMap(p => [...p.seasons].map(s => s.split('|')[1])))].sort();
const slug = (t: string) => norm(t).replace(/ /g, '-');

type Q = Question & { test: (p: P) => boolean };
const RARITY = 'NICHEST ANSWER = LONGER HIT';

// Filters from the agreed design; mixed bowling styles match every group they contain.
const ROLES: [string, string, RegExp][] = [['wicketkeeper', 'wicketkeeper', /Wicketkeeper/], ['bowler', 'specialist bowler', /^Bowler$/], ['allrounder', 'allrounder', /Allrounder/], ['batter', 'specialist batter', /^(?!Wicketkeeper).*Batter$/]];
const BOWLING: [string, string, RegExp][] = [['right-pace', 'right-arm pace bowler', /Right arm (Fast|Medium)/], ['left-pace', 'left-arm pace bowler', /Left arm (Fast|Medium)/], ['finger-spin', 'finger spinner (off-break or left-arm orthodox)', /Offbreak|Orthodox/], ['wrist-spin', 'wrist spinner (leg-break, googly or left-arm wrist spin)', /Legbreak|Wrist spin/]];

// Each team question comes in two versions: any season, and recent (squad membership since SINCE only).
const all: Q[] = [false, true].flatMap(recent => teams.flatMap((t, i) => {
  const set = (p: P) => recent ? p.recentTeams : p.teams;
  const on = (p: P) => set(p).has(t);
  const id = (s: string) => s + (recent ? '--since-' + SINCE : '');
  const squad = recent ? ' squad since ' + SINCE : ' squad';
  const hint = (recent ? SINCE + '–' + lastYear + ' SEASONS · ' : 'ANY SEASON · ') + RARITY;
  const q = (type: QuestionType, qid: string, prompt: string, test: (p: P) => boolean, names = [t], h = hint, isRecent = recent): Q =>
    ({ type, id: id(qid), prompt, hint: h, recent: isRecent, dead: names.some(n => DEAD.has(n)), test });
  const franchises = (k: number) => q('journeyman', slug(t) + '--' + k + '-franchises', 'Name a player from a ' + t + squad + ' who played for ' + k + '+ IPL franchises', p => on(p) && p.teams.size >= k);
  return [
    q('squad', slug(t), 'Name a player from a ' + t + squad, on),
    ...teams.slice(i + 1).map(b => q('pair', slug(t) + '--' + slug(b), 'Name a player who was in both ' + t + ' and ' + b + ' squads' + (recent ? ' since ' + SINCE : ''), p => on(p) && set(p).has(b), [t, b])),
    ...ROLES.map(([rid, label, re]) => q('role', slug(t) + '--' + rid, 'Name ' + (/^[aeiou]/i.test(label) ? 'an ' : 'a ') + label + ' from a ' + t + squad, p => on(p) && re.test(p.role))),
    ...BOWLING.map(([bid, label, re]) => q('bowling', slug(t) + '--' + bid, 'Name ' + (/^[aeiou]/i.test(label) ? 'an ' : 'a ') + label + ' from a ' + t + squad, p => on(p) && re.test(p.bowling))),
    q('hand', slug(t) + '--left-handed', 'Name a left-handed batter from a ' + t + squad, p => on(p) && p.batting === 'Left hand Bat'),
    // Season questions are already tied to one year, so only the any-season pass makes them; recent years are flagged recent.
    ...(recent ? [] : years.map(y => q('season', slug(t) + '--' + y, 'Name a player from the ' + t + ' ' + y + ' squad', p => p.seasons.has(t + '|' + y), [t], 'THAT SEASON ONLY · ' + RARITY, +y >= SINCE))),
    // Highest franchise-count threshold that still leaves 5 answers for this team.
    ...[5, 4, 3].map(franchises).filter(x => roster.filter(x.test).length >= 5).slice(0, 1),
  ];
}));
// Easy ones: "Name an IPL teammate of <star>" (same franchise, same season), for players with 150+ IPL matches.
const plain = (name: string) => name.replace(/\s*\(.*\)$/, ''); // "Amit Mishra (leg spinner)" → "Amit Mishra"
const stars = roster.filter(p => (p.apps ?? 0) >= 150);
const teammates: Q[] = [false, true].flatMap(recent => stars.map(star => ({
  type: 'teammate' as const, id: slug(star.name) + '--teammate' + (recent ? '--since-' + SINCE : ''),
  prompt: 'Name an IPL teammate of ' + plain(star.name) + (recent ? ' since ' + SINCE : ''),
  hint: (recent ? SINCE + '–' + lastYear + ' · ' : '') + 'SAME TEAM, SAME SEASON · ' + RARITY, recent, dead: false,
  test: (p: P) => p !== star && [...p.seasons].some(s => star.seasons.has(s) && (!recent || +s.split('|')[1] >= SINCE)),
})));
const eligible = (q: Q) => roster.filter(q.test);
const pool = [...all, ...teammates].filter(q => eligible(q).length >= 5);

export const questions: Question[] = pool.map(({ test, ...question }) => question);
export const names = roster.map(p => p.name).sort();
export const answers = (id: string) => { const x = pool.find(q => q.id === id); return x ? eligible(x) : []; };

// Nicknames ("thala" → MS Dhoni), keyed by normalized nickname; entries whose player isn't in the data are dropped.
export const aliases: Record<string, string> = Object.fromEntries(Object.entries(aliasFile as Record<string, string>).filter(([, n]) => roster.some(p => p.name === n)).map(([k, n]) => [norm(k), n]));

// Exact normalized name or nickname, else a unique close typo; ambiguous typos are refused rather than guessed.
function find(text: string) {
  const key = norm(text);
  const exact = roster.find(p => p.key === key) ?? roster.find(p => p.name === aliases[key] || norm(plain(p.name)) === key);
  if (exact) return exact;
  const close = roster.filter(p => lev(p.key, key) <= Math.min(2, Math.floor(key.length / 5)));
  return close.length === 1 ? close[0] : close.length ? 'ambiguous' : null;
}

export function judge(promptId: string, text: string): Verdict {
  const question = pool.find(q => q.id === promptId);
  if (!question) return { correct: false, reason: 'UNKNOWN PROMPT' };
  const p = find(text);
  if (!p) return { correct: false, reason: 'NO IPL PLAYER BY THAT NAME' };
  if (p === 'ambiguous') return { correct: false, reason: 'SEVERAL PLAYERS MATCH — PICK FROM THE LIST' };
  const ok = eligible(question);
  if (!ok.includes(p)) return { correct: false, reason: p.name.toUpperCase() + ' DOESN’T FIT — TRY ANOTHER' };
  const known = ok.flatMap(x => x.apps == null ? [] : [x.apps]);
  return { correct: true, name: p.name, appearances: p.apps ?? 0, eligible: ok.length, points: p.apps == null ? 100 : score(known, p.apps) };
}
