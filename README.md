# 請求書作成システム

Firebase Firestore を使った、請求書作成 + 管理表一体型の簡易システムです。

## 画面

- `invoice.html`: 請求書作成
- `admin.html`: 管理画面（請求一覧 / 入金登録）
- `invoice-print.html?id=<invoiceId>`: 印刷用画面

## 対応要件

- 入力項目: 締め日、金額、相手先、振込期限、備考
- 税方式:
  - 税抜入力
  - 税込入力
- 税率:
  - 10%
  - 8%
  - 0%

## Firestore コレクション

- `invoices`: 請求書ヘッダ
- `payments`: 入金履歴

## 注意

- Firebase設定は `js/firebase.js` の `firebaseConfig` を使用しています。
- 無料プラン向けに、管理画面は直近300件のみ取得しています。
