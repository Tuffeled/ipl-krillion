# IPL Krillion

IPL Krillion is a pixel-art IPL trivia game built with Next.js: name a rare player, hit the ball further. Run `npm install` and `npm run dev`, then visit http://localhost:3000.

Every climb has seven prompts, one of each type: franchise squad, two franchises, role, bowling style (pace or spin group), left-handed batters, a single season, and franchise count. Name one player who fits. Answers are judged on the server (`app/api/judge`) against `data/players.json` (1,027 players, verified IPL appearance counts), so the game needs no API keys. Fewer career IPL matches score higher, from 100 to 1,000 m per prompt (`lib/game.ts` → `score`). The prompt pool (405 prompts, each with at least five valid answers) is built in `lib/data.ts`. `npm run answer-key` checks the rules and rewrites `ANSWER_KEY.md`. Blank roles and bowling styles were partly filled from Wikipedia infoboxes by `scripts/fill_roles.mjs`, since ESPNcricinfo blocks automated access; filled fields carry a `roleSource` / `bowlingSource`.

## Deploy to Vercel

Import the repo in Vercel (framework preset: Next.js, no build settings needed) or run `npx vercel`. That's enough to play.

Optional daily leaderboard: create a Supabase project, apply `supabase/migrations` (`supabase db push`), then set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel. Without them the leaderboard is simply hidden.

## Data and preview status

The squad data was copied from `../iplteams/core/data/processed_players.json`. IPL match counts use ESPNcricinfo profile totals, Cricsheet match lineups, and explicit zeroes from IPL auction lists. Cricsheet data is attributed to [Cricsheet](https://cricsheet.org/) under the Open Data Commons Attribution License. Cricsheet lineup totals may differ from ESPN totals, so the sources are shown with answers. `data/cricsheet/coverage_audit.md` lists unresolved records and conflicts. The 193 previously unresolved players are assigned zero based on the project owner’s confirmation; these records carry the source `User-confirmed`. The 16 disagreements between ESPN and Cricsheet remain documented for review.

The resumable scraper in `scripts/scrape_appearances.py` discovers player links from the squad pages, fetches each unique profile, reads the aggregate IPL row's `Mat` column, and saves successful results alongside team data. Install its dependencies with `python3 -m pip install -r scripts/requirements.txt`, then run `python3 scripts/scrape_appearances.py`. It caches progress in `data/profile_cache.json`; `--limit N` limits profile lookups and `--skip-discovery` reuses discovered profiles. Missing rows are not assumed to be zero; ambiguous name matches are skipped. The extractor has been checked against live profiles in a visible Firefox session. If a verification page remains after loading, collection stops without recording a false count. Check source terms and access before running collection.
