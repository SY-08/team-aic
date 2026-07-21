# GitさんとGitHub氏のお勉強会: 毎日自動公開

このコースは、GitとGitHubを初めて使う人が、用語だけでなく実際の作業の流れまで理解できるように作った全18話の基礎コースです。

## 仕組み

1. `curriculum.json` に全18話の完成原稿と公開順を保管します。
2. `update-state.json` に公開済みの話数を記録します。
3. GitHub Actionsが毎朝8:10（日本時間）に `scripts/git-github-course-auto-update.mjs --publish-next` を実行します。
4. スクリプトは次の1話を `git-github.html` へ追加し、状態ファイルを更新します。
5. 変更があればActionsがmainへ自動コミットします。

GitHubの作業履歴がない日でも、1日1話ずつ公開します。第18話で基礎コースは完結します。すでに公開済みの話を重複追加しません。

## ローカル確認

```powershell
node scripts/git-github-course-auto-update.mjs --check
node scripts/git-github-course-auto-update.mjs --dry-run
```

`--dry-run` は次回に公開する話を表示するだけで、ファイルを更新しません。

## 手動で今すぐ1話公開する場合

GitHubの `Actions` タブから `Git/GitHub course daily publish` を選び、`Run workflow` を実行します。通常は毎朝の自動実行を待てば大丈夫です。
