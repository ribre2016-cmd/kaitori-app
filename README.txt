買取比較 A/B 自動価格版（Vercel構成）

ベスト構成:
- フロント: Vercel public
- API: Vercel Serverless Functions
- バーコード: Scandit
- 価格取得: /api/search がサーバー側で取得

アップロード:
1. このZIPを解凍
2. GitHubにアップロード
3. VercelでNew Project
4. Import
5. Deploy

または:
1. Vercel CLIを使える場合
2. フォルダで `npm install`
3. `npx vercel`

画面:
- 携帯版: A/B価格と差額だけ大きく表示
- PC版: 価格、タイトル、ジャンル、発売日、型番

注意:
- サイト構造変更で価格抽出が外れる場合があります。
- アクセス過多は避けてください。
- Scanditキーはトライアル期限があります。
