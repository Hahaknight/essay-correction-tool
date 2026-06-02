# 浣滄枃 AI 鎵规敼宸ュ叿

鎵归噺涓婁紶瀛︾敓浣滄枃鍥剧墖锛岄€氳繃 Minimax AI 鑷姩璇嗗埆鏂囧瓧骞惰繘琛屼綔鏂囨壒鏀癸紝鐢熸垚璇︾粏鐨?HTML 鎶ュ憡銆?
## 鍔熻兘

- 鎵归噺涓婁紶浣滄枃鍥剧墖锛堟敮鎸?jpg/png/webp锛?- 鑷姩鎸夋枃浠跺悕鍒嗙粍瀛︾敓浣滄枃
- AI 鍥惧儚璇嗗埆鎻愬彇鏂囧瓧
- AI 浣滄枃鎵规敼锛堣瘎鍒嗐€佷紭鐐广€侀棶棰樸€佷慨鏀瑰缓璁級
- 鐢熸垚鏀硅壇鐗堜綔鏂?- 宸ヤ綔鍙板紡鎵规敼娴佺▼锛堣鍒欍€佷笂浼犮€佽繘搴︺€佺粨鏋滃湪鍚屼竴椤碉級
- 鎵归噺涓嬭浇宸叉垚鍔熸姤鍛婏紙ZIP锛?- 浠诲姟鍘嗗彶璁板綍銆佸崟绡囬噸璇曚笌涓€閿噸璇曞け璐ラ」

## 蹇€熼儴缃诧紙Docker锛?
### 鍓嶇疆瑕佹眰
- Docker >= 20.10
- Docker Compose >= 2.0

### 鍚姩姝ラ

1. 澶嶅埗鐜閰嶇疆鏂囦欢锛?```bash
cp .env.example .env
```

2. 缂栬緫 `.env`锛屽～鍏ヤ綘鐨?API Key锛?```
MINIMAX_API_KEY=浣犵殑Minimax API瀵嗛挜
MINIMAX_API_HOST=https://api.minimaxi.com
MINIMAX_TEXT_MODEL=MiniMax-M3
MINIMAX_VISION_MODEL=MiniMax-M3
MINIMAX_CORRECTION_TEMPERATURE=0.3
MINIMAX_CORRECTION_TIMEOUT_MS=300000
MINIMAX_CORRECTION_MAX_TOKENS=12000
MINIMAX_CORRECTION_MAX_RETRIES=2
MINIMAX_CORRECTION_RETRY_DELAY_MS=5000
```

3. 鏋勫缓骞跺惎鍔細
```bash
docker-compose up -d
```

4. 璁块棶 http://localhost:3000

### 甯哥敤鍛戒护

```bash
# 鏌ョ湅鏃ュ織
docker-compose logs -f

# 鍋滄鏈嶅姟
docker-compose down

# 閲嶅惎鏈嶅姟
docker-compose restart
```

## 鏈湴寮€鍙?
```bash
npm install
npm run dev
```

璁块棶 http://localhost:3000

## 璐ㄩ噺妫€鏌?
```bash
npm run lint
npm run test
npm run build
```

鐢熶骇鏋勫缓浣跨敤 Next.js standalone 杈撳嚭锛宍npm run start` 浼氳繍琛?`.next/standalone/server.js`銆傝鍏堟墽琛?`npm run build`銆?
## 鏂囦欢鍛藉悕瑙勫垯

涓婁紶鍥剧墖鏃惰鎸?`瀛︾敓濮撳悕-椤电爜.jpg` 鏍煎紡鍛藉悕锛屼緥濡傦細
- `寮犱笁-1.jpg`銆乣寮犱笁-2.jpg`
- `鏉庡洓-1.jpg`

绯荤粺浼氳嚜鍔ㄦ寜瀛︾敓濮撳悕鍒嗙粍銆?
## 鎶€鏈爤

- Next.js 16 + TypeScript + Tailwind CSS
- Minimax MCP (鍥剧墖璇嗗埆)
- Minimax Chat API (浣滄枃鎵规敼)
- JSZip (鎶ュ憡鎵撳寘)
