# TEAM AIC ｛AI Circle｝

TEAM AIC official site and open source activity log.

TEAM AICは、横塚翔太が町田を起点に進めるAIのオープンソースプロジェクトです。
教育・福祉・地域産業・政治・経済・暮らしの課題を、AIを活用しながら研究し、活動の過程をできるだけ公開しながら進めています。

- 公式サイト（GitHub Pages）: https://sy-08.github.io/team-aic/
- 本リポジトリは、公式サイトのソースコードと、活動ログ・下書き・設計図を保管する場所です。

## 仕組み（Notion起点・GitHub中継型）

| 役割 | 場所 |
| --- | --- |
| 管理データベース・頭脳 | Notion |
| 公開用データ置き場・中継役 | GitHub（このリポジトリ） |
| 外向きの公式HP | GitHub Pages |

Notionで育てた内容を、公開できる形に整えてGitHubへ中継し、GitHub Pagesで発信しています。

## 技術構成

- 静的HTML / CSS / JavaScriptのみ（ビルドツール・フレームワーク不使用）
- 追加課金なし（GitHub Pagesの無料枠のみで運用）
- スマホ対応（レスポンシブレイアウト）
- SEO基礎対応（`title` / `meta description` / OGP / `robots.txt` / `sitemap.xml`）

## ディレクトリ構成

```
.
├── index.html            トップページ
├── about.html             About（TEAM AICについて）
├── activities.html        活動領域
├── profile.html            プロフィール
├── open-source.html       Open Source（公開方針）
├── live-build.html         Live Build Log（実行中のログ）
├── blueprints.html         Blueprints（設計図）
├── prompts.html            Prompts（AIへの指示・プロンプト）
├── note-drafts.html       Note Drafts（note転記の下書き）
├── book.html               Book Materials（本化素材）
├── youtube.html            YouTube Drafts（動画案）
├── roadmap.html            Roadmap（今後の方向性）
├── contact.html            Contact（お問い合わせ）
├── robots.txt
├── sitemap.xml
├── assets/
│   ├── css/style.css       共通スタイル（白ベース・緑アクセント・Apple × Notion風）
│   ├── js/main.js          共通スクリプト（モバイルナビ・アクティブリンク等）
│   └── img/                画像素材置き場
└── docs/
    ├── live-log/           実行ログの本体（Markdown）
    ├── blueprints/         設計図・構成図の本体
    ├── prompts/            プロンプト集の本体
    ├── manga/              漫画関連の素材（AIクリエイティブ自由研究）
    ├── note-drafts/        note転記用下書きの本体
    ├── youtube-drafts/     YouTube動画案の本体
    ├── book-materials/     本化素材の本体
    └── security/           公開前チェックリストなど運用ルール
```

各HTMLページは概要・方針を示し、実体のログや下書きは対応する `docs/` 配下のMarkdownファイルに蓄積していく構成です。

## 公開ポリシー

TEAM AICは活動の過程をできるだけ公開する方針ですが、以下は絶対に公開しません。

- APIキー・トークン・パスワード・`.env`
- 個人情報、家族や第三者が特定される情報
- 守秘義務情報
- 管理画面URL

コミット前は必ず [`docs/security/publish-checklist.md`](docs/security/publish-checklist.md) を確認してください。

## ローカルでの確認方法

ビルド不要です。`index.html` などをブラウザで直接開くか、リポジトリ直下で簡易サーバーを立てて確認できます。

```
python -m http.server 8000
```

## ライセンス

現時点では未定です。今後の活動状況に応じて検討します。
