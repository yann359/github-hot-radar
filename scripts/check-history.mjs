const token = process.env.GITHUB_TOKEN?.trim()
const repositories = ['octocat/Hello-World', 'facebook/react', 'vercel/next.js']

for (const repository of repositories) {
  const response = await fetch(`https://api.github.com/repos/${repository}/stargazers/history?per_page=6`, {
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2026-03-10',
      'user-agent': 'github-hot-radar',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`${repository}: GitHub HTTP ${response.status}`)
  const weeks = await response.json()
  if (!Array.isArray(weeks) || weeks.length < 6) throw new Error(`${repository}: 不足六周历史`)
  if (weeks.some((week, index) =>
    !Number.isFinite(week.week) || !Array.isArray(week.days) || week.days.length !== 7 ||
    week.days.some(value => !Number.isSafeInteger(value) || value < 0) ||
    (index && week.week >= weeks[index - 1].week)
  )) throw new Error(`${repository}: 历史数据格式异常`)
  console.log(`${repository}: 最近 6 周历史接口正常`)
}
