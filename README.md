# そらとぶ自転車 英単語世界一周

例文を聞いて空欄の英単語を書き取りながら、空とぶ自転車で世界一周するブラウザゲームです。

- 速く正確に書くほど自転車が高く飛び、もたつくと海に墜落します。
- 飛行船が現れると、その地域の訛りで例文が読まれます。正解するとしばらくスピードが倍になります。
- 都市に到着すると世界地図で現在地を確認できます。一周で飛行機、二周で地球儀のハンコがもらえます。

サーバーは不要で、ビルド結果（`dist/`）は静的ファイルとしてどこにでも置けます。

## はじめかた

Node.js 20.11 以上が必要です。

```bash
npm install
npm run dev        # http://localhost:5173 で起動（問題データの検証と変換も自動で行う）
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動 |
| `npm run check` | 問題データの検証 → 型チェック → テスト（CI と同じ） |
| `npm run content:check` | 問題データの検証だけ |
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

## 構成

```
src/
├── main.ts              # 画面とゲーム進行の制御
├── content/schema.ts    # 問題・設定の型と検証ルール（zod）
├── content/text.ts      # 例文の空欄化などの文字列処理
├── data/route.ts        # 都市と世界地図の輪郭
├── lib/quiz.ts          # 進行ルール（距離・高度・出題順）※テスト対象
├── lib/geo.ts           # 距離計算と地図上の位置
├── lib/speech.ts        # 読み上げ（Web Speech API）
├── lib/storage.ts       # 進行状況の保存（localStorage）
└── render/              # canvas 描画（上画面・地図）
scripts/                 # content/ の検証と public/data/ への書き出し
tests/                   # Vitest
```

データの流れ:

```
content/*.yaml ──(scripts/build-content.ts で検証・変換)──▶ public/data/*.json ──(fetch)──▶ ブラウザ
```

`public/data/` は自動生成なのでリポジトリには含めません。

## 公開（GitHub Pages）

1. GitHub にリポジトリを作って push する
2. Settings → Pages → Build and deployment → Source を **GitHub Actions** にする
3. 以後、`main` に push するたびに `.github/workflows/deploy.yml` が検証・ビルドして公開する

`vite.config.ts` の `base: "./"` により、`https://<user>.github.io/<repo>/` のようなサブパスでも動きます。Cloudflare Pages や Netlify でも、ビルドコマンド `npm run build`・公開ディレクトリ `dist` で公開できます。

## 既知の制約

- 読み上げはブラウザ内蔵の音声を使うため、声や訛りの再現度は端末によって変わります。
- 進行状況はブラウザ内（localStorage）にだけ保存されます。
