# そらとぶ自転車 英単語世界一周

英語の例文を聞いてまるごと書き取りながら、空とぶ自転車で世界一周するブラウザゲームです。

- 入力するのは英字だけ。空白と記号は自動で入ります。和訳は正解したときに表示されます。
- 自転車は時間とともに下がり、正しい文字を 1 文字書くたびに少し上がります（打ち間違えても下がりません）。
- 都市から都市への渡航は 1 回勝負。途中で海に墜落すると失敗してメニューに戻り、次は出発地からやり直しです。
- 飛行船が現れると、その地域の訛りで例文が読まれます。正解するとしばらくスピードが倍になります。
- 都市に到着すると世界地図で現在地を確認できます。一周で飛行機、二周で地球儀のハンコがもらえます。
- メニューの「復習」で、出題された問題の例文・和訳を見返し、音声を聞き直せます。結果は「正解」と「答えられなかった（墜落・パス）」の 2 つです（途中で打ち間違えても、最後まで書ければ正解）。

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
| `npm run content:generate -- --level <名前>` | Claude API で例文を作り、レベルの基準に合格したものだけを `content/questions/<名前>.yaml` に追記する（100 問になるまで。`--count`、`--dry-run`。料金がかかる） |
| `npm run content:levels` | 例文の単語のレベル（CEFR）を判定して、問題集の基準に合わない例文を一覧にする（`-- --all` で全部、`-- --set <id>` で1つ） |
| `npm run tts` | 例文の音声を生成して S3 に置く（未生成分だけ。要 AWS 認証。`-- --dry-run` で件数だけ確認） |
| `npm run build` | 本番用ビルド（`dist/`） |
| `npm run preview` | ビルド結果をローカルで確認 |

## 問題や設定を変えるには

コードを触らずに、`content/` 以下の YAML を編集します。

```
content/
├── config.yaml            # 1区間の問題数、表示、読み上げ速度、高度の増減、飛行船、例文のレベルの基準など
├── wordlists/             # 単語のレベル表（CEFR-J・Octanove C1/C2。出典とライセンスは中の README）
└── questions/
    ├── eiken2.yaml        # 英検2級レベル（仮。110問）
    └── pre1.yaml          # 英検準1級レベル（仮。110問）
```

書式は [docs/CONTENT.md](docs/CONTENT.md) を参照してください。保存すると `npm run content:check`（CI でも実行）が次のような誤りを検出します。

- 答えが例文に単語として含まれていない
- 答えに大文字や記号が入っている（キーボードで入力できない）
- 項目名のつづり間違い・必須項目の抜け
- config.yaml にある問題集のファイルがない
- 例文に入力できない文字（数字やアクセント記号など）がある
- 同じ問題集に同じ答えが2つある（別の例文で出すときは `id` を付ける）

開発サーバーでは、誤りがあるとブラウザにエラーが表示されます。

## 構成

