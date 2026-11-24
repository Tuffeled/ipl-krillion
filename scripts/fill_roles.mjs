// Fill blank role / bowling fields in data/players.json from English Wikipedia infoboxes.
// Run: node scripts/fill_roles.mjs   (ESPNcricinfo blocks automated access, so Wikipedia is the source.)
// Only accepts a page that mentions the IPL or one of the player's franchises; otherwise leaves the blank.
import fs from 'node:fs';

const FILE = new URL('../data/players.json', import.meta.url);
const players = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const UA = { 'User-Agent': 'ipl-climb-data/0.1 (offline trivia dataset)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(params) {
  for (let wait = 5000; ; wait *= 2) {
    const r = await fetch('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', ...params }), { headers: UA });
    if (r.status !== 429 || wait > 120000) return r.json(); // back off on rate limits instead of skipping the player
    await sleep(wait);
  }
}

const ROLE = [[/wicket.?keeper/i, 'Wicketkeeper Batter'], [/bowling all.?rounder/i, 'Bowling Allrounder'], [/batting all.?rounder/i, 'Batting Allrounder'], [/all.?rounder/i, 'Allrounder'], [/bowler/i, 'Bowler'], [/opening/i, 'Opening Batter'], [/bats(man|woman)|batter/i, 'Batter']];
function bowling(raw) {
  const s = raw.toLowerCase();
  const arm = s.includes('left') ? 'Left arm' : 'Right arm';
  if (/googly/.test(s)) return 'Legbreak Googly';
  if (/leg.?(break|spin)/.test(s)) return 'Legbreak';
  if (/wrist|chinaman/.test(s)) return 'Left arm Wrist spin';
  if (/orthodox/.test(s)) return 'Slow Left arm Orthodox';
  if (/off.?(break|spin)/.test(s)) return 'Right arm Offbreak';
  if (/fast.?medium/.test(s)) return arm + ' Fast medium';
  if (/medium.?fast/.test(s)) return arm + ' Medium fast';
  if (/fast/.test(s)) return arm + ' Fast';
  if (/medium/.test(s)) return arm + ' Medium';
  return '';
}
const field = (text, name) => (text.match(new RegExp('\\|\\s*' + name + '\\s*=\\s*([^\\n|]*)', 'i'))?.[1] ?? '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\{\{[^}]*\}\}|<[^>]*>/g, '').trim();

async function page(p) {
  // One request: top search hits with their wikitext.
  const found = await api({ action: 'query', generator: 'search', gsrsearch: p.name + ' cricketer', gsrlimit: '3', prop: 'revisions', rvprop: 'content', rvslots: 'main', formatversion: '2' });
  if (found.error) throw new Error(found.error.info);
  for (const hit of (found.query?.pages ?? []).sort((a, b) => a.index - b.index)) {
    const text = hit.revisions?.[0]?.slots?.main?.content ?? '';
    const words = p.name.toLowerCase().split(' ');
    const title = hit.title.replace(/\(.*\)/, '').trim().toLowerCase();
    // Surname must appear, and the title must start with a letter of one of the other names (rejects Yashpal for Sarandeep Singh).
    const sameName = title.includes(words.at(-1)) && words.slice(0, -1).some(w => w[0] === title[0]);
    const relevant = /Indian Premier League|\bIPL\b/.test(text) || p.teams.some(t => text.includes(t.team));
    if (relevant && sameName && /\{\{\s*Infobox cricketer/i.test(text)) return { title: hit.title, text };
  }
  return null;
}

let filled = 0;
const todo = players.filter(p => !p.role || (!p.bowling && /bowl|allrounder/i.test(p.role)));
for (const p of todo) {
  const hit = await page(p).catch(e => (console.log('error ', p.name, e.message), null));
  await sleep(1500);
  if (!hit) { console.log('skip  ', p.name); continue; }
  const role = ROLE.find(([re]) => re.test(field(hit.text, 'role')))?.[1] ?? '';
  const bowl = bowling(field(hit.text, 'bowling'));
  if (!p.role && role) { p.role = role; p.roleSource = 'Wikipedia: ' + hit.title; filled++; }
  if (!p.bowling && bowl) { p.bowling = bowl; p.bowlingSource = 'Wikipedia: ' + hit.title; }
  console.log('fill  ', p.name, '->', hit.title, '|', p.role, '|', p.bowling);
}
fs.writeFileSync(FILE, JSON.stringify(players, null, 2) + '\n');
console.log(`filled ${filled} roles; ${players.filter(p => !p.role).length} still blank`);
