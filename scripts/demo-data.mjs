import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { periodMetrics } from './core.mjs'

const now = new Date()
const weekStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay()) / 1000)
const samples = [
  { fullName: 'sample/soft-orbit', category: 'ai', language: 'TypeScript', stars: 8420, description: '一个演示用的 AI 工作流项目，展示学习卡片和近期热度。', purpose: '把多个 AI 任务整理成清晰的工作流，帮助理解工具调用与任务编排。', learn: ['拆分多步骤任务', '设计可复用的工具接口', '观察工作流状态'], audience: '想练习 AI 应用架构的前端或全栈学习者', seed: 7 },
  { fullName: 'sample/petal-ui', category: 'web', language: 'TypeScript', stars: 6384, description: '轻盈的界面组件实验，用于演示移动端优先的项目卡片。', purpose: '以简洁的组件组织页面，让移动端交互保持顺手。', learn: ['响应式布局', '可访问的组件状态'], audience: '正在练习 React 界面设计的学习者', seed: 6 },
  { fullName: 'sample/quiet-cli', category: 'tools', language: 'Go', stars: 4218, description: '用于演示的命令行效率工具。', purpose: '练习命令行交互与任务自动化。', learn: ['CLI 命令结构', '错误处理与日志'], audience: '希望做出第一个实用命令行工具的开发者', seed: 5 },
  { fullName: 'sample/data-garden', category: 'data', language: 'Python', stars: 3560, description: '把数据整理和可视化做成易读工作台的演示项目。', purpose: '学习从原始数据到图表展示的整理流程。', learn: ['数据清洗', '图表信息层级'], audience: '正在学习 Python 数据处理的人', seed: 4 },
  { fullName: 'sample/learn-by-making', category: 'learning', language: 'JavaScript', stars: 2214, description: '按小项目练习编程概念的演示学习资源。', purpose: '用一组可实践的小项目训练阅读文档与动手能力。', learn: ['拆分练习目标', '记录项目复盘'], audience: '想从教程走向作品的初学者', seed: 3 },
  { fullName: 'sample/tiny-systems', category: 'other', language: 'Rust', stars: 1542, description: '探索系统编程基础的演示仓库。', purpose: '通过短小例子理解内存和并发的基本概念。', learn: ['阅读系统代码', '组织小型实验'], audience: '对系统编程感兴趣的学习者', seed: 2 },
]

const repos = samples.map((sample, index) => {
  const weeks = Array.from({ length: 6 }, (_, weekIndex) => ({
    week: weekStart - weekIndex * 7 * 86_400,
    days: Array.from({ length: 7 }, (_, dayIndex) => Math.max(0, Math.round(sample.seed * (1 + Math.sin((weekIndex * 7 + dayIndex + index) / 2))))),
  }))
  const metrics = periodMetrics(weeks, new Date(now.getTime() - (index + 2) * 86_400_000).toISOString(), now.getTime() / 1000)
  return {
    id: index + 1, fullName: sample.fullName, name: sample.fullName.split('/')[1], owner: 'sample',
    description: sample.description, htmlUrl: 'https://github.com/trending', language: sample.language,
    topics: [], stars: sample.stars, createdAt: new Date(now.getTime() - (index + 2) * 86_400_000).toISOString(),
    pushedAt: now.toISOString(), defaultBranch: 'main', category: sample.category,
    sources: ['demo'], lastFetchedAt: now.toISOString(), history: metrics.history,
    historyFetchedAt: now.toISOString(), historyEnd: metrics.historyEnd, periodStars: metrics.periodStars,
    card: {
      purpose: sample.purpose, learn: sample.learn, audience: sample.audience,
      sourceUrl: 'https://github.com/trending', generatedAt: now.toISOString(), model: 'demo',
    },
    cardReadmeSha: null,
  }
})

const output = resolve('public/data/radar.v1.json')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify({
  schemaVersion: 1, demo: true, generatedAt: now.toISOString(), lastSuccessfulAt: now.toISOString(),
  candidateCount: repos.length,
  source: { repositorySearch: 'https://github.com/search?type=repositories', trending: 'https://github.com/trending', history: 'https://docs.github.com/en/rest/activity/starring#get-repository-star-history', note: '本页为本地演示数据，仅供检查界面。' },
  warnings: [], repos,
}, null, 2) + '\n')
console.log('已生成 6 个明确标注的本地演示项目。')
