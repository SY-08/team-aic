# team AIC朝刊の同期設計

## 正本

Notionの「08-19 TEAM AIC朝刊 運用設計（非公開）」を運用仕様の正本とし、記事データは次の2つのデータベースで管理します。

- 「AI日報アーカイブ」：AI・テクノロジー、教育、福祉、ビジネス
- 「日本の裏側アーカイブ」：政治・行政

データベースは、確認項目やプロパティが異なるためNotion上では統合しません。公開時だけGitHub Pages側で統合します。

## 公開フロー

```text
Notionで記事を作成
        ↓
公開状態を「公開」にする
        ↓
GitHub Actionsが毎時実行
        ↓
scripts/notion-sync.mjsが2つのDBを取得
        ↓
公開記事だけを日付の新しい順に統合
        ↓
ai-daily.htmlへ反映
        ↓
GitHub Pagesで公開
```

Notionの「下書き」「確認済み」は公開対象にしません。記事の事実と示唆を分け、朝刊には事実を掲載します。

## ジャンル

公開ページでは、次のボタンで表示を切り替えます。

- すべて
- 政治・行政
- AI・テクノロジー
- 教育
- 福祉
- ビジネス

ジャンルごとにカードの左線とタグの色を変えています。旧URL `japan-inside.html` は、`ai-daily.html?genre=politics` へ誘導します。

## 実装箇所

- `scripts/notion-sync.mjs`：2つのDBを取得・安全性チェック・日付順統合
- `ai-daily.html`：朝刊ページ、ジャンル切替ボタン、同期マーカー
- `assets/js/main.js`：ジャンル切替とURLパラメータの処理
- `assets/css/theme-sax-blue.css`：ジャンル別カラーとスマホ表示
- `japan-inside.html`：旧URLからの誘導ページ
- `.github/workflows/notion-sync.yml`：毎時の同期実行

## 品質ゲート

- 公開状態が「公開」の記事だけを表示する
- 記事を日付の新しい順に並べる
- 出典URLを表示する
- 秘密情報らしい文字列を検知した記事は出力しない
- 政治・行政の事実と個人の示唆を同じ記事として扱わない
- スマホ幅でもジャンルボタンを操作できる
