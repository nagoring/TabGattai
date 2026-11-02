# TabMerge

開いているタブをワンクリックでまとめて保存し、必要なときに復元できる Chrome 拡張機能（Manifest V3）です。

**最大の特徴：重複 URL の最新優先統合** — 保存済みの URL を再度保存すると、古いグループからその URL を取り除き、最新の保存グループへ移動します。保存データ全体で同じ URL は常に 1 件だけです。

## 主な機能

- ツールバーアイコンのクリックで現在のウィンドウのタブを保存して閉じ、管理画面を表示
  - `chrome://` などの保存できないページ、固定タブ（設定で変更可）、管理画面自身は対象外
  - 保存対象がない場合は空グループを作らず、管理画面で通知
- 保存グループ（日時ごと）：すべて復元／削除／名前変更／折りたたみ／URL コピー
- 個別復元（クリックで開く。Ctrl/⌘/Shift/中クリックでバックグラウンドで開く）・個別削除
- 復元成功分のみ保存データから削除（設定で OFF 可）。失敗分は残る
- タイトル・URL の横断検索（部分一致・大小文字無視・リアルタイム）
- JSON エクスポート／インポート（形式検証・不正 URL 除外・ID/日時の安全化・重複統合・事前バックアップ）
- ライト／ダーク／OS 連動テーマ、日本語（初期値）／英語
- 管理画面はアイコン右クリック →「オプション」からも開けます（追加権限なし）

## 開発

```bash
npm install
```

```bash
npm run build      # 型チェック + dist/ に拡張機能を出力
```

```bash
npm test           # ユニットテスト (Vitest)
```

```bash
npm run e2e        # 実 Chromium に拡張を読み込んで E2E 確認（Playwright が必要）
```

Chrome で `chrome://extensions` →「デベロッパーモード」→「パッケージ化されていない拡張機能を読み込む」で `dist/` を選択します。

```bash
npm run zip        # ビルドしてストア提出用の tabmerge-<version>.zip を作成
```

```bash
npm run store-images   # ストア用スクリーンショット・プロモーション画像を store/assets/ に生成（Playwright が必要）
```

アイコンは `assets/brand/logo.png` から `npm run icons` で `public/icons/` に再生成できます（Python + Pillow が必要）。

## Chrome ウェブストア公開

掲載用の説明文・権限の説明・プライバシー項目の記入例は [store/listing.ja.md](store/listing.ja.md) / [store/listing.en.md](store/listing.en.md)、画像は `store/assets/{ja,en}/` にあります。

## 構成

```
public/manifest.json         MV3 マニフェスト（権限: tabs, storage, favicon）
public/_locales/{ja,en}      拡張機能名・説明の多言語化
src/background/index.ts      Service Worker（ツールバークリック → 保存）
src/core/                    UI 非依存のロジック
  types.ts                   データモデル（Tab / Group / Storage, schemaVersion）
  url.ts                     保存可否・危険スキーム拒否・重複判定キー duplicateKey()
  merge.ts                   重複統合（最新優先）ロジック
  storage.ts / lock.ts       永続化・書き込み検証・排他制御・マイグレーション
  services.ts                保存 / 復元 / 編集 / インポートのユースケース
  importExport.ts            JSON 形式・厳密な検証
  search.ts                  検索
src/manager/                 管理画面（React）
src/i18n/                    UI 文言（日本語・英語）
tests/                       ユニットテスト
e2e/run.mjs                  ブラウザ E2E
docs/                        プライバシーポリシー（日・英）
assets/brand/                ロゴ原画
store/                       ストア掲載文・画像と生成スクリプト
```

## 設計上のポイント

### 重複判定（`src/core/url.ts` `duplicateKey`）
v1 は **ブラウザから取得した URL 文字列の完全一致**。フラグメント・クエリを区別し、末尾スラッシュや大文字小文字は正規化しません。将来の正規化ルールに備え独立関数とし、統合関数は判定関数を差し替え可能です。

### 統合ルール（`src/core/merge.ts`）
- 新規保存グループは時刻に関わらず常に最新として扱い、他グループから同じ URL を削除
- 古いグループが 0 件になったら自動削除。重複がないグループは変更しない（同一オブジェクトのまま）。グループ名は変更しない
- **同一保存処理内の重複は「最後に処理されたタブ」を採用**。処理順はタブバーの並び順（index 昇順）であり、最終アクセス日時ではありません（＝最も右のタブのタイトルが採用されます）
- インポート時は `createdAt` の新しい順で統合。同時刻なら既存データ優先のため、同じ JSON を何度インポートしても増えません

### データ安全性
- 全データを `chrome.storage.local` の **単一キー** に保存し、書き込みを原子的にしています
- 読み取り→変更→書き込みは Web Locks API（拡張機能オリジン全体で共有）で排他。Service Worker と複数の管理画面タブからの同時操作でも消失しません
- 保存処理は「書き込み → 読み戻して検証 → 管理画面表示 → タブを閉じる」の順。書き込み・検証に失敗した場合はタブを一切閉じません
- 保存処理全体も直列化されるため、連続クリックでも同じタブを二重保存しません
- Service Worker は状態を持たず、毎回ストレージから読み込むため停止・再起動に影響されません
- 新しい `schemaVersion` のデータを検出した場合は読み書きを拒否し、上書きしません

### セキュリティ
- 開く URL は `http:` `https:` `file:` のみ許可（`javascript:` `data:` 等は拒否）
- `innerHTML` 等は使用せず、React のエスケープ済み描画のみ
- 外部 CDN・リモートコード・外部通信なし。ホスト権限なし。コンテンツスクリプトなし
- インポート：サイズ・件数上限、形式/バージョン検証、URL 検証、制御文字除去、ID の再生成、未来日時の補正

## 権限

| 権限 | 理由 |
| --- | --- |
| `tabs` | タブの URL・タイトル取得、保存後のクローズ、復元時のオープン |
| `storage` | 保存データ・設定の保存 |
| `favicon` | Chrome の端末内キャッシュからファビコンを表示（ネットワーク通信なし、画像データを保存しない） |

## テスト対応表

| 指示書の項目 | テスト |
| --- | --- |
| 重複なし／同一グループ内重複／グループ間重複／3グループ以上／グループが空に／クエリ差異／フラグメント差異／タイトル差異 | `tests/merge.test.ts` |
| 1タブ保存／100タブ保存／保護ページ混在／保存中エラー（書き込み失敗・検証失敗）／同時保存／再起動後の永続性 | `tests/services.test.ts`、`e2e/run.mjs` |
| 個別復元／一括復元／一部失敗 | `tests/services.test.ts`、`e2e/run.mjs` |
| 1,000件以上の表示・検索 | `tests/display.test.tsx` |
| 正常な JSON／不正な JSON／既存データとの重複／複数回インポート／不正 URL／未対応バージョン／未来日時・不正 ID | `tests/import.test.ts` |

## プライバシー

- [プライバシーポリシー（日本語）](docs/privacy-policy.ja.md)
- [Privacy Policy (English)](docs/privacy-policy.en.md)

## ライセンス

[MIT License](LICENSE)
