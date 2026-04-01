# 🍜 后门小吃出品手册

**标准化出品管理系统** — 后门小吃门店内部使用的菜品配方管理工具。

线上地址：https://chupin.ayakoai.com

## 功能

- **📖 菜品查询** — 员工快速查看菜品配方、原材料用量、制作步骤
- **⚙️ 管理后台** — 管理员登录后可新增/编辑/删除/复制菜品
- **🏷️ 分类管理** — 自定义菜品分类（主食、小菜、汤品等）
- **📋 一键复制** — 配方文本一键复制到剪贴板
- **🖨️ 打印** — 单道菜品打印友好页面
- **💬 企业微信** — 一键推送配方到后门小吃企业微信群
- **🔍 搜索** — 按菜名或分类快速过滤
- **📱 移动端适配** — 手机端友好，员工可随时查阅

## 技术栈

- **前端：** 纯 HTML + CSS + JavaScript（无框架），移动端优先响应式设计
- **后端：** Node.js 原生 HTTP Server（无框架），PM2 进程管理
- **数据存储：** JSON 文件（`recipes.json` / `categories.json`）
- **反向代理：** Nginx（`/api/` → `127.0.0.1:3000`）
- **部署：** 腾讯云轻量服务器，Let's Encrypt SSL

## 项目结构

```
├── index.html          # 前端主页面
├── assets/
│   ├── css/style.css   # 样式
│   └── js/app.js       # 前端逻辑
├── chupin-api.js       # Node.js 后端 API
├── recipes.json        # 菜品数据
├── categories.json     # 分类数据
├── version.json        # 前端版本号
├── start-api.sh        # 启动脚本
├── stop-api.sh         # 停止脚本
├── restart-api.sh      # 重启脚本
└── README.md           # 本文件
```

## API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/recipes` | 获取所有菜品 | 无 |
| POST | `/api/recipes` | 新增菜品 | X-Admin-Token |
| PUT | `/api/recipes/:id` | 更新菜品 | X-Admin-Token |
| DELETE | `/api/recipes/:id` | 删除菜品 | X-Admin-Token |
| GET | `/api/categories` | 获取分类列表 | 无 |
| POST | `/api/categories` | 新增分类 | X-Admin-Token |
| DELETE | `/api/categories/:name` | 删除分类 | X-Admin-Token |
| POST | `/api/send-webhook` | 推送到企业微信 | 无 |
| GET | `/api/health` | 健康检查 | 无 |

## 运维

```bash
# 启动后端（PM2）
pm2 start chupin-api.js --name chupin-api
pm2 save

# 查看日志
pm2 logs chupin-api

# 重启
pm2 restart chupin-api
```

## 更新日志

- **v003 (2026-04-01)** — 管理后台重构：拆分为菜品列表/添加编辑/分类管理三个子页面；按分类分组展示；新增 6 道夏季菜品（凉面系列、手枪腿、鸡块串）
- **v002 (2025-11-01)** — 前端初始化修复，API 优先加载，PM2 进程管理
- **v001 (2025-10-29)** — 初始版本，基础 CRUD 功能

---

后门小吃 · 内部工具
