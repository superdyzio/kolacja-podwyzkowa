---
bootstrapped_at: 2026-10-26T22:52:33Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: kolacja-podwyzkowa
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: kolacja-podwyzkowa
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: false
  has_payments: false
  has_realtime: true
  has_ai: true
  has_background_jobs: false
```

Jedna osoba buduje w 13 dni aplikację webową dla jednego wieczoru (35–40 gości na telefonach, widok organizatora, widok TV), więc liczą się gotowy, typowany i dobrze znany agentom stack oraz zero pracy z infrastrukturą. 10x-astro-starter to rekomendowany domyślny wybór dla aplikacji webowej w TypeScript i przechodzi wszystkie cztery bramki agent-friendly: Astro z trasami API obsłuży trzy widoki i wywołanie AI po stronie serwera, React dostarczy interaktywne części (plan z pinezkami, losowanie, ranking), a Supabase daje Postgres na trwały stan wieczoru, magazyn plików na zrzut planu i mechanizm odświeżania na żywo. Supabase da się uruchomić lokalnie w Dockerze, więc nocny build nie wymaga kont użytkownika. Dostęp bez kont, przez klucze w linkach, oznacza brak systemu logowania; AI i aktualizacje na żywo są w zakresie. Deploy na Cloudflare Pages (domyślny dla startera), CI na GitHub Actions z auto-deployem po merge. Pewność bootstrappera to first-class, więc możliwe są pojedyncze ręczne kroki przy scaffoldzie.

## Pre-scaffold verification

| Signal      | Value                                                      | Severity | Notes                                              |
| ----------- | ---------------------------------------------------------- | -------- | -------------------------------------------------- |
| npm package | not run                                                    | —        | cmd_template starts with `git clone`; no create-* CLI |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12  | fresh    | from card.docs_url; default branch `master`, not archived |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 21 top-level entries (incl. `node_modules/`; 50 files outside node_modules)
**Conflicts (.scaffold siblings)**: README.md → README.md.scaffold
**.gitignore handling**: absent in cwd (moved silently)
**.bootstrap-scaffold cleanup**: deleted (upstream `.git/` removed before move-up)

Install warnings: `npm warn EBADENGINE` for `astro-eslint-parser@3.1.0` and `eslint-plugin-astro@3.1.0` (require node `^22.22.3 || ^24.16.0 || >=26.3.0`; local node is v24.15.0). Starter `.nvmrc` pins `22.14.0`. Install completed: 656 packages added.

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 11 HIGH, 2 MODERATE, 1 LOW
**Direct vs transitive**: 0/1/0/1 direct of total 0/11/2/1 (direct: `wrangler` HIGH, `astro` LOW)

#### CRITICAL findings

None.

#### HIGH findings

- `wrangler` (direct) 4.16.0 – 4.148.0 — via miniflare. Fix available.
- `@cloudflare/vite-plugin` (transitive) 1.2.3 – 1.63.0 — via miniflare, wrangler. Fix available.
- `miniflare` (transitive) 4.20250508.3 – 5.20261006.0-alpha — via sharp, undici. Fix available.
- `brace-expansion` (transitive) ≤1.1.20 || 4.0.0 – 5.0.11 — GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p: quadratic-time expansion (CPU DoS). Fix available.
- `devalue` (transitive) ≤5.9.2 — GHSA-j22f-vq7h-c4qm and 6 more: stringify/uneval serialize shared memory. Fix available.
- `http-cache-semantics` (transitive) ≤4.2.0 — GHSA-ch52-4w7c-c8xp: max-stale handling can disclose cross-user cached responses. Fix available.
- `sharp` (transitive) <0.35.5 — GHSA-wq5f-xc86-pv6w: librsvg CVE-2026-96889. Fix available.
- `source-map-js` (transitive) 1.0.0 – 1.2.1 — GHSA-68fv-2mgg-jv7q: event-loop DoS via indexed source-map offsets. Fix available.
- `undici` (transitive) 7.0.0 – 7.30.0 || 8.0.0 – 8.12.1 — GHSA-3wwx-pv8p-q78v and 13 more: DoS in WebSocket permessage-deflate. Fix available.
- `vite` (transitive) 8.3.0 – 8.3.2 — GHSA-698v-4r3x-3vcv and 5 more (launch-editor escaping on Windows). Fix available.
- `zod` (transitive) <4.6.6 — GHSA-mrhx-c7xc-m3w5: memory exhaustion on oversized constrained collections. Fix available.

#### MODERATE findings

- `fast-uri` (transitive) 3.0.0 – 3.1.8 — GHSA-hrr3-gc8f-f4qj and 4 more: inconsistent host case normalization. Fix available.
- `smol-toml` (transitive) ≤1.8.0 — GHSA-r4xh-jqrq-34v2: quadratic-time parse. Fix available.

#### LOW / INFO findings

- `astro` (direct) 7.1.0 – 7.3.2 — GHSA-mpr7-6m5w-76rw: arbitrary CSS injection in View Transitions. Fix available.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | false                |
| has_payments            | false                |
| has_realtime            | true                 |
| has_ai                  | true                 |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
