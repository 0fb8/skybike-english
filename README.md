# そらとぶ自転車 英単語世界一周

例文を聞いて空欄の英単語を書き取りながら、空とぶ自転車で世界一周するブラウザゲームです。

- 速く正確に書くほど自転車が高く飛び、もたつくと海に墜落します。
- 飛行船が現れると、その地域の訛りで例文が読まれます。正解するとしばらくスピードが倍になります。
- 都市に到着すると世界地図で現在地を確認できます。一周で飛行機、二周で地球儀のハンコがもらえます。

サーバーは不要で、ビルド結果（`dist/`）は静的ファイルとしてどこにでも置けます。

## はじめかた

Node.js 22.12 以上が必要です（`.nvmrc` に CI と同じ版を書いてあります）。

```bash
npm install
npm run dev        # http://localhost:5173 で起動（YAML を保存すると自動で再読み込み）
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動 |
| `npm run check` | 問題データの検証 → 型チェック → テスト（CI と同じ） |
| `npm run content:check` | 問題データの検証だけ |
| `npm run tts` | 例文の音声を生成（未生成分だけ。要 AWS 認証。`-- --dry-run` で件数だけ確認） |
| `npm run build` | 本番用ビルド（`dist/`） |
| `npm run preview` | ビルド結果をローカルで確認 |

## 問題や設定を変えるには

コードを触らずに、`content/` 以下の YAML を編集します。

```
content/
├── config.yaml            # 1区間の問題数、表示、読み上げ速度、高度の増減、飛行船など
└── questions/
    ├── eiken2.yaml        # 英検2級・TOEIC600レベル（110問）
    └── pre1.yaml          # 英検準1級・TOEIC800レベル（110問）
```

書式は [docs/CONTENT.md](docs/CONTENT.md) を参照してください。保存すると `npm run content:check`（CI でも実行）が次のような誤りを検出します。

- 答えが例文に単語として含まれていない
- 答えに大文字や記号が入っている（キーボードで入力できない）
- 項目名のつづり間違い・必須項目の抜け
- config.yaml にある問題集のファイルがない
- 同じ問題集に同じ答えが2つある（別の例文で出すときは `id` を付ける）

開発サーバーでは、誤りがあるとブラウザにエラーが表示されます。

## 構成

```
src/
├── main.ts              # 画面の組み立て（入力 → Game、Game の状態 → 画面、イベント → 読み上げ・保存）
├── game/game.ts         # 1回のプレイの進行（DOM に依存しない）※テスト対象
├── content/schema.ts    # 問題・設定の型と検証ルール（zod）
├── content/text.ts      # 例文の空欄化などの文字列処理
├── data/route.ts        # 都市と世界地図の輪郭
├── lib/quiz.ts          # 進行ルール（距離・高度・出題順）※テスト対象
├── lib/geo.ts           # 距離計算と地図上の位置
├── lib/speech.ts        # 読み上げ（音声ファイル → 無ければ Web Speech API）
├── lib/voices.ts        # どの声・どの音声ファイルで読むか
├── lib/save.ts          # 保存データの形式・版番号・移行 ※テスト対象
├── lib/storage.ts       # localStorage の読み書き
└── render/              # canvas 描画（上画面・地図）
scripts/
├── content.ts           # content/ の読み込みと検証
├── check-content.ts     # 検証だけ行う（CI 用）
├── vite-plugin-content.ts  # 検証した問題データと生成済み音声をゲームに取り込む
└── tts/                 # 音声の生成（jobs.ts: 作るファイルの一覧、provider.ts: サービスの差し替え口、polly.ts）
tests/                   # Vitest
```

データの流れ:

```
content/*.yaml ──(vite-plugin-content で検証)──▶ import "virtual:content" ──▶ ゲーム
                                                  └ 問題集ごとに別ファイルになり、選ばれたものだけ読み込む
```

### 設計上の決まりごと

- **問題の識別子**: 進行状況や出題順は `"<問題集id>/<問題の識別子>"` で保存します。識別子は `id`（省略時は `answer`）なので、問題の並べ替えや例文の修正をしても保存データは壊れません。
- **保存データ**: `localStorage` の `skybike:save` に版番号つきで保存します。形式を変えるときは `src/lib/save.ts` の `SAVE_VERSION` を上げ、`migrate()` に古い形からの変換を書いてください。
- **ゲームの進行と画面の分離**: 進行ルールは `Game` に置き、画面は `Game.state` を読んで描くだけにします。読み上げや保存は `Game` が出すイベントを `main.ts` で受けて行うので、音声の出し方を変えても `Game` は変わりません。

## 音声の生成

例文の音声は Amazon Polly でビルド前に生成し、静的ファイルとして配信します。生成していない問題は、これまでどおりブラウザ内蔵の声で読みます（音声が無くても遊べます）。

- 声の指定は `content/config.yaml` の `speech.tts`。飛行船のなまりは `accents` に言語ごとの声を書き、`accentQuestions` 問ぶんだけ作ります（全問×全なまりだと容量が大きいため）。`accents` に無い言語（日本語・フランス語など）はブラウザの声で読みます
- 生成物は `audio/<ハッシュ>.mp3`（git には含めない）。ファイル名は「例文・声・形式」から決まるので、例文や声を変えた問題だけが作り直されます。`.marks.jsonl` は単語ごとの時刻で、今は使っていません（将来のハイライト表示などに使える）
- 量の目安: 現在の 220 問で 320 ファイル・約 1.5 万文字

ローカルで生成する:

```bash
npm run tts -- --dry-run   # 何件・何文字作るかだけ確認
npm run tts                # AWS の認証情報（環境変数や ~/.aws）を使って生成
```

CI で生成する（公開時）: `deploy.yml` が `audio/` を Actions のキャッシュで引き継ぎ、足りない分だけ生成します。初回だけ次の設定が必要です。

1. AWS で GitHub の OIDC プロバイダを登録し、`polly:SynthesizeSpeech` だけを許可した IAM ロールを作る（信頼ポリシーはこのリポジトリの `main` ブランチに限定）
2. GitHub の Settings → Secrets and variables → Actions → Variables に `AWS_TTS_ROLE_ARN` としてロールの ARN を登録

未設定なら生成は飛ばされ、ブラウザの声で読むサイトとして公開されます。PR の CI（`ci.yml`）は音声を生成しません。

## 公開（GitHub Pages）

1. GitHub にリポジトリを作って push する
2. Settings → Pages → Build and deployment → Source を **GitHub Actions** にする
3. 以後、`main` に push するたびに `.github/workflows/deploy.yml` が検証・ビルドして公開する

`vite.config.ts` の `base: "./"` により、`https://<user>.github.io/<repo>/` のようなサブパスでも動きます。Cloudflare Pages や Netlify でも、ビルドコマンド `npm run build`・公開ディレクトリ `dist` で公開できます。

## 既知の制約

- 音声を生成していない問題・言語は、ブラウザ内蔵の声で読むため、声や訛りの再現度は端末によって変わります。
- Polly の生成音声の保存・配信にあたっては AWS の利用規約を確認してください。
- 進行状況はブラウザ内（localStorage）にだけ保存されます。
