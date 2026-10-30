---
starter_id: 10x-astro-starter
package_manager: npm
project_name: kolacja-podwyzkowa
hints:
  language_family: js
  team_size: solo
  deployment_target: aws-lambda
  ci_provider: github-actions
  ci_default_flow: manual-deploy
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: false
  has_payments: false
  has_realtime: true
  has_ai: true
  has_background_jobs: false
---

## Why this stack

Jedna osoba buduje w 13 dni aplikację webową dla jednego wieczoru (35–40 gości na telefonach, widok organizatora, widok TV), więc liczą się gotowy, typowany i dobrze znany agentom stack oraz zero pracy z infrastrukturą. 10x-astro-starter to rekomendowany domyślny wybór dla aplikacji webowej w TypeScript i przechodzi wszystkie cztery bramki agent-friendly: Astro z trasami API obsłuży trzy widoki i wywołanie AI po stronie serwera, React dostarczy interaktywne części (plan z pinezkami, losowanie, ranking), a Supabase daje Postgres na trwały stan wieczoru, magazyn plików na zrzut planu i mechanizm odświeżania na żywo. Supabase da się uruchomić lokalnie w Dockerze, więc nocny build nie wymaga kont użytkownika. Dostęp bez kont, przez klucze w linkach, oznacza brak systemu logowania; AI i aktualizacje na żywo są w zakresie. Deploy na Cloudflare Pages (domyślny dla startera), CI na GitHub Actions z auto-deployem po merge. Pewność bootstrappera to first-class, więc możliwe są pojedyncze ręczne kroki przy scaffoldzie.

## Deployment (zmiana 2026-10-30, decyzja użytkownika)

Cloudflare zastąpione przez AWS Lambda — decyzja użytkownika z 2026-10-30:

- aplikacja: Astro SSR z adapterem `@astrojs/node` (standalone) jako jedna funkcja AWS Lambda (arm64, `nodejs24.x`, 1024 MB, 15 s) za Function URL (auth NONE — dostęp dają klucze w linkach); warstwa AWS Lambda Web Adapter (v1.1.0, `LambdaAdapterLayerArm64:30`) przekazuje żądania do serwera Node na porcie 8080 (`run.sh`);
- baza: hostowany projekt Supabase (plan Free) w tym samym regionie, ten sam kod co lokalnie (supabase-js + klucz service role po stronie serwera);
- tylko darmowe usługi: bez API Gateway, CloudFront, S3, ECR, VPC/NAT;
- paczka `npm run package:lambda` (serwer zbundlowany, bez `node_modules`), wdrożenie `AWS_REGION=<region> npm run deploy:aws` uruchamia użytkownik (CI niczego nie wdraża);
- konsekwencje: plan sali ≤ 4 MB (limit 6 MB ładunku Lambdy z base64), `security.allowedDomains` ufa `X-Forwarded-Proto: https` od proxy (linki gości i kody QR jako https).
