# 問題データの書き方

## 問題集ファイル（`content/questions/<id>.yaml`）

```yaml
id: eiken2                       # ファイル名と同じにする（小文字英数字とハイフン）
title: 英検2級・TOEIC600レベル   # メニューに表示される名前
description: 日常・ビジネスの基本語彙   # 任意
questions:
  - answer: postponed            # 書き取る綴り（小文字 a-z のみ）
    sentence: The meeting was postponed until Monday.   # 読み上げる例文
    meaning: 延期された          # 答えの意味（出題中に表示）
    translation: 会議は月曜日まで延期された。         # 例文の和訳（解答後に表示）
    tags: [business]             # 任意
    note: 自分用メモ             # 任意（ゲームには配信されない）
```

### ルール

- `answer` は例文に出てくる形そのまま（`postpone` ではなく `postponed` など）。例文の中に**単語として**含まれている必要があります（`post` は `postponed` の一部なので不可）。
- 文頭で大文字になっていても構いません（`However, ...` に対して `answer: however`）。
- 同じ単語が例文に複数回出てくる場合、空欄になるのは最初の1つです。
- `answer` にアポストロフィやハイフン、スペースは使えません（画面のキーボードが a〜z のみのため）。

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
