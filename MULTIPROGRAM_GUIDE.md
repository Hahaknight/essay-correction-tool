# 作文批改助手小程序开发经验

> 源项目： essay-correction-tool (Web版)
> 撰写时间： 2026/05/28

---

## 一、核心技术建议

### 1.1 技术选型

| 组件 | 推荐方案 | 理由 |
|------|----------|------|
| 框架 | Taro + React / uni-app + Vue | 跨平台，一套代码支持微信/支付宝 |
| 状态管理 | zustand / pinia | 轻量，适合小程序 |
| 网络请求 | flyio / taro-request | 小程序兼容性好 |
| 存储 | localStorage + 文件系统 | 任务数据本地缓存 |

### 1.2 架构建议（参考现有服务层设计）

```
src/
├── services/
│   ├── taskService.ts       # 任务管理（创建/状态/存储）
│   ├── apiService.ts        # 调用后端 AI 批改接口
│   └── storageService.ts    # 本地存储抽象
├── pages/
│   ├── index/               # 首页 - 创建任务/上传
│   ├── task/                # 任务详情 - 批改进度/结果
│   └── report/              # 报告查看
├── components/
│   ├── ImageUploader/       # 图片上传组件
│   ├── StudentCard/         # 学生卡片
│   └── CorrectionReport/    # 批改报告展示
└── utils/
    ├── fileNameParser.ts    # 沿用现有解析逻辑
    └── errorHandler.ts      # 统一错误处理
```

**关键原则**：
- 服务层抽离业务逻辑，与 UI 解耦，方便后续复用
- 文件名解析规则直接复用：`学生姓名-页码.jpg`
- 后端接口保持兼容，参考现有的 API 设计

### 1.3 后端接口设计（沿用现有逻辑）

建议复用现有 Web 版的 API，只需要开发小程序端调用：

```
POST /api/tasks                    # 创建任务
POST /api/tasks/:taskId/upload     # 上传图片（小程序 Base64 或 FormData）
GET  /api/tasks/:taskId/status     # 轮询批改状态
GET  /api/tasks/:taskId/report/:studentName  # 获取单个报告
GET  /api/tasks/:taskId/download   # 下载 ZIP（小程序可能需要转 Base64）
```

---

## 二、踩过的坑

### 2.1 超时问题 ⭐

**Web版经验**：
- 图片识别 + AI 评分实际需要 **3-5分钟**
- 默认超时太短会导致误判为失败

**建议小程序配置**：
```typescript
// 请求超时配置
requestTimeout: 300000,  // 5分钟
retryConfig: {
  maxRetries: 5,
  retryDelay: 30000,      // 30秒间隔
}
```

### 2.2 图片处理

**问题**：小程序拍照图片有时方向错误

**解决**：使用 `exif` 库纠正图片方向，或让后端处理

**小程序特定**：
- 微信小程序 imagesrc 需用合法域名
- 开发阶段可配，不验证域名

### 2.3 文件名解析

**保持与Web版一致**：
```typescript
// 匹配格式：学生姓名-页码.jpg
const FILE_NAME_REGEX = /([a-zA-Z0-9一-龥_.-]+)-(\d+)\.(jpg|jpeg|png|webp)$/i
```

### 2.4 任务状态同步

**问题**：轮询时状态丢失或不同步

**建议**：
- 后端每次状态更新写入磁盘（已实现 atomicWriteJson）
- 小程序端按 task.json 中的 students 数组展示状态
- 每个学生独立状态：pending → processing → completed/failed

---

## 三、安全经验（已有）

### 3.1 已解决的问题

| 漏洞类型 | 解决方案 |
|----------|----------|
| 路径遍历 | 文件名 sanitization |
| XSS | HTML报告 escapeHtml() |
| CSV注入 | 防止 =、+、-、@ 开头字段 |

### 3.2 小程序特有安全

- 图片上传签名验证（可用简单方案）
- 避免在 Storage 存敏感信息
- request 合法的 HTTPS 域名

---

## 四、开发流程建议

### 4.1 阶段划分

```
Phase 1: 接口对接
  - 调用后端现有 API
  - 实现上传、轮询、结果展示

Phase 2: UI 开发
  - 首页（创建/上传）
  - 任务详情页（进度条/卡片）
  - 报告查看页

Phase 3: 本地化优化
  - 本地缓存任务列表
  - 离线查看已批改报告
  - 断点续传

Phase 4: 体验打磨
  - 拍照优化
  - 批量上传
  - 分享报告
```

### 4.2 复用建议

可以直接从 Web 版复用的代码：

1. **fileNameParser.ts** - 文件名解析逻辑
2. **errorHandler** - callWithRetry 模式
3. **后端 API** - 无需修改，直接调用

---

## 五、关键配置参考

### 5.1 环境变量

```bash
# 后端保持不变
MINIMAX_API_KEY=sk-cp-...
MINIMAX_BASE_URL=https://api.minimaxi.chat
MINIMAX_VISION_MODEL=MiniMax-VL02
MINIMAX_TEXT_MODEL=MiniMax-M2.7
MINIMAX_CORRECTION_TEMPERATURE=0.3
```

### 5.2 重试策略（Web版已验证）

```typescript
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 30000;
const MCP_CALL_TIMEOUT_MS = 300000;
const AI_CORRECTION_TIMEOUT_MS = 300000;
```

---

## 六、经验总结

| 类别 | 经验 |
|------|------|
| **稳定性** | AI 批改是耗时操作，必须设置足够长的超时和重试 |
| **用户体验** | 进度实时展示，每个学生独立状态 |
| **数据持久化** | 后端用 atomicWriteJson 避免状态丢失 |
| **错误恢复** | 重试机制要足够健壮，30s 间隔给 API 恢复时间 |
| **安全** | 已有完整防护（路径遍历/XSS/CSV注入） |
| **架构** | 服务层抽离，方便后续扩展和维护 |

---

## 七、建议优先级

1. **优先**：复用后端 API，小程序只做 UI + 调用
2. **其次**：保持文件名解析规则一致
3. **最后**：根据小程序特性（拍照/分享）优化体验

---

> 如需了解具体代码实现，可参考 Web 版源码：
> - 任务服务：`src/services/taskService.ts`
> - 图片识别：`src/services/imageRecognitionService.ts`
> - AI 批改：`src/services/aiCorrectionService.ts`
> - 报告生成：`src/services/reportService.ts`
