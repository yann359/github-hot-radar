import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CATEGORY_KEYS, PERIODS } from './core.mjs'

const path = resolve(process.env.RADAR_OUTPUT_FILE ?? 'public/data/radar.v1.json')
const data = JSON.parse(await readFile(path, 'utf8'))
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const validGithubUrl = value => typeof value === 'string' && /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+(?:\/.*)?$/i.test(value)
const assert = (condition, message) => { if (!condition) throw new Error(`榜单数据校验失败：${message}`) }

assert(data.schemaVersion === 1 && !data.demo, '数据版本或演示标记不正确')
assert(validDate(data.generatedAt), '缺少生成时间')
assert(validDate(data.lastSuccessfulAt), '尚无成功采集的数据')
assert(Array.isArray(data.repos) && data.repos.length > 0 && data.repos.length <= 300, '候选数量不正确')
assert(data.candidateCount === data.repos.length, '候选计数与列表不一致')
assert(data.repos.some(repo => Number.isSafeInteger(repo.periodStars?.[7])), '全部仓库都缺少近 7 天涨星数据')
assert(Array.isArray(data.warnings) && data.warnings.every(item => typeof item === 'string'), '异常状态无效')
assert(typeof data.source?.history === 'string' && typeof data.source?.note === 'string', '缺少来源说明')

const ids = new Set()
for (const repo of data.repos) {
  assert(Number.isSafeInteger(repo.id) && repo.id > 0 && !ids.has(repo.id), '仓库 ID 无效或重复')
  ids.add(repo.id)
  assert(typeof repo.fullName === 'string' && /^[^/\s]+\/[^/\s]+$/.test(repo.fullName), '仓库名称无效')
  assert(validGithubUrl(repo.htmlUrl), `${repo.fullName} 链接无效`)
  assert(CATEGORY_KEYS.includes(repo.category), `${repo.fullName} 分类无效`)
  assert(Number.isSafeInteger(repo.stars) && repo.stars >= 0, `${repo.fullName} star 总数无效`)
  assert(validDate(repo.createdAt) && validDate(repo.lastFetchedAt), `${repo.fullName} 时间无效`)
  assert(Array.isArray(repo.topics) && Array.isArray(repo.sources), `${repo.fullName} 元数据无效`)
  assert(repo.periodStars && PERIODS.every(days => repo.periodStars[days] === null ||
    (Number.isSafeInteger(repo.periodStars[days]) && repo.periodStars[days] >= 0)), `${repo.fullName} 涨星数据无效`)
  assert(repo.history === null || (Array.isArray(repo.history) && repo.history.every(point =>
    Number.isSafeInteger(point.bucket) && Number.isSafeInteger(point.count) && point.count >= 0)), `${repo.fullName} 历史数据无效`)
  if (repo.card) {
    assert(typeof repo.card.purpose === 'string' && repo.card.purpose.length > 0 &&
      Array.isArray(repo.card.learn) && repo.card.learn.length >= 1 && repo.card.learn.length <= 3 &&
      typeof repo.card.audience === 'string' && validGithubUrl(repo.card.sourceUrl), `${repo.fullName} 学习卡片无效`)
  }
}

console.log(`榜单数据已校验：${data.repos.length} 个仓库，版本 ${data.schemaVersion}。`)
