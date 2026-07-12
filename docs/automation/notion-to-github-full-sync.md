# Notion → GitHub → GitHub Pages フル同期の仕組み

TEAM AICの公式サイトは、Notionの「08 Website CMS（HP同期元・Notion正本）」を正本として管理し、
GitHub Actionsによって自動的にこのリポジトリへ反映され、GitHub Pagesで公開されます。

```
Notion（08 Website CMS）
   │  Notion API（読み取りのみ）
   ▼
GitHub Actions（scripts/notion-sync.mjs）
   │  安全チェック → HTMLへ変換 → 差分がある場合のみコミット
   ▼
GitHub（このリポジトリ, main ブランチ）
   │
   ▼
GitHub Pages（公開サイト）
```

## 役割分担

- **Notion**：管理データベース・頭脳。すべてのページの正本はここにあります。
- **GitHub**：公開用データ置き場・中継役。Notionの内容を、公開できる形に整えて保管します。
- **GitHub Pages**：外向きの公式HP。GitHubの内容がそのまま公開されます。

今後、サイトの内容を更新する場合は、**GitHubのHTMLを直接編集するのではなく、Notion「08 Website CMS」を編集**します。
編集内容は、GitHub Actionsの自動実行（1時間おき）または手動実行によって、GitHubへ反映されます。

## Notionの構造とGitHubの対応

| Notion | GitHub Pathの出力先 |
| --- | --- |
| 08-00 Site Map | （出力なし・Notion内の目次） |
| 08-01 Home | `index.html` |
| 08-02 About | `about.html` |
| 08-03 Activities | `activities.html`（08-03-01〜04はページ内セクションとして反映） |
| 08-04 Profile | `profile.html` |
| 08-05 Open Source | `open-source.html` |
| 08-06 Live Build Log | `live-build.html` |
| 08-07 Blueprints | `blueprints.html` |
| 08-09 Automation | `automation.html`（08-09-01〜03はページ内セクションとして反映） |
| 08-10 note Drafts | `note-drafts.html` |
| 08-11 Book Materials | `book.html` |
| 08-12 YouTube Drafts | `youtube.html` |
| 08-13 Roadmap | `roadmap.html` |
| 08-14 Contact | `contact.html` |
| 08-15 勉強会活動 | `seminar.html` |

## 同期スクリプト（scripts/notion-sync.mjs）の処理内容

1. `NOTION_TOKEN` と `NOTION_08_WEBSITE_CMS_PAGE_ID` を環境変数から読み込む（未設定の場合は同期をスキップしてログに記録）
2. ルートページ（08 Website CMS）配下の子ページをNotion APIで取得する
3. マッピング表に従って、各子ページ（および08-03・08-09配下のサブページ）の本文ブロックを取得する
4. 見出し・段落・リスト・引用・コールアウト・区切り線・コードなどのNotionブロックを、サイトのデザインに合わせたHTMLへ変換する
5. 変換前のテキストに対して、公開NGパターン（APIキー・トークン・パスワードらしき文字列、個人情報らしき文字列など）を検知する
   - 検知した場合、そのページ・セクションの出力は行わず、既存の内容をそのまま残し、同期ログに警告のみ記録する（値そのものはログに残さない）
6. 各HTMLファイル内の `<!-- notion-sync:content:... -->` マーカー間だけを更新する（デザイン部分やナビゲーションなどの手作りの構成には触れない）
7. 内容に変化があったページのみ、「Synced from Notion」バッジの最終更新表示を更新する
8. 実行結果を `docs/notion-sync/latest-sync-log.md` に記録する

## GitHub Actions（.github/workflows/notion-sync.yml）

- `workflow_dispatch`：GitHubの画面から手動実行できます
- `schedule`：1時間おきに自動実行されます（`cron: '0 * * * *'`）
- 実行後、`git status` で差分がある場合のみ `git add . && git commit && git push` を行います（差分がなければ何もしません）

## 必要なGitHub Secrets

| Secret名 | 内容 |
| --- | --- |
| `NOTION_TOKEN` | Notion Integrationのシークレットトークン |
| `NOTION_08_WEBSITE_CMS_PAGE_ID` | 「08 Website CMS」ページのID |

これらの値は、コード・HTML・同期ログのいずれにも出力されません。

勉強会教材の生成は別の流れです。GPTタスクがNotionの活動記録から教材案を作り、`確認待ち` の状態で人が確認します。`scripts/seminar-draft.mjs` は必須項目と公開NG情報を確認するだけで、教材を自動公開しません。

## セキュリティ方針

- APIキー・トークン・パスワードをコードやHTMLに直書きしない
- `.env` はGitHubに含めない（`.gitignore` で除外）
- 個人情報、家族や第三者が特定される情報、顧客名、守秘義務情報は同期対象から除外する
- 医療・税務・法律の断定的な表現、強すぎる政治的表現が含まれる場合も、公開前に見直しの対象とする
- 公開NGらしい文字列を検知した場合は、そのページを出力せず、同期ログに警告のみを残す

詳しいチェック項目は [`docs/security/publish-checklist.md`](../security/publish-checklist.md) を参照してください。
