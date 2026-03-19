# cursor2api Vue3 日志 UI

基于 Vue3 + Vite + TypeScript 构建的日志查看前端，替代原有的原生 HTML 页面，挂载在 `/vuelogs` 路由下。

## 技术栈

- Vue 3.5 + Pinia 状态管理
- Vite 6 构建工具
- TypeScript
- highlight.js（代码高亮）
- marked（Markdown 渲染）

## 目录结构

```
vue-ui/
├── src/
│   ├── App.vue              # 根组件
│   ├── main.ts              # 入口
│   ├── api.ts               # API 请求封装
│   ├── types.ts             # 类型定义
│   ├── components/
│   │   ├── LoginPage.vue    # 登录页
│   │   ├── AppHeader.vue    # 顶部导航
│   │   ├── LogList.vue      # 日志列表
│   │   ├── RequestList.vue  # 请求列表
│   │   ├── DetailPanel.vue  # 请求详情面板
│   │   ├── PayloadView.vue  # Payload 查看
│   │   └── PhaseTimeline.vue# 阶段时间线
│   ├── composables/
│   │   └── useSSE.ts        # SSE 实时推送
│   └── stores/
│       ├── auth.ts          # 登录状态
│       ├── logs.ts          # 日志数据
│       └── stats.ts         # 统计数据
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 开发

```bash
# 进入前端目录
cd vue-ui

# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
# 会自动将 /api 请求代理到 http://localhost:3010
npm run dev
```

开发时需同时启动后端服务：

```bash
# 在项目根目录
npm run dev
```

## 构建

```bash
cd vue-ui
npm run build
```

产物输出到项目根目录的 `public/vue/`，后端通过 `/vuelogs` 路由提供服务。

## 与原有日志页面的关系

| 路由 | 实现 | 鉴权方式 |
|------|------|----------|
| `/logs` | 原生 HTML（`public/logs.html`）| 服务端 cookie 鉴权 |
| `/vuelogs` | 本 Vue3 应用 | 前端登录页处理 |

两者独立共存，互不影响。
