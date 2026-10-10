# GitHub 热点雷达

## 🌐 在线体验

**[点击打开 GitHub 热点雷达 →](https://yann359.github.io/github-hot-radar/)**

无需安装，手机和电脑浏览器均可直接访问。

一个面向开源学习的手机优先网站：看近期受关注的仓库，读简短中文解读，收藏值得继续学习的项目。适合放进个人作品集，也能作为 React、TypeScript、GitHub API 和 Actions 的完整实践。

## 网站能做什么

- 涨星榜与新项目榜；切换近 1、7、10、30 天。
- 分类、编程语言、关键词筛选；打开仓库详情和 GitHub 原地址。
- DeepSeek 每天限量生成中文学习卡片；项目没有卡片时显示仓库原始资料。
- 本机收藏、已读、备注、JSON 导入导出。收藏数据只保存在当前浏览器，换设备需自行导出和导入。

**统计口径：**星标变化来自 [GitHub 官方日级历史接口](https://docs.github.com/en/rest/activity/starring#get-repository-star-history)。最新日尚未结算，日界线不保证对应北京时间或 UTC。榜单只覆盖当前发现并追踪的约 300 个候选仓库，不能代表全站无遗漏排行。GitHub Trending 用于发现候选；页面结构变化时会回退到官方搜索。

## 在电脑上运行

需要 Node.js 24 和 npm。

```powershell
npm install
npm run dev
```

打开终端显示的本地地址。首次没有采集数据时，网站会显示等待状态。要在本地获取真实数据，可以在当前终端设置 `GITHUB_TOKEN` 后运行 `npm run collect`。请勿将 token 写进源码、`.env.example` 或提交记录。没有 token 的匿名接口配额较低，约 300 个仓库的完整采集无法稳定完成。

如果暂时没有 token，可以运行 `npm run demo:data` 生成**明确标注的本地演示数据**，体验页面和收藏操作。正式采集会覆盖演示数据；演示 JSON 已被 `.gitignore` 排除，不会作为源码提交。

```powershell
$env:GITHUB_TOKEN = '<你自己的 GitHub token>'
npm run check:github
npm run collect
```

测试与构建：

```powershell
npm test
npm run build
```

## 发布到 GitHub Pages

1. 创建一个**公开**的 GitHub 仓库，把本项目源码推送到 `main` 分支。GitHub Free 使用 Pages 时，仓库需要公开。不要提交真实 API 密钥。
2. 在仓库 **Settings → Pages** 中，把发布来源设为 **GitHub Actions**。
3. 在 **Settings → Secrets and variables → Actions** 中创建 `DEEPSEEK_API_KEY`。DeepSeek API 单独计费；可先不配置，网站仍会采集项目并展示基础资料。AI 费用按保守估算到约 25 元时暂停新卡片生成，给每月约 30 元预算留余量。首次上线前请核对[官方价格](https://api-docs.deepseek.com/quick_start/pricing/)。
4. 在 **Actions → 更新热点雷达 → Run workflow** 手动运行一次。工作流先检查三个公开仓库的历史接口，然后采集、测试、构建并发布。成功后在 **Settings → Pages** 查看网站链接。

之后工作流每小时第 17 分钟尝试运行一次。GitHub 的定时任务可能延迟或跳过；页面会显示上次成功更新时间。需要补跑时，在同一 Actions 页面选择 **Run workflow**。公开仓库长期没有活动时，GitHub 可能停用定时任务，可在 Actions 页面重新启用。

工作流自动创建 `radar-data` 分支来保存生成的数据、AI 缓存与费用记录；`main` 只保存源码。不要手动删除 `radar-data`。Pages 在同一工作流中接收构建产物，因此采集数据提交不会依赖额外的推送触发。

## 数据和费用如何处理

采集脚本每轮最多发起 750 次 GitHub API 请求，读取剩余额度并在低于 100 次时停止；失败的项目沿用旧资料并显示待刷新。缺失的星标历史标为“未获取”。前端只读取版本化 JSON，不包含 GitHub 或 DeepSeek 密钥。

AI 每天北京时间 8 点后首次成功运行时最多生成 20 张学习卡片，重复的 README 会复用已有解读。保守费用估算按当前官方高峰价格计算，价格变化时可调整工作流的 `DEEPSEEK_INPUT_USD_PER_M`、`DEEPSEEK_OUTPUT_USD_PER_M` 和 `BUDGET_CNY_PER_USD` 环境变量。账单以 DeepSeek 控制台显示为准。

浏览器收藏数据不会上传到 GitHub。导入 JSON 前会在本机保留一次备份；再次导入会覆盖这份备份。请定期点击“导出备份”保存到自己信任的位置。

## 项目结构

- `src/`：网站页面、筛选和本机学习记录。
- `scripts/`：候选发现、GitHub 日级历史、AI 解读及上线前检查。
- `.github/workflows/`：代码检查、逐小时采集与 Pages 发布。
- `tests/`：统计口径、候选选择、预算和导入安全测试。

作品集可介绍的要点：公开数据采集与限流、日级时间窗口统计、低成本 AI 卡片、手机端交互、本机数据备份、GitHub Actions 自动发布。