```
src/
├── main.ts              # 画面の組み立て（入力 → Game、Game の状態 → 画面、イベント → 読み上げ・保存）
├── game/game.ts         # 1回のプレイの進行（DOM に依存しない）※テスト対象
├── content/schema.ts    # 問題・設定の型と検証ルール（zod）
├── content/text.ts      # 書き取る文字・伏せ字などの文字列処理
├── data/route.ts        # 都市と世界地図の輪郭
├── lib/quiz.ts          # 保存する進行状況・到着・総距離・出題順 ※テスト対象
├── lib/geo.ts           # 距離計算と地図上の位置
├── lib/speech.ts        # 読み上げ（音声ファイル → 無ければ Web Speech API）
├── lib/voices.ts        # どの声・どの音声ファイルで読むか
├── lib/save.ts          # 保存データの形式・版番号・移行 ※テスト対象
├── lib/history.ts       # 出題された問題の記録（復習画面用） ※テスト対象
├── lib/storage.ts       # localStorage の読み書き
└── render/              # canvas 描画（空の場面・世界地図。ウィンドウの大きさに合わせて描く）
scripts/
├── content.ts           # content/ の読み込みと検証
├── check-content.ts     # 検証だけ行う（CI 用）
├── vite-plugin-content.ts  # 検証した問題データと生成済み音声をゲームに取り込む
├── generate/            # 例文の自動生成（draft.ts: 候補選び・指示文・検証、sentences.ts: Claude API を呼んで追記）
├── levels/              # 例文のレベル判定（wordlist.ts: 単語表、lemma.ts: 変化形 → 原形、analyze.ts: 判定、american.ts: アメリカ英語か、report.ts）
└── tts/                 # 音声の生成（jobs.ts: 作るファイルの一覧、provider.ts: サービスの差し替え口、polly.ts、store.ts: 置き場所（S3 / audio/））
infra/                   # AWS CDK（音声の S3・CloudFront と CI 用の IAM ロール）
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

例文の音声は Amazon Polly で事前に生成し、S3 に置いて CloudFront から配信します。ページ（GitHub Pages）は出題のたびに音声を取りに行きます（次の問題の分は先に読み込みます）。生成していない問題や読み込めなかった問題は、ブラウザ内蔵の声で読みます（音声が無くても遊べます）。

```
content/*.yaml ──push──▶ GitHub Actions（deploy.yml）
                          ├─ npm run tts: S3 に無い音声だけ Polly で生成して S3 に置く
                          └─ npm run build: 問題に https://<CloudFront>/audio/<ハッシュ>.mp3 を付ける ──▶ GitHub Pages
ブラウザ ──ページ──▶ GitHub Pages
         ──音声───▶ CloudFront ──▶ S3（非公開）
```

- 声の指定は `content/config.yaml` の `speech.tts`。通常の出題は `speakers` に書いた人物（今は Polly の生成エンジンの Tiffany と Nate）の声を全問ぶん作り、毎問ランダムに1人が読みます（聞き直しは同じ人物）。飛行船のなまりは `accents` に言語ごとの声を書き、`accentQuestions` 問ぶんだけ作ります（全問×全なまりだと容量が大きいため）。`accents` に無い言語（日本語・フランス語など）はブラウザの声で読みます。例文はアメリカ英語にそろえていて、訛りは発音だけです（文は同じ）
- ファイル名は「例文・声・形式」から決まるハッシュなので、例文や声を変えた問題だけが作り直されます。同じ名前の中身は変わらないので、ブラウザと CloudFront に長期間キャッシュさせています。`.marks.jsonl` は単語ごとの時刻で、今は使っていません（生成エンジン（generative）の声では作られません）
- 量の目安: 現在の 220 問で 540 ファイル・約 2.6 万文字

### AWS の準備（初回だけ）

S3・CloudFront・CI 用の IAM ロールは `infra/`（AWS CDK）で定義しています。手元の AWS の認証情報（管理者相当）で反映します。

```bash
cd infra
npm install
npx cdk bootstrap   # そのアカウント・リージョン（us-east-1）で CDK を初めて使うときだけ
npx cdk deploy      # 出力の BucketName・BaseUrl・TtsRoleArn を控える
```

- アカウントに GitHub の OIDC プロバイダ（`token.actions.githubusercontent.com`）が既にあるとエラーになります。その場合は `infra/cdk.json` の `githubOidcProviderArn` にその ARN を書いてから `cdk deploy` してください
- リポジトリの OIDC トークンが ID 入りの形式（immutable subject）のときは、`infra/cdk.json` の `githubSubjectPrefix` にその先頭部分を書きます（`gh api repos/<owner>/<repo>/actions/oidc/customization/sub` の `sub_claim_prefix`）。合っていないと、Actions で `Not authorized to perform sts:AssumeRoleWithWebIdentity` になります
- IAM ロールを使えるのは、このリポジトリ（`infra/cdk.json` の `githubRepo`）の `main` ブランチの Actions だけです。権限は Polly での生成と、バケットの `audio/` への一覧・読み取り・追加だけです（削除はできません）
- スタックを削除してもバケットと音声は残ります

出力を次の 2 か所に書きます。

1. `content/config.yaml` の `speech.tts.storage` に `bucket`（BucketName）と `baseUrl`（BaseUrl）を書いてコミットする
2. GitHub の Settings → Secrets and variables → Actions → Variables に `AWS_TTS_ROLE_ARN`（TtsRoleArn）を登録する

以後は、例文を直して `main` に push すれば、足りない音声が生成されてから公開されます。どちらかが未設定なら生成は飛ばされ、ブラウザの声で読むサイトとして公開されます。PR の CI（`ci.yml`）は音声を生成しません。

### 手元から生成・掃除する

S3 の権限がある AWS の認証情報（環境変数や `~/.aws`）が必要です。

```bash
npm run tts -- --dry-run   # S3 に無い音声が何件・何文字あるかだけ確認
npm run tts                # 足りない分を生成して S3 に置く
npm run tts -- --prune     # 例文の削除や変更で使われなくなった音声を S3 から消す
```

`--prune` は、古い版のページを開いたままの人がいると、その人の音声がブラウザの声に変わります。気になる場合は公開してしばらく経ってから行ってください。`speech.tts.storage` を書いていないときは、S3 ではなくリポジトリ直下の `audio/`（git には含めない）に生成して、ビルドに含めます（開発中に S3 を使わずに試すとき向け）。

## 公開（GitHub Pages）

1. GitHub にリポジトリを作って push する
2. Settings → Pages → Build and deployment → Source を **GitHub Actions** にする
3. 以後、`main` に push するたびに `.github/workflows/deploy.yml` が検証・ビルドして公開する

`vite.config.ts` の `base: "./"` により、`https://<user>.github.io/<repo>/` のようなサブパスでも動きます。Cloudflare Pages や Netlify でも、ビルドコマンド `npm run build`・公開ディレクトリ `dist` で公開できます。

## 既知の制約

- 音声は CloudFront から読み込むので、オフラインでは（先に読み込んだ分を除き）ブラウザ内蔵の声になります。
- 音声を生成していない問題・言語は、ブラウザ内蔵の声で読むため、声や訛りの再現度は端末によって変わります。
- Polly の生成音声の保存・配信にあたっては AWS の利用規約を確認してください。
- 進行状況はブラウザ内（localStorage）にだけ保存されます。
