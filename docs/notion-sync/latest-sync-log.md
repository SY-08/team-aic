# Notion Sync Log

このファイルは、`scripts/notion-sync.mjs`（GitHub Actions: `.github/workflows/notion-sync.yml`）が
Notion「08 Website CMS」からGitHub Pagesへ同期した結果を記録する場所です。

同期スクリプトは、実行のたびにこのファイルの内容を更新します（実際に何か変更があった場合のみコミットされます）。

---

## 2026-07-07 18:35:30 UTC — sync run
- SKIPPED: `NOTION_TOKEN` または `NOTION_08_WEBSITE_CMS_PAGE_ID` が未設定のため、同期をスキップしました。

## 2026-07-07 16:37:56 UTC — sync run
- SKIPPED: `NOTION_TOKEN` または `NOTION_08_WEBSITE_CMS_PAGE_ID` が未設定のため、同期をスキップしました。

## 2026-07-07 — 初期セットアップ（同期スクリプトはまだ未実行）

- 同期の仕組み（`scripts/notion-sync.mjs` / `.github/workflows/notion-sync.yml`）を構築した
- 各HTMLページに、Notion本文を差し込むための同期マーカー（`<!-- notion-sync:content:... -->`）と、
  「Synced from Notion: 08 Website CMS」バッジを追加した
- **この時点では、GitHub Secrets（`NOTION_TOKEN` / `NOTION_08_WEBSITE_CMS_PAGE_ID`）が未設定のため、
  実際のNotion APIとの通信・同期はまだ行われていません。**
- Secretsを設定し、GitHub Actionsを手動実行（`workflow_dispatch`）すると、この節の下に実際の同期結果が追記されます。

### 想定される同期結果のフォーマット（次回実行以降）

```
## 2026-XX-XX HH:MM UTC — sync run
- OK: 08-01 Home → index.html（更新あり）
- OK: 08-02 About → about.html（変更なし）
- SKIP (warning): 08-XX XXXX → 公開NGらしきパターンを検知したため出力をスキップしました
- ERROR: 08-XX XXXX → 取得に失敗しました（詳細はGitHub Actionsのログを参照）
```

## 次のステップ

1. GitHub Secretsに `NOTION_TOKEN` と `NOTION_08_WEBSITE_CMS_PAGE_ID` を設定する
2. GitHub Actionsの `Notion Sync` ワークフローを手動実行する
3. このファイルに実際の同期結果が追記されることを確認する
