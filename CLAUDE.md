# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Browser game (Vite + TypeScript, no framework, no server): the player listens to an English sentence and types it in full while flying a bike between world cities. The README, docs, code comments and UI text are in Japanese, so keep new ones in Japanese too.

## Commands

Requires Node >= 22.12 (see `.nvmrc`).

```bash
npm run dev            # Vite dev server; editing content/*.yaml or generating audio reloads the page
npm run check          # content:check → tsc → vitest (this is what CI runs, followed by build)
npm run content:check  # validate content/ YAML only (also warns about sentences outside their level criteria)
npm run content:levels # CEFR level report per question set (-- --all, -- --set <id>)
npm run content:generate -- --level b1 [--count N] [--dry-run]  # Claude API drafts sentences; only ones passing the level check are appended (costs money)
npm test               # vitest run
npx vitest run tests/game.test.ts           # single test file
npx vitest run tests/game.test.ts -t "name" # single test by name
npm run build          # tsc && vite build → dist/
npm run tts -- --dry-run  # count the Polly audio that would be generated (npm run tts generates it; needs AWS creds)
cd infra && npx cdk synth # AWS CDK stack for the audio bucket, CloudFront and the CI role (separate package: run npm install in infra/ first)
```

## Architecture

**Content pipeline.** Questions and game settings live in `content/` as YAML (`config.yaml` plus `questions/<setId>.yaml`). The format is documented in `docs/CONTENT.md`. `scripts/content.ts` loads them and validates them against the zod schemas in `src/content/schema.ts`. That one schema file is used by both the build scripts and the game. `scripts/vite-plugin-content.ts` exposes the validated data as the virtual module `virtual:content` (types are in `src/content/virtual.d.ts`). The main module exports `config` and `sets`, where each set carries metadata plus a lazy `load()`. Each question set becomes its own chunk (`virtual:content/set/<id>`). When pre-generated audio exists, the plugin attaches it to each question as imported asset URLs. A content error makes the plugin throw, so the dev server shows an overlay and the build fails.

**TTS.** Audio is generated ahead of time with Amazon Polly (`scripts/tts/`). `jobs.ts` decides which files should exist: one file per question for every speaker in `speech.tts.speakers`, plus accent files (used by the airship) for `accentQuestions` questions per accent. If an accent uses the same voice as a speaker, it reuses that speaker's files for every question. It names each file `audio/<hash>.mp3`, where the hash comes from sentence + voice + format, so editing a sentence or voice only regenerates the affected files. During play, `main.ts` picks a random speaker for each question (`pickSpeaker`) and keeps that speaker when the sentence is replayed. Generative-engine voices do not support speech marks, so `polly.ts` skips the `.marks.jsonl` request for them. `provider.ts` is the interface for swapping TTS services, and `store.ts` is the interface for where files are kept. When `speech.tts.storage` is set in `config.yaml`, files go to S3 under `audio/` (`s3.ts`) and are served through CloudFront. In that mode the Vite plugin attaches `<baseUrl>/audio/<hash>.mp3` to every job without checking S3, and a missing file just falls back to the browser voice. Without `storage`, files go to the gitignored local `audio/`, and only the ones that exist get imported into the build. `deploy.yml` runs `npm run tts -- --storage-only` before building when the repo variable `AWS_TTS_ROLE_ARN` is set. That role, the bucket and the CloudFront distribution are defined in `infra/` (AWS CDK, a separate npm package; `infra.yml` only typechecks and synths it). The role can list, read and put objects but cannot delete them, so `--prune` has to be run locally. At runtime, `src/lib/speech.ts` plays the audio file if one exists and falls back to the Web Speech API otherwise. `main.ts` uses `prefetchAudio` to download the current and next question's audio ahead of time. `src/lib/voices.ts` picks the voice or file.

**Sentence levels.** `scripts/levels/` grades each sentence against `config.yaml` `levels[set.level]`. It looks words up in the CEFR word lists in `content/wordlists/` (CEFR-J A1–B2 and Octanove C1/C2; attribution is required, see the README there). The lookup uses the exact form if the list has it and otherwise falls back to base-form candidates from `lemma.ts`. Words not in either list count as `?`, which ranks above every level. Mid-sentence capitalized words that aren't listed are treated as proper nouns and skipped. The results are warnings only and never fail `content:check`. `scripts/generate/` (draft.ts holds the pure logic, sentences.ts the API calls) asks `claude-opus-5-5` for sentences through structured output and validates each one with `validateItem` (schema, headword, `checkLevel`). Failing sentences go back in the same conversation for up to two fixes. Results are appended to `content/questions/<level>.yaml`, and a set isn't served until it's added to `questionSets`. `clientConfig()` in the Vite plugin strips `levels` (and the bucket name) from the config shipped to the browser.

**Game logic vs. UI.** `src/game/game.ts` (`Game`) owns all gameplay rules and has no DOM dependency, so it is unit-tested directly. It exposes `state` and emits `GameEvent`s (`speak`, `stopSpeaking`, `progress`, `wrongLetter`, `noQuestions`, …). `src/main.ts` wires everything together: it sends input to `Game`, renders `Game.state` with canvas (`src/render/`), and handles events for speech and saving. Put rule changes in `Game`. Put side effects in `main.ts` event handlers.

**Persistence.** Progress lives in localStorage key `skybike:save`, with a version number (`src/lib/save.ts`). Whenever the save shape changes, bump `SAVE_VERSION` and add a conversion in `migrate()`. Progress and question order are keyed by `"<setId>/<questionKey>"`, where questionKey is the question's `id` and falls back to `answer`. Changing a question's `answer` or `id` therefore orphans its saved progress. Reordering questions or editing sentences does not.

**Content constraints** (the schema enforces these, so keep them in mind when writing or generating content):
- Sentences are American English (spelling and vocabulary) because the default voices are American and players type exactly what they hear. The airship accents change pronunciation only. `scripts/levels/american.ts` flags British spellings, using the `us/uk` variant headwords in the word lists plus a doubled-l rule, and British-only words from a small table. It warns in `content:check` and rejects drafts in `content:generate`.
- The player types letters only; spaces and punctuation are filled in automatically (`src/content/text.ts`).
- `sentence` may contain only English letters, spaces and `. , ? ! ; : ' " -`.
- `answer` must be lowercase a–z and must appear in the sentence as a whole word.
- Answers must be unique within a set. To reuse an answer, give the later question an `id`.

## Deployment

`vite.config.ts` uses `base: "./"` so `dist/` works from any subpath. Every push to `main` runs `.github/workflows/deploy.yml`, which validates, builds and publishes to GitHub Pages. `ci.yml` runs on PRs and pushes and never generates audio.
