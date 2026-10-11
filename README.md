# 迷路ジェネレーター

ブラウザで遊べる、自由サイズの迷路ジェネレーターです。マス数を指定して穴掘り法の迷路を作れます。

## GitHub Pagesで公開する

1. このリポジトリをGitHubにpushします。
2. GitHubリポジトリの **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選びます。
3. `main`または`master`ブランチへのpush後、Actionsのデプロイが完了すると公開されます。

`.github/workflows/pages.yml`がビルドした`public/`の内容をGitHub Pagesへデプロイします。HTMLとJavaScriptは`public/`に、Tailwind CSSの編集元は`src/styles.css`に置きます。ビルド後のCSSは`public/styles.css`に出力されます。

## ローカルで起動する

Node.js 24 と pnpm 11 を使います。

最初にTailwind CSSの依存関係をインストールしてCSSをビルドします。

```sh
pnpm install
pnpm run build:css
```

リポジトリのルートで簡易Webサーバーを起動し、`http://localhost:8000`を開きます。

```sh
python3 -m http.server 8000 --directory public
```

`src/styles.css`がTailwind CSSのソースです。スタイルを変更したときは`pnpm run build:css`で`public/styles.css`を生成してください。開発中に自動更新する場合は`pnpm run watch:css`を別のターミナルで実行します。GitHub Pagesのワークフローも公開前にCSSをビルドします。

## 機能

- 5×5から101×101まで、好きなマス数の正方形迷路を生成
- 穴掘り法で迷路を生成
- スタートは左上、ゴールは右下
- 矢印キー、WASD、画面上の方向ボタンでプレイ
- 正解ルートと進む順番を表示
- 問題のみ、問題と解答を別ページ、解答のみをA4印刷
- 迷路と進行状況をブラウザ内に保存し、履歴から再開

履歴はIndexedDBを使って、利用している端末とブラウザに保存します。サーバーへの送信やアカウント登録はありません。
