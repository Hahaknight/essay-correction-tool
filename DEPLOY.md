# 作文 AI 批改工具 - 部署指南

## 方案 B：Docker 部署（推荐）

### 前置要求
- Docker >= 20.10
- Docker Compose >= 2.0

### 快速部署

1. 复制环境变量配置文件并填入 API Key：
```bash
cp .env.example .env
# 编辑 .env，填入 MINIMAX_API_KEY
```

2. 构建并启动：
```bash
docker-compose up -d
```

3. 访问 http://localhost:3000

### 查看日志
```bash
docker-compose logs -f
```

### 停止服务
```bash
docker-compose down
```

### 数据持久化

- 任务数据保存在 `./tasks` 目录
- 报告数据保存在 `tasks/{taskId}/reports/` 目录

## 方案 A：直接部署

### 环境要求
- Node.js >= 18
- npm >= 9

### 安装步骤

```bash
npm install
npm run build
npm start
```

`npm start` 运行 Next.js standalone server，请先完成 `npm run build`。

### 上线前检查

```bash
npm run lint
npm run test
npm run build
```

### 环境变量

在 `.env` 文件中配置：
```
MINIMAX_API_KEY=你的_API_密钥
MINIMAX_API_HOST=https://api.minimaxi.com
MINIMAX_TEXT_MODEL=MiniMax-M3
MINIMAX_VISION_MODEL=MiniMax-M3
MINIMAX_CORRECTION_TEMPERATURE=0.3
MINIMAX_CORRECTION_TIMEOUT_MS=300000
MINIMAX_CORRECTION_MAX_TOKENS=12000
MINIMAX_CORRECTION_MAX_RETRIES=2
MINIMAX_CORRECTION_RETRY_DELAY_MS=5000
```
