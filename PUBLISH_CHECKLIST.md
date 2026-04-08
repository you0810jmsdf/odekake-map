# 公開前チェックリスト

## 1. 設定

- `config.js` に `mapsApiKey` を設定した
- `config.js` に `submitFormUrl` を設定した
- `config.js` に `editFormUrl` を設定した
- `regionName` と `boundaryLabel` が公開文言として問題ない

## 2. Google Cloud

- Maps JavaScript API を有効化した
- API キーに HTTP リファラ制限を設定した
- 許可ドメインに GitHub Pages の URL を追加した

例:
- `https://YOUR-ACCOUNT.github.io/*`
- `https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/*`

## 3. データ

- `data/spots.json` を正式データに差し替えた
- `data/boundary.json` を正式境界データに差し替えた
- サンプル文言が残っていない
- カテゴリ値が `config.js` の `categoryDefinitions` と一致している

## 4. 動作確認

- `index.html` を通常表示で確認した
- `index.html?embed=1` を埋め込み表示で確認した
- カテゴリ切替が動く
- 検索が動く
- 詳細パネルが切り替わる
- 投稿ボタンと修正ボタンが正しい URL を開く

## 5. GitHub Pages

- 公開対象ブランチとフォルダを設定した
- 公開 URL で JSON 読み込みエラーが出ていない
- 埋め込み先のサイトで iframe 表示を確認した

## 6. ローカル検証コマンド

```powershell
node .\tools\validate-data.mjs
python -m http.server 8000
```
