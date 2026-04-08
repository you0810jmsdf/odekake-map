# COCoLa おでかけMAP

GitHub Pages でそのまま公開できる、埋め込み向けの静的 Web アプリです。  
Google Maps JavaScript API を使う前提ですが、`config.js` に API キーが入っていない場合でも画面が壊れず、一覧と詳細パネルは表示されます。

## ファイル構成

- `index.html`: 埋め込み用のメイン画面
- `config.js`: API キーやフォーム URL などの設定
- `config.example.js`: 設定ファイルの見本
- `data/spots.json`: 表示するスポットデータ
- `data/boundary.json`: 地域境界ポリゴン
- `data/*.template.json`: 差し替え用テンプレート
- `assets/app.js`: 描画ロジック
- `assets/styles.css`: UI スタイル
- `embed-example.html`: iframe 埋め込み確認用サンプル
- `tools/validate-data.mjs`: データ形式チェック用スクリプト
- `PUBLISH_CHECKLIST.md`: 公開前の確認項目

## 公開手順

1. `config.example.js` を参考に `config.js` を編集する
2. `config.js` の `mapsApiKey` に Google Maps JavaScript API のキーを設定する
3. 必要なら `submitFormUrl` と `editFormUrl` に Google フォーム等の URL を設定する
4. `data/spots.json` を正式データに差し替える
5. `data/boundary.json` を正式な境界データに差し替える
6. `node .\\tools\\validate-data.mjs` でデータ確認を行う
7. GitHub Pages でこのフォルダを公開する

## まず編集するファイル

- `config.js`
- `data/spots.json`
- `data/boundary.json`
- `PUBLISH_CHECKLIST.md`

必要に応じて `config.example.js`、`data/spots.template.json`、`data/boundary.template.json` を見本として使ってください。

## GitHub Pages での注意

- API キーは公開前提になるため、Google Cloud 側で HTTP リファラ制限を必ず設定してください
- この実装はサーバー処理を持たないため、投稿と修正は外部フォーム連携を前提にしています
- 閲覧時にはジオコーディングしません。緯度経度は `data/spots.json` に保存済みの値を使います

## 埋め込み方法

`iframe` 埋め込みを想定しています。埋め込み時は `?embed=1` を付けると余白が抑えられます。

```html
<iframe
  src="https://YOUR-GITHUB-PAGES-URL/?embed=1"
  title="COCoLa おでかけMAP"
  loading="lazy"
  width="100%"
  height="900"
  style="border:0;"
></iframe>
```

## 補足

- 画面上部に設定状況パネルを表示するため、公開前に API キーやフォーム URL の入れ忘れに気づきやすくしています
- `?embed=1` を付けない場合は通常表示、付けた場合は埋め込み向けのコンパクト表示になります
- 公開前は `PUBLISH_CHECKLIST.md` を上から順に確認すると抜け漏れを減らせます

## データ検証

PowerShell で次を実行すると、スポットデータと境界データの形式をチェックできます。

```powershell
node .\tools\validate-data.mjs
```

ローカル表示確認は次で行えます。

```powershell
python -m http.server 8000
```

## データ形式

### `data/spots.json`

```json
[
  {
    "id": "spot-id",
    "name": "スポット名",
    "category": "shopping",
    "description": "説明文",
    "address": "住所",
    "reason": "おすすめ理由",
    "author": "投稿者名",
    "url": "https://example.com/",
    "lat": 35.0,
    "lng": 140.0
  }
]
```

### `data/boundary.json`

```json
{
  "name": "境界名",
  "paths": [
    { "lat": 35.0, "lng": 140.0 },
    { "lat": 35.1, "lng": 140.1 }
  ]
}
```
