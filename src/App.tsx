import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { availableLanguages, CATEGORIES, CATEGORY_NAME, compactNumber, PERIODS, rankRepos, timeLabel } from './data'
import { emptyStore, importJsonText, loadStore, saveStore, upsertEntry, backupJson } from './storage'
import type { Board, Category, LearningStore, Period, RadarData, Repo } from './types'
import { useTheme } from './theme'
import type { ThemePreference } from './theme'

type IconName = 'radar' | 'bookmark' | 'star' | 'search' | 'arrow' | 'back' | 'clock' | 'check' | 'download' | 'upload' | 'github' | 'warning' | 'sun' | 'moon' | 'system'
type Route = {
  page: 'radar' | 'favorites' | 'detail'
  repoId: number | null
  from: string
  board: Board
  period: Period
  category: Category | 'all'
  language: string
  query: string
  shown: number
}

function Icon({ name, size = 20, strokeWidth = 1.9 }: { name: IconName; size?: number; strokeWidth?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  const paths: Record<IconName, ReactNode> = {
    radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.4" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><path d="M12 12l6.4-6.4" /></>,
    bookmark: <path d="M6.5 4.5h11v15l-5.5-3.5-5.5 3.5z" />,
    star: <path d="m12 2.9 2.7 5.6 6.2.9-4.5 4.4 1.1 6.2-5.5-2.9-5.5 2.9 1.1-6.2L3 9.4l6.2-.9z" />,
    search: <><circle cx="10.8" cy="10.8" r="6.7" /><path d="m16 16 4.5 4.5" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    back: <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    check: <path d="m5 12 4.5 4.5L19 7" />,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 17v3h14v-3" /></>,
    upload: <><path d="M12 17V5m0 0 4 4m-4-4-4 4" /><path d="M5 17v3h14v-3" /></>,
    github: <><path d="M9 19c-4.8 1.4-4.8-2.4-6.7-2.8" /><path d="M9 21v-3.1c-4.5-1.2-5.8-4.2-5.1-8.4.5-2.4 2.2-4.2 4.5-5-.1-.9 0-2 .4-2.8 1.2 0 2.4.6 3.2 1.2 2.5-.6 5.2-.6 7.6 0 .8-.6 2-1.2 3.2-1.2.4.9.5 1.9.4 2.8 2.3.8 4 2.6 4.5 5 .7 4.2-.6 7.2-5.1 8.4V21" transform="translate(1 0) scale(.9 1)" /></>,
    warning: <><path d="M12 3 2 21h20z" /><path d="M12 9v5m0 3v.2" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    moon: <path d="M20.5 13.3A8.7 8.7 0 0 1 10.7 3.5 8.7 8.7 0 1 0 20.5 13.3Z" />,
    system: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

function parseRoute(): Route {
  const hash = window.location.hash || '#/radar'
  const [path, queryText = ''] = hash.slice(1).split('?')
  const query = new URLSearchParams(queryText)
  const rawPeriod = Number(query.get('period'))
  const category = query.get('category')
  const rawShown = Number(query.get('shown'))
  const match = path.match(/^\/repo\/(\d+)$/)
  return {
    page: match ? 'detail' : path === '/favorites' ? 'favorites' : 'radar',
    repoId: match ? Number(match[1]) : null,
    from: query.get('from') ?? '#/radar',
    board: query.get('board') === 'new' ? 'new' : 'hot',
    period: PERIODS.includes(rawPeriod as Period) ? rawPeriod as Period : 7,
    category: CATEGORIES.some(item => item.key === category) ? category as Category | 'all' : 'all',
    language: query.get('language') ?? 'all',
    query: query.get('q') ?? '',
    shown: Number.isFinite(rawShown) && rawShown >= 30 ? Math.min(300, Math.floor(rawShown / 30) * 30) : 30,
  }
}

function radarHash(next: Partial<Route>, route: Route): string {
  const merged = { ...route, ...next }
  const params = new URLSearchParams()
  params.set('board', merged.board)
  params.set('period', String(merged.period))
  if (merged.category !== 'all') params.set('category', merged.category)
  if (merged.language !== 'all') params.set('language', merged.language)
  if (merged.query.trim()) params.set('q', merged.query.trim())
  if (merged.shown > 30) params.set('shown', String(merged.shown))
  return `#/radar?${params.toString()}`
}

function safeGithubUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : null
  } catch {
    return null
  }
}

function Trend({ repo, large = false }: { repo: Repo; large?: boolean }) {
  const values = [...(repo.history ?? [])].slice(0, large ? 30 : 14).reverse().map(item => item.count)
  if (values.length < 2) return <div className={`trend-placeholder ${large ? 'large' : ''}`}>趋势等待更新</div>
  const width = large ? 560 : 110
  const height = large ? 160 : 36
  const top = 12
  const bottom = height - 9
  const max = Math.max(1, ...values)
  const points = values.map((value, index) => ({
    x: index / (values.length - 1) * width,
    y: bottom - value / max * (bottom - top),
  }))
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return <svg className={large ? 'trend large' : 'trend'} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`最近${values.length}个 GitHub 日级数据桶的 star 变化`}>
    {large && <><path d={`M0,${height / 2} H${width}`} stroke="var(--chart-grid, #e6eafa)" strokeWidth="1" /><path d={`M0,${bottom} H${width}`} stroke="var(--chart-grid, #e6eafa)" strokeWidth="1" /></>}
    <path d={area} fill="var(--chart-area, #e9e7ff)" opacity=".85" />
    <path d={line} fill="none" stroke="var(--chart-line, #7469d8)" strokeWidth={large ? 2.5 : 2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    {large && <circle cx={points.at(-1)?.x} cy={points.at(-1)?.y} r="4" fill="var(--chart-line, #7469d8)" />}
  </svg>
}

function dateOnly(value: string | null): string {
  return value && Number.isFinite(Date.parse(value)) ? value.slice(0, 10) : '—'
}

function repositoryCountLabel(count: number) {
  return new Intl.NumberFormat('zh-CN').format(count)
}

export default function App() {
  const [theme, changeTheme] = useTheme()
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [route, setRoute] = useState<Route>(parseRoute)
  const [learning, setLearning] = useState<LearningStore>(() => {
    try { return loadStore() } catch { return emptyStore() }
  })
  const [notice, setNotice] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  const listScroll = useRef(0)
  const previousPage = useRef(route.page)

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/radar.v1.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const next = await response.json() as RadarData
        if (next.schemaVersion !== 1 || !Array.isArray(next.repos)) throw new Error('数据版本不支持')
        if (active) { setData(next); setLoadError('') }
      } catch {
        if (active) setLoadError('暂时无法读取最新榜单。')
      } finally {
        if (active) setLoading(false)
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5 * 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (route.page === 'detail' && route.repoId != null) {
      setNoteDraft(learning.entries[String(route.repoId)]?.note ?? '')
    }
    if (previousPage.current === 'detail' && route.page !== 'detail') {
      requestAnimationFrame(() => window.scrollTo({ top: listScroll.current }))
    }
    previousPage.current = route.page
  }, [route.page, route.repoId, learning.entries])

  const navigate = (hash: string, replace = false) => {
    if (replace) {
      window.history.replaceState(null, '', hash)
      setRoute(parseRoute())
    } else {
      window.location.hash = hash
      setRoute(parseRoute())
    }
  }

  const setFilter = (patch: Partial<Route>) => navigate(radarHash({ ...patch, shown: 30 }, route), true)
  const openDetail = (repo: Repo) => {
    listScroll.current = window.scrollY
    const from = route.page === 'favorites' ? '#/favorites' : radarHash({}, route)
    navigate(`#/repo/${repo.id}?from=${encodeURIComponent(from)}`)
    window.scrollTo({ top: 0 })
  }
  const goBack = () => navigate(route.from.startsWith('#/radar') || route.from === '#/favorites' ? route.from : '#/radar')

  const saveLearning = (next: LearningStore) => {
    try { saveStore(next); setLearning(next); setNotice('') }
    catch { setNotice('保存失败：浏览器存储空间不足或已被禁用。') }
  }
  const toggleSave = (repo: Repo) => {
    const current = learning.entries[String(repo.id)]
    saveLearning(upsertEntry(learning, repo, { saved: !current?.saved }))
  }
  const toggleRead = (repo: Repo) => {
    const current = learning.entries[String(repo.id)]
    saveLearning(upsertEntry(learning, repo, { read: !current?.read }))
  }

  const exportLearning = () => {
    const blob = new Blob([JSON.stringify(learning, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `github-radar-learning-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }
  const importLearning = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      if (file.size > 5_000_000) throw new Error('导入文件超过 5 MB。')
      const merged = importJsonText(learning, await file.text())
      setLearning(merged)
      setNotice('导入完成，旧记录已在本机备份。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导入失败。')
    } finally {
      event.target.value = ''
    }
  }

  const ranked = useMemo(() => data
    ? rankRepos(data, route.board, route.period, route.category, route.language, route.query)
    : [], [data, route.board, route.period, route.category, route.language, route.query])
  const languages = useMemo(() => data ? availableLanguages(data) : [], [data])
  const savedEntries = Object.values(learning.entries).filter(item => item.saved)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  const detailRepo = route.repoId == null ? null
    : data?.repos.find(repo => repo.id === route.repoId) ?? learning.entries[String(route.repoId)]?.snapshot ?? null
  const isStale = !data?.lastSuccessfulAt || Date.now() - Date.parse(data.lastSuccessfulAt) > 3 * 60 * 60_000
  const highest = data ? Math.max(0, ...data.repos.map(repo => repo.periodStars?.[7] ?? 0)) : 0

  const repositoryCard = (repo: Repo, index: number, boardPeriod: Period) => {
    const saved = Boolean(learning.entries[String(repo.id)]?.saved)
    const read = Boolean(learning.entries[String(repo.id)]?.read)
    const metric = repo.periodStars?.[boardPeriod]
    return <article className={`repo-card ${read ? 'is-read' : ''}`} key={repo.id}>
      <div className="rank" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
      <div className="repo-main">
        <div className="repo-overline"><span className="category-dot" />{CATEGORY_NAME[repo.category] ?? '其他'}<span className="tiny-separator">/</span>{repo.owner}</div>
        <button className="repo-title" onClick={() => openDetail(repo)}>{repo.name}<Icon name="arrow" size={17} /></button>
        <p className="repo-description">{repo.card?.purpose || repo.description || '该仓库暂时没有项目介绍，可前往 GitHub 查看。'}</p>
        <div className="repo-meta">
          {repo.language && <span className="language"><span className="language-dot" />{repo.language}</span>}
          <span><Icon name="star" size={14} />{compactNumber(repo.stars)} 总 star</span>
          {repo.card && <span className="ai-badge">中文解读</span>}
          {repo.historyFetchedAt && Date.now() - Date.parse(repo.historyFetchedAt) > 3 * 60 * 60_000 && <span>数据待刷新</span>}
        </div>
      </div>
      <div className="repo-side">
        <span className="gain">{metric == null ? '—' : `+${compactNumber(metric)}`}</span>
        <span className="gain-label">近 {boardPeriod} 天</span>
        <Trend repo={repo} />
      </div>
      <button className={`save-button ${saved ? 'active' : ''}`} onClick={() => toggleSave(repo)} aria-label={`${saved ? '取消收藏' : '收藏'} ${repo.fullName}`} title={saved ? '取消收藏' : '收藏项目'}>
        <Icon name="bookmark" size={19} />
      </button>
    </article>
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand" onClick={() => navigate('#/radar')} aria-label="前往热点雷达首页"><span className="brand-mark"><Icon name="radar" size={23} /></span><span>GitHub<span className="brand-second"> 热点雷达</span></span></button>
        <nav className="desktop-nav" aria-label="主导航">
          <button className={route.page === 'radar' ? 'selected' : ''} onClick={() => navigate('#/radar')}>发现</button>
          <button className={route.page === 'favorites' ? 'selected' : ''} onClick={() => navigate('#/favorites')}>我的收藏 <span>{savedEntries.length}</span></button>
        </nav>
        <div className="topbar-actions">
          <label className="theme-control" title="切换页面外观">
            <Icon name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'system'} size={18} />
            <select aria-label="页面外观" value={theme} onChange={event => changeTheme(event.target.value as ThemePreference)}>
              <option value="system">跟随系统</option>
              <option value="light">浅色模式</option>
              <option value="dark">深色模式</option>
            </select>
          </label>
          <a className="github-top-link" href="https://github.com/trending" target="_blank" rel="noreferrer"><Icon name="github" size={18} /><span>GitHub 趋势</span><Icon name="arrow" size={14} /></a>
        </div>
      </div>
    </header>

    {route.page === 'detail' ? <main className="page detail-page">
      <button className="back-button" onClick={goBack}><Icon name="back" size={18} />返回榜单</button>
      {!detailRepo ? <section className="empty-state"><span className="empty-orb"><Icon name="search" size={27} /></span><h2>没有找到这个项目</h2><p>它可能已从当前候选范围移除。试试返回榜单继续探索。</p></section> : <>
        <section className="detail-heading">
          <div className="eyebrow"><span className="eyebrow-line" />项目档案 <span className="tiny-separator">/</span> {CATEGORY_NAME[detailRepo.category]}</div>
          <div className="detail-title-row"><div><p className="detail-owner">{detailRepo.owner} /</p><h1>{detailRepo.name}</h1></div><button className={`primary-outline ${learning.entries[String(detailRepo.id)]?.saved ? 'saved' : ''}`} onClick={() => toggleSave(detailRepo)}><Icon name="bookmark" size={18} />{learning.entries[String(detailRepo.id)]?.saved ? '已收藏' : '收藏项目'}</button></div>
          <p className="detail-summary">{detailRepo.card?.purpose || detailRepo.description || '暂无仓库介绍。'}</p>
          <div className="detail-tags"><span>{detailRepo.language || '语言未标注'}</span><span><Icon name="star" size={16} />{compactNumber(detailRepo.stars)} 总 star</span><span>创建于 {dateOnly(detailRepo.createdAt)}</span></div>
          {safeGithubUrl(detailRepo.htmlUrl) && <a className="github-cta" href={safeGithubUrl(detailRepo.htmlUrl)!} target="_blank" rel="noreferrer"><Icon name="github" size={18} />打开 GitHub 仓库<Icon name="arrow" size={17} /></a>}
        </section>
        <div className="detail-grid">
          <section className="panel chart-panel"><div className="panel-head"><div><div className="section-kicker">STAR MOVEMENT</div><h2>最近的关注变化</h2></div><span className="muted-badge">GitHub 日级数据</span></div><Trend repo={detailRepo} large /><div className="chart-footer"><span>近 30 个来源日</span><span>最新日统计中 · 来源日 {detailRepo.historyEnd ?? '未获取'}</span></div><div className="metric-grid">{PERIODS.map(days => <div key={days}><span>近 {days} 天</span><strong>{detailRepo.periodStars?.[days] == null ? '未获取' : `+${compactNumber(detailRepo.periodStars[days]!)}`}</strong></div>)}</div></section>
          <section className="panel learning-panel"><div className="panel-head"><div><div className="section-kicker">LEARNING NOTES</div><h2>这个项目值得学什么</h2></div><span className="soft-icon">✦</span></div>{detailRepo.card ? <><div className="learning-block"><h3>项目用途</h3><p>{detailRepo.card.purpose}</p></div><div className="learning-block"><h3>可以学到</h3><ul>{detailRepo.card.learn.map((point, index) => <li key={`${point}-${index}`}><span>{index + 1}</span>{point}</li>)}</ul></div><div className="learning-block"><h3>适合谁</h3><p>{detailRepo.card.audience}</p></div><p className="source-note">依据仓库资料生成 · {dateOnly(detailRepo.card.generatedAt)} {safeGithubUrl(detailRepo.card.sourceUrl) && <>· <a href={safeGithubUrl(detailRepo.card.sourceUrl)!} target="_blank" rel="noreferrer">查看资料来源 ↗</a></>}</p></> : <div className="pending-card"><span className="pending-icon">✦</span><h3>中文解读生成中</h3><p>先浏览仓库原始介绍，系统会在每日限量任务中逐步补齐学习卡片。</p><p className="original-copy">{detailRepo.description || '仓库暂无简介。'}</p></div>}</section>
          <section className="panel notes-panel"><div className="panel-head"><div><div className="section-kicker">YOUR SPACE</div><h2>我的学习记录</h2></div><span className="local-badge">仅保存在本机</span></div><button className={`read-control ${learning.entries[String(detailRepo.id)]?.read ? 'checked' : ''}`} onClick={() => toggleRead(detailRepo)}><span><Icon name="check" size={16} /></span>{learning.entries[String(detailRepo.id)]?.read ? '已读 · 点击取消' : '标记为已读'}</button><label className="note-label" htmlFor="learning-note">我的备注</label><textarea id="learning-note" maxLength={2000} placeholder="记下它为什么吸引你、想学习的部分……" value={noteDraft} onChange={event => setNoteDraft(event.target.value)} onBlur={() => { if (noteDraft !== (learning.entries[String(detailRepo.id)]?.note ?? '')) saveLearning(upsertEntry(learning, detailRepo, { note: noteDraft })) }} /><p className="small-hint">离开输入框后自动保存 · {noteDraft.length}/2000</p></section>
        </div>
      </>}
    </main> : route.page === 'favorites' ? <main className="page favorites-page">
      <section className="page-intro"><div className="eyebrow"><span className="eyebrow-line" />YOUR COLLECTION</div><h1>留给<span className="gradient-text">未来的自己</span></h1><p>收好想读的项目，记下你的下一步。记录只存在这台设备的浏览器里。</p></section>
      <section className="favorites-toolbar"><div><strong>{savedEntries.length}</strong><span> 个收藏项目</span></div><div className="toolbar-actions"><button onClick={exportLearning}><Icon name="download" size={17} />导出备份</button><button onClick={() => importInput.current?.click()}><Icon name="upload" size={17} />导入记录</button><input ref={importInput} type="file" accept=".json,application/json" hidden onChange={event => void importLearning(event)} /></div></section>
      {backupJson() && <p className="backup-hint">上一次导入前的本机备份已保留。再次导入会替换这份备份。</p>}
      {savedEntries.length ? <div className="repo-list favorites-list">{savedEntries.map((entry, index) => repositoryCard(data?.repos.find(repo => repo.id === entry.id) ?? entry.snapshot, index, 7))}</div> : <section className="empty-state"><span className="empty-orb"><Icon name="bookmark" size={27} /></span><h2>你的收藏夹还很安静</h2><p>遇到想深入学习的项目，点一下书签，它就会出现在这里。</p><button className="empty-action" onClick={() => navigate('#/radar')}>去发现项目 <Icon name="arrow" size={17} /></button></section>}
    </main> : <main className="page radar-page">
      <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" />OPEN SOURCE, NEW PERSPECTIVES</div><h1>每天一点新的<span className="gradient-text">好奇心。</span></h1><p>发现正在被关注的开源项目，找到下一件值得动手学的事。</p><div className="hero-pills"><span><Icon name="clock" size={15} />每小时更新</span><span>覆盖 6 个领域</span><span>为学习而精选</span></div></div><div className="hero-art" aria-hidden="true"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-orbit orbit-three" /><div className="hero-core"><Icon name="radar" size={38} strokeWidth={1.2} /></div><span className="orbit-point point-one" /><span className="orbit-point point-two" /><span className="orbit-point point-three" /></div></section>
      <section className="stats-bar" aria-label="榜单状态"><div><span className="stat-icon lavender"><Icon name="radar" size={20} /></span><div><strong>{data ? repositoryCountLabel(data.candidateCount) : '—'}</strong><span>追踪项目</span></div></div><div><span className="stat-icon peach"><Icon name="star" size={20} /></span><div><strong>{data ? `+${compactNumber(highest)}` : '—'}</strong><span>最高近 7 天涨星</span></div></div><div><span className="stat-icon mint"><Icon name="clock" size={20} /></span><div><strong className="time-stat">{timeLabel(data?.lastSuccessfulAt ?? null)}</strong><span>上次成功更新 · 北京时间</span></div></div></section>
      {(data?.demo || isStale || loadError) && <div className="status-banner" role="status"><Icon name="warning" size={18} /><span>{loading ? '正在读取榜单…' : data?.demo ? '当前展示本地演示数据。正式发布会使用 GitHub 实时采集结果。' : !data ? '榜单等待首次采集与发布。' : isStale ? '榜单数据超过 3 小时未成功更新，以下内容可能较旧。' : loadError}</span></div>}
      <section className="discover-section"><div className="section-title-row"><div><div className="section-kicker">EXPLORE REPOSITORIES</div><h2>今日发现</h2><p>在热度与新鲜感之间，找到适合你的项目。</p></div><a href="https://github.com/trending" target="_blank" rel="noreferrer" className="source-link">数据来源 <Icon name="arrow" size={16} /></a></div>
        <div className="filter-panel"><div className="filter-top"><div className="board-tabs" role="tablist" aria-label="榜单类型"><button role="tab" aria-selected={route.board === 'hot'} className={route.board === 'hot' ? 'active' : ''} onClick={() => setFilter({ board: 'hot' })}>↗ 涨星榜</button><button role="tab" aria-selected={route.board === 'new'} className={route.board === 'new' ? 'active' : ''} onClick={() => setFilter({ board: 'new' })}>✧ 新项目榜</button></div><div className="period-tabs" aria-label="时间范围">{PERIODS.map(days => <button key={days} aria-pressed={route.period === days} className={route.period === days ? 'active' : ''} onClick={() => setFilter({ period: days })}>{days} 天</button>)}</div></div>
          <div className="filter-middle"><div className="search-field"><Icon name="search" size={19} /><input aria-label="搜索项目" value={route.query} placeholder="搜索项目、关键词或简介…" onChange={event => setFilter({ query: event.target.value })} /></div><label className="language-select"><span>语言</span><select aria-label="筛选编程语言" value={route.language} onChange={event => setFilter({ language: event.target.value })}><option value="all">全部语言</option>{languages.map(language => <option key={language} value={language}>{language}</option>)}</select></label></div>
          <div className="category-scroll" aria-label="项目分类">{CATEGORIES.map(item => <button key={item.key} className={route.category === item.key ? 'active' : ''} aria-pressed={route.category === item.key} onClick={() => setFilter({ category: item.key })}>{item.label}</button>)}</div>
        </div>
        <div className="results-meta"><p><strong>{ranked.length}</strong> 个项目 <span className="tiny-separator">·</span> {route.board === 'hot' ? '按近期 star 变化排序' : '近期创建的项目'}</p><span>最新来源日统计中</span></div>
        {ranked.length ? <><div className="repo-list">{ranked.slice(0, route.shown).map((repo, index) => repositoryCard(repo, index, route.period))}</div>{route.shown < ranked.length && <button className="load-more" onClick={() => navigate(radarHash({ shown: route.shown + 30 }, route), true)}>继续查看 <Icon name="arrow" size={17} /></button>}</> : <section className="empty-state"><span className="empty-orb"><Icon name="search" size={27} /></span><h2>{loading ? '正在寻找项目' : data?.candidateCount ? '这个组合暂时没有项目' : '等待第一份热点数据'}</h2><p>{data?.candidateCount ? '试试更长的时间范围，或调整分类和关键词。' : '首次运行 GitHub Actions 的采集流程后，项目会自动出现在这里。'}</p>{data?.candidateCount ? <button className="empty-action" onClick={() => navigate('#/radar')}>清除筛选 <Icon name="arrow" size={17} /></button> : null}</section>}
        <div className="method-note"><Icon name="radar" size={17} /><p>榜单覆盖已发现并追踪的候选仓库。近 N 天采用 GitHub 日级历史数据；最新日仍在统计中，日期边界可能与北京时间不同。<a href="https://docs.github.com/en/rest/activity/starring#get-repository-star-history" target="_blank" rel="noreferrer">了解统计口径 ↗</a></p></div>
      </section>
    </main>}

    {notice && <div className="toast" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
    <footer className="footer"><div className="footer-inner"><span><span className="footer-mark"><Icon name="radar" size={16} /></span>GitHub 热点雷达</span><p>为每一次好奇，留一个入口。</p><span>数据来自 GitHub · {data?.source?.note ? '仅供学习参考' : '开源学习工具'}</span></div></footer>
    <nav className="mobile-nav" aria-label="手机主导航"><button className={route.page === 'radar' ? 'active' : ''} onClick={() => navigate('#/radar')}><Icon name="radar" size={22} />雷达</button><button className={route.page === 'favorites' ? 'active' : ''} onClick={() => navigate('#/favorites')}><Icon name="bookmark" size={22} />收藏{savedEntries.length > 0 && <span className="mobile-count">{savedEntries.length}</span>}</button></nav>
  </div>
}
