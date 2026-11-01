# 問題データの書き方

## 問題集ファイル（`content/questions/<id>.yaml`）

```yaml
id: eiken2                       # ファイル名と同じにする（小文字英数字とハイフン）
title: 英検2級・TOEIC600レベル   # メニューに表示される名前
description: 日常・ビジネスの基本語彙   # 任意
level: toeic600                  # 任意（例文のレベルの基準。config.yaml の levels のキー。下記「例文のレベル」）
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
- 基準は `config.yaml` の `levels` に書きます（答えの単語のレベル、答え以外の単語の上限、上限を超えてよい語数、語数の範囲）。点数帯と CEFR の対応は ETS が公表している TOEIC L&R と CEFR の対応に合わせています
- 文の途中の大文字で始まる語で、単語表に無いもの（人名・地名）は判定から外します
- 判定の限界: 品詞は見分けないので、同じ綴りの語は一番易しい品詞のレベルになります。`according to` のような 2 語以上の見出しはまだ使っていません。単語表（約 9,900 語）に無い語は `?` と表示され、上限を超える語として数えます

## 音声

`speech.tts` を設定していると、例文の音声は `npm run tts`（公開時は CI）で生成されます。例文を直すとその問題の音声だけ作り直しになります。音声がまだ無い問題はブラウザの声で読まれるので、問題の追加・修正のときに何かする必要はありません。
