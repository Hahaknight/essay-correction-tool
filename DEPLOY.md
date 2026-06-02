# 浣滄枃 AI 鎵规敼宸ュ叿 - 閮ㄧ讲鎸囧崡

## 鏂规B锛欴ocker 閮ㄧ讲锛堟帹鑽愶級

### 鍓嶇疆瑕佹眰
- Docker >= 20.10
- Docker Compose >= 2.0

### 蹇€熼儴缃?
1. 澶嶅埗鐜鍙橀噺閰嶇疆鏂囦欢骞跺～鍏?API Key锛?```bash
cp .env.example .env
# 缂栬緫 .env锛屽～鍏?MINIMAX_API_KEY
```

2. 鏋勫缓骞跺惎鍔細
```bash
docker-compose up -d
```

3. 璁块棶 http://localhost:3000

### 鏌ョ湅鏃ュ織
```bash
docker-compose logs -f
```

### 鍋滄鏈嶅姟
```bash
docker-compose down
```

### 鏁版嵁鎸佷箙鍖?- 浠诲姟鏁版嵁淇濆瓨鍦?`./tasks` 鐩綍
- 鎶ュ憡鏁版嵁淇濆瓨鍦?`tasks/{taskId}/reports/` 鐩綍

## 鏂规A锛氱洿鎺ラ儴缃?
### 鐜瑕佹眰
- Node.js >= 18
- npm >= 9

### 瀹夎姝ラ

```bash
npm install
npm run build
npm start
```

`npm start` 杩愯 Next.js standalone server锛岃鍏堝畬鎴?`npm run build`銆?
### 涓婄嚎鍓嶆鏌?
```bash
npm run lint
npm run test
npm run build
```

### 鐜鍙橀噺
鍦?`.env` 鏂囦欢涓厤缃細
```
MINIMAX_API_KEY=浣犵殑API瀵嗛挜
MINIMAX_API_HOST=https://api.minimaxi.com
MINIMAX_TEXT_MODEL=MiniMax-M3
MINIMAX_VISION_MODEL=MiniMax-M3
MINIMAX_CORRECTION_TEMPERATURE=0.3
MINIMAX_CORRECTION_TIMEOUT_MS=300000
MINIMAX_CORRECTION_MAX_TOKENS=12000
MINIMAX_CORRECTION_MAX_RETRIES=2
MINIMAX_CORRECTION_RETRY_DELAY_MS=5000
```
