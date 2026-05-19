# Study Tracker — 学习进度追踪

一个面向大学生的本地学习助理 Web App，帮助追踪多门课程的作业、复习计划和学习状态。

## 快速启动

```bash
# 1. 创建虚拟环境（首次）
python3 -m venv venv
source venv/bin/activate

# 2. 安装依赖
pip install -r requirements.txt

# 3. (可选) 配置 AI 助理
cp .env.example .env
# 编辑 .env，填入你的 Anthropic API Key

# 4. 启动应用（自动初始化数据库 + 预置示例数据）
python app.py

# 5. 浏览器打开 http://localhost:5001
```

首次启动会自动创建 SQLite 数据库并插入 3 门示例课程（高等数学、大学英语、数据结构）及配套作业、复习任务、笔记和时间记录。

## 功能概览

| 功能 | 说明 |
|------|------|
| **Dashboard** | 考试倒计时、综合评分、课程进度条、本周作业完成率、本周学习时长柱状图、今日待办 |
| **作业追踪** | 按课程筛选、优先级标记、临近截止高亮、一键完成 |
| **复习计划** | 按课程分组、三态进度（未开始/进行中/已完成）、每日任务提示、导出 PDF |
| **学习笔记** | Markdown 编辑 + 实时预览、标签系统、全文搜索 |
| **Time Log** | 按课程记录每日学习时长、本周汇总、Dashboard 柱状图（Chart.js） |
| **AI 助理** | 右下角悬浮聊天窗，Markdown 渲染，解答问题 + 复习建议 |

## 配置 AI 助理

1. 前往 [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) 获取 API Key
2. 在项目根目录创建 `.env` 文件：`DEEPSEEK_API_KEY=你的key`
3. 重启应用即可使用右下角 💬 聊天按钮

不配置 API Key 不影响其他功能使用。

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+1` ~ `Ctrl+5` | 切换 Tab（Dashboard / 作业 / 复习 / 笔记 / Time Log） |
| `Esc` | 关闭弹窗 |

## 技术栈

- **后端**: Python + Flask
- **数据库**: SQLite（数据存储在 `study_tracker.db`）
- **前端**: 原生 HTML/CSS/JS + Chart.js + marked.js（CDN 引入）
- **PDF**: WeasyPrint
- **AI**: Anthropic Claude API

## 文件结构

```
study-tracker/
├── app.py              # Flask 主程序 + API 路由
├── database.py         # SQLite 数据库操作 + 种子数据
├── requirements.txt    # Python 依赖
├── .env.example        # 环境变量模板
├── static/
│   ├── style.css       # 样式表
│   └── app.js          # 前端逻辑
├── templates/
│   └── index.html      # 页面模板
└── README.md
```