# 問題データの書き方

## 問題集ファイル（`content/questions/<id>.yaml`）

```yaml
id: eiken2                       # ファイル名と同じにする（小文字英数字とハイフン）
title: 英検2級レベル（仮）       # メニューに表示される名前
description: 日常・ビジネスの基本語彙   # 任意
level: b1                        # 任意（例文のレベルの基準。config.yaml の levels のキー。下記「例文のレベル」）
questions:
  - answer: postponed            # 例文の中の重要語（小文字 a-z のみ。解答後に強調表示）
    sentence: The meeting was postponed until Monday.   # 読み上げて、まるごと書き取らせる例文
    meaning: 延期された          # 重要語の意味（正解したときに表示）
    translation: 会議は月曜日まで延期された。         # 例文の和訳（正解したときに表示）
    tags: [business]             # 任意
    id: postponed-2              # 任意（同じ answer を2回使うときだけ。下記参照）
    note: 自分用メモ             # 任意（ゲームには配信されない）
```

### ルール

- `answer` は例文に出てくる形そのまま（`postpone` ではなく `postponed` など）。例文の中に**単語として**含まれている必要があります（`post` は `postponed` の一部なので不可）。
- 文頭で大文字になっていても構いません（`However, ...` に対して `answer: however`）。
- プレイヤーが書き取るのは `sentence` 全体です。入力するのは英字だけで、空白と記号は自動で埋まります。
- `sentence` に使えるのは英字・空白と `. , ? ! ; : ' " -` だけです。数字は英語で書いてください（`7` → `seven`）。アクセント付きの文字（`café` など）も入力できないので使えません。
- 例文は**アメリカ英語**で書きます（綴りは `color`・`favorite`・`organize`・`center`・`traveled`、語彙は `apartment`・`package`・`vacation` など）。通常の出題の声がアメリカ英語で、聞いたとおりに打つため、イギリス式の綴りは打ち間違いになってしまいます。飛行船の訛りは発音だけで、例文は同じものを使います。`npm run content:check` はイギリス式の綴り・語彙を警告します
- 日本語（`meaning` と `translation`）は出題中には表示されず、正解したときだけ表示されます。
- 同じ単語が例文に複数回出てくる場合、強調表示されるのは最初の1つです。
- `answer` にアポストロフィやハイフン、スペースは使えません（画面のキーボードが a〜z のみのため）。
- 同じ問題集の中で同じ `answer` は1回だけです。同じ単語を別の例文でも出したいときは、2つ目以降に `id` を付けます。

```yaml
  - answer: postponed
    sentence: The meeting was postponed until Monday.
    ...
  - id: postponed-2              # 小文字英数字とハイフン。問題集の中で重複しないこと
    answer: postponed
    sentence: The game was postponed because of rain.
    ...
```

- 進み具合は問題の識別子（`id`、なければ `answer`）で記録されます。並べ替えや例文・訳の修正は自由にしてかまいませんが、`answer` や `id` を変えると別の問題として扱われます。

## 問題集を追加する

1. `content/questions/mytopic.yaml` を作る（`id: mytopic`）
2. `content/config.yaml` の `questionSets` に追加する

```yaml
questionSets:
  - id: eiken2
    enabled: true
  - id: mytopic
    enabled: true     # false にするとメニューでチェックが外れた状態で表示
```

3. `npm run content:check` で確認

## 設定（`content/config.yaml`）

各項目の意味はファイル内のコメントを、許される値の範囲は `src/content/schema.ts` の `ConfigSchema` を参照してください。

## 例文のレベル

問題集に `level` を書くと、`npm run content:levels` が例文の単語のレベルを判定し、基準に合わない例文を一覧にします。`npm run content:check` も件数だけ警告します（エラーにはしません）。

- 単語のレベルは CEFR（A1〜C2）で、`content/wordlists/` の単語表（CEFR-J Wordlist・Octanove C1/C2）から引きます。変化形は原形に戻して引きます（`postponed` → `postpone`、`went` → `go`）
- 基準は `config.yaml` の `levels` に書きます（答えの単語のレベル、答え以外の単語の上限、上限を超えてよい語数、語数の範囲）。答えはそのレベルで覚える語、ほかの語はそのレベルまでに覚えている語、という考え方です
- 文の途中の大文字で始まる語で、単語表に無いもの（人名・地名）は判定から外します
- アメリカ英語かどうかも同時に判定します。イギリス式の綴りは単語表の見出し（`color/colour` のように、先がアメリカ式）から、イギリスで主に使う語（`takeaway`・`lorry` など）は `scripts/levels/american.ts` の表から見つけます
- 判定の限界: 品詞は見分けないので、同じ綴りの語は一番易しい品詞のレベルになります。`according to` のような 2 語以上の見出しはまだ使っていません。単語表（約 9,900 語）に無い語は `?` と表示され、上限を超える語として数えます

### 例文を自動で作る

`npm run content:generate -- --level b1` は、Claude API（Claude Opus 5.5）に例文を作らせ、上の基準で判定して合格したものだけを `content/questions/b1.yaml` に追記します（無ければ作ります）。

- 答えの単語は、基準のレベルの単語のうち、既存の問題集でまだ使っていないものから候補を選び、その中から「実際によく使われる語」を Claude に選ばせます
- アメリカ英語で書くよう指示し、イギリス式の綴り・語彙も不合格にします
- すでに使った語とその変化形（`tangle` に対する `tangled` など）は答えの候補にしません。`-ly` の副詞（`cultural` と `culturally`）は別の語として扱います
- 同じ場面を繰り返さないよう、問題集にすでにある文の一覧も Claude に渡します。下品なスラングは使わないよう指示しています
- 和訳と意味の「?」「!」は全角にそろえます
- 不合格の文は、理由を伝えて 2 回まで直させます。それでもだめなら捨てます
- 各問題の `note` に、生成日・モデル・見出し語とそのレベルが入ります
- `config.yaml` の `questionSets` に入れるまでは出題されないので、中身（特に和訳）を確認してから入れてください
- 認証は `ANTHROPIC_API_KEY` か `ant auth login`。100 問で数十万トークン程度です（実行の最後に料金の目安を表示します）。`--dry-run` なら API を呼ばずに指示文を確認できます

## 音声

`speech.tts` を設定していると、例文の音声は `npm run tts`（公開時は CI）で生成されます。例文を直すとその問題の音声だけ作り直しになります。音声がまだ無い問題はブラウザの声で読まれるので、問題の追加・修正のときに何かする必要はありません。
