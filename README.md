# 交易复盘工具（trade-review）

本地优先的网页工具：导入自己的券商成交记录（交割单）→ 先进先出（FIFO）配对成笔 → 统计胜率、盈亏比、最大回撤、资金曲线。
数据只保存在浏览器 IndexedDB，不上传服务器。

> 仅用于个人交易记录分析，不构成投资建议。

当前版本（v0.3）：导入、字段映射、FIFO 配对（支持做空）、基础统计、资金曲线、盈亏日历、交易列表、K 线复盘（买卖点位）、
复盘日志（标签/策略/入场原因/笔记/评分/入场情绪/止损目标）、分组统计、免费版 30 天窗口、落地页与 SEO 已完成；
报告导出、支付/激活码尚未实现（接口已预留）。

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript
- Tailwind CSS v4（深色主题，系统字体栈，不引外部字体）
- TradingView Lightweight Charts™ 5.2（K 线复盘图表，Apache-2.0，工具页按需动态导入）
- ECharts 6（资金曲线，工具页按需动态导入）
- Dexie（IndexedDB）
- Papa Parse（CSV/TSV 文本）+ SheetJS（xlsx / 真 xls，官方 CDN 包 0.20.3）
- Vitest（单元测试）

## 本地运行

需要 Node.js ≥ 20.9，使用 npm。

```bash
cd trade-review
npm install
cp .env.example .env.local     # 可选：设置 NEXT_PUBLIC_SITE_URL
npm run dev                    # http://localhost:3000 ，工具页 http://localhost:3000/app
npm test                       # 单元测试
npm run build && npm start     # 生产构建
npm run build:static           # 纯静态导出到 out/（Cloudflare Pages 用）
```

在工具页点“载入 A 股示例”或“载入加密分钟级示例”即可体验完整流程（示例数据均为虚构交易）。
加密示例的成交价取自 Binance BTCUSDT/ETHUSDT 1 分钟 K 线收盘价，可直接在“交易列表 → [ K线复盘 ]”看到在线 K 线与买卖点。

## 目录结构

```
src/
  app/
    layout.tsx            根布局：metadataBase、默认 title/description/OG、页头页脚
    page.tsx              落地页（SSG，纯服务端组件，不加载重库，含 SoftwareApplication JSON-LD）
    app/page.tsx          工具页 /app（noindex）
    blog/page.tsx         文章列表
    blog/[slug]/page.tsx  文章详情（generateStaticParams 预渲染，Article JSON-LD）
    sitemap.ts robots.ts  站点地图与 robots（/app 不入 sitemap）
    icon.svg globals.css
  components/
    ToolClient.tsx        工具页客户端：导入、字段映射、标签页（总览/交易列表/盈亏日历）、未平仓表
    TradesTable.tsx       交易列表（排序、按标签/策略/情绪/评分/盈亏/多空/代码筛选，[ K线复盘 ] 入口）
    ReviewDrawer.tsx      K 线复盘抽屉：左 K 线、右复盘日志（手机上下排列），自动保存
    KlineChart.tsx        Lightweight Charts K 线 + 成交量 pane + createSeriesMarkers 买卖点 + createPriceLine 价位线 + 持仓区间
    SettingsPanel.tsx     工具页“设置”：A 股数据源 / Tushare token / 复权 / 代理地址 / 涨跌颜色
    JournalPanel.tsx      复盘日志表单 + 标签/策略/情绪库管理
    JournalStatsPanel.tsx 总览页“错误标签造成的亏损”与按标签/策略/情绪/评分分组统计
    EquityChart.tsx       资金曲线（ECharts 动态导入，dark 主题）
    PnlCalendar.tsx       盈亏日历（工具页“盈亏日历”标签，/app#calendar）
    Header.tsx Footer.tsx JsonLd.tsx
  lib/                    纯函数（除 db.ts 外都不依赖浏览器）
    site.ts               站点地址唯一来源（NEXT_PUBLIC_SITE_URL）
    config.ts             免费版窗口、价格等可配置项
    types.ts money.ts dates.ts
    fifo.ts               FIFO 配对（matchFifo）
    stats.ts              胜率/盈亏比/利润因子/最大回撤/资金曲线
    freeTier.ts           免费版 30 天窗口（applyFreeTierWindow）
    journal.ts            复盘日志类型、内置错误标签与情绪、简易 Markdown 渲染（先转义）
    journalStats.ts       分组统计（按标签/策略/情绪/评分）与错误标签亏损
    tradeList.ts          交易列表筛选与排序
    format.ts
    chartSettings.ts      涨跌颜色设置（localStorage）
    tushareSettings.ts    Tushare token 与 A 股数据源设置（localStorage，可一键清除）
    tushareProxy.ts       Tushare 透传代理核心逻辑（Next 路由与 Cloudflare Worker 共用）
    kline/
      types.ts            K 线类型、周期、Provider 接口
      window.ts           北京时间→时间戳、默认窗口/周期、买卖点、K 线合并与重采样、周期识别
      providers.ts        Binance / OKX 公共行情 Provider（可注入 fetch，便于测试）
      csv.ts              用户 OHLC CSV 解析
      tushare.ts          Tushare：ts_code 转换、响应解析、错误分类、前复权、daily/fund_daily/stk_mins 取数
      lwc.ts              Lightweight Charts 时间平移（北京时间）与买卖点换算
      service.ts          取数编排：IndexedDB 缓存 → 在线 Provider（自动回退）→ 用户 CSV
    calendar.ts           盈亏日历聚合（aggregateByDay/Week/Month/Year、月度矩阵、月度分解、年度归档）
    license.ts            授权接口占位（本次不做支付）
    db.ts                 Dexie / IndexedDB
    blog.ts               文章内容（占位）
    import/
      decode.ts           文件魔数嗅探 + UTF-8/GBK 解码
      table.ts            表头行定位、单元格清洗（="000878"）
      parseFile.ts        Papa Parse / SheetJS 解析入口（动态导入）
      presets.ts          通用格式 + 东方财富 / 同花顺 / 华泰列名预设，自动识别与映射
      normalize.ts        行 → 标准成交记录（方向、数量、日期、费用、去重 id）
  app/api/tushare/route.proxy.ts   Tushare 透传代理（仅非静态构建生效）
workers/tushare-proxy/             Tushare 透传代理 Cloudflare Worker 版（静态部署用）
THIRD_PARTY_NOTICES.md             第三方组件 NOTICE / 归属
public/samples/sample-generic.csv   通用模板 + A 股示例数据（虚构）
public/samples/sample-crypto.csv    加密分钟级示例（虚构交易，含多空）
public/og.png                        Open Graph 图片
tests/                               Vitest 测试；fixtures/ths-sample-gbk.xls 为 GBK 制表符示例（虚构）
```

## 核心口径

- **一笔交易**：每一次平仓成交为一笔（做多=卖出，做空=买回），按 FIFO 消耗最早的开仓批次（可跨多个批次）；同时记录 `cycleId`（仓位从 0 建立到回到 0 的持仓周期），方便以后按周期汇总。
- **费用分摊**：买入的佣金/印花税/过户费/其他费按“配对数量 ÷ 该批次剩余数量”分摊（最后一次分摊用完余数，总和不丢失）；卖出费用按“配对数量 ÷ 该次卖出数量”分摊。
- **净盈亏** = 卖出成交金额 − 买入成交金额 − 分摊的买入费用 − 分摊的卖出费用。**收益率** = 净盈亏 ÷（买入金额 + 买入费用）。
- **持仓天数**：自然日，多批次时按数量加权平均，另给最大值。
- **做空**：品种类型为“加密/其他”时允许先卖后买（FIFO 净额：无持仓时卖出=开空，有空单时买入=平空；一次成交超过反向持仓时，剩余部分按比例分摊金额和费用后开新仓）。A 股（东方财富/同花顺/华泰预设默认 A 股，或 6 位数字代码）只做多，超卖部分仍记“无法配对”。做空的净盈亏同样 = 卖出金额 − 买入金额 − 费用。
- **未平仓**：剩余批次单列（含分摊费用的成本）。卖出超过已知持仓（买入早于导入区间）的部分记为“无法配对”，不计盈亏并在界面提示。
- **胜率** = 盈利笔数 ÷ 总笔数（盈亏为 0 计为持平）；**盈亏比** = 平均盈利 ÷ 平均亏损；**利润因子** = 总盈利 ÷ 总亏损。
- **资金曲线/最大回撤**：按平仓日汇总已实现盈亏，不含浮动盈亏；回撤比例需要填写初始资金，否则只给金额。
- **免费版**：`applyFreeTierWindow(trades, now, isPro)` 只保留最近 30 个自然日（含今天，按 Asia/Shanghai 计算“今天”）内平仓的交易。先对全部成交做 FIFO 再按平仓日截取，因此买入早于窗口的交易盈亏仍然正确。窗口天数与基准（today / latestTrade）在 `src/lib/config.ts` 配置。只有示例数据时以示例最新日期为基准，方便演示。

## 盈亏日历

工具页 `/app` 的“盈亏日历”标签（可直接打开 `/app#calendar`，仍为 noindex）：
- **月度执行矩阵**：周日→周六 7 列 + 周汇总列（周起始日可配置，`PnlCalendar` 的 `weekStartsOn`）；日格显示当日平仓盈亏（红盈绿亏，底色深浅按本月最大绝对值）、笔数、胜率；今天标 TODAY；周汇总只统计该行中本月内的日期；上月/当前月/下月切换。
- **月度绩效分解**：所选年份 1–12 月卡片 + 上/下半年汇总，无数据显示 NO_DATA，当前月标 CURRENT，点击跳到该月。
- **年度归档**：每年一张卡，点击切换年份。
- 口径：只统计已平仓交易的已实现盈亏，按平仓日（交割单成交日期，即北京时间交易日）归属；胜率 = 盈利笔数 ÷ 笔数（持平不算胜）。
- 免费版：免费窗口之前的日期/周/月/年显示为锁定样式（🔒 LOCKED / PARTIAL）并提示买断解锁；传给日历的是已经截取过的交易，锁定区间没有任何数值进入组件。

## 交易列表与 K 线复盘

- 工具页“交易列表”标签（`/app#trades`）：列为 开仓时间、品种、开仓价、开仓金额、方向（▲BUY 做多 / ▼SELL 做空）、入场原因（策略名 + 入场原因 + 标签）、平仓价、价差、平仓时间、盈亏（含收益率）、复盘评分、动作 `[ K线复盘 ]`。支持表头排序，按标签/策略/情绪/评分/盈亏结果/多空/代码筛选。
- 免费版：列表只包含免费窗口内的交易，K 线复盘只能从列表进入，因此同样受限；列表上方提示被隐藏的笔数。
- `[ K线复盘 ]` 打开抽屉：桌面左侧 K 线、右侧复盘日志；手机上下排列。
  - K 线 + 成交量，周期 1m / 5m / 15m / 1h / 4h / 1d；默认窗口覆盖持仓区间并向前后各扩展（不少于 60 根），加密有成交时间时自动选周期（约 120 根以内），否则用日线。
  - 图表：TradingView Lightweight Charts™ v5（`createChart` + `CandlestickSeries`，成交量为独立 pane 的 `HistogramSeries`）。买卖点用 `createSeriesMarkers`（`atPriceBottom/atPriceTop` 按成交价定位，▲B / ▼S；同品种其他成交为淡色小写 b/s；十字线悬浮显示 OHLCV 和该 K 线上的成交明细）；开仓均价、平仓价、止损、目标用 `createPriceLine`；持仓区间浅色底。`autoSize` 自适应宽度；时间整体平移 +8 小时，坐标轴与十字线显示北京时间。涨跌颜色默认红涨绿跌，可在“设置 → K 线图表”改为绿涨红跌。
  - 归属：按 Lightweight Charts 的 Apache-2.0 与 NOTICE 要求，图表开启 `attributionLogo`（TradingView logo 链接到 tradingview.com），图下方、设置页、全站页脚有文字链接，NOTICE 原文见 `THIRD_PARTY_NOTICES.md`。
  - 数据源可选：加密 自动（Binance → OKX）/ Binance / OKX / 本地 CSV；A 股 自动（有 Tushare token 用 Tushare，否则本地 CSV）/ Tushare / 本地 CSV。也可“导入 OHLC CSV”（会自动识别周期，小周期可向上重采样）。
  - 所有已下载或导入的 K 线缓存在 IndexedDB（`candles` + `candleRanges` 表），下次打开直接读缓存；未收盘的最新区间不标记为已缓存。
  - 时间：交割单时间按北京时间（UTC+8）解释；A 股无成交时间时，开仓按 09:30、平仓按 15:00 定位。

### 复盘日志（IndexedDB `journals` 表，按交易 id 保存）

- 标签多选：内置错误标签 追高、没止损、重仓、计划外交易；可自定义标签（名称、颜色、错误类/普通类），可改名、删除（删除时从所有日志中移除）。
- 策略库：名称 + 描述，每笔交易选一个策略；入场原因单独填写。
- 复盘笔记支持简易 Markdown（标题、列表、粗体、斜体、行内代码；先转义 HTML，不执行任何脚本）。
- 执行评分 1–5 星；入场情绪预设 平静、自信、犹豫、焦虑、贪婪、恐惧、报复心态、FOMO，可自定义。
- 可选：计划止损价、目标价、是否按计划执行。
- 自动保存（停止输入 0.4 秒后写入），显示“已自动保存 时间”。交易 id 由成交记录 id 生成，重复导入同一文件不会丢日志。“清空本地数据”会同时清空日志。

### 分组统计（总览页）

`src/lib/journalStats.ts`：按标签 / 策略 / 入场情绪 / 执行评分分组，给出笔数、胜率、盈亏合计、盈亏比；一笔交易有多个标签时在每个标签下各计一次。
“错误标签造成的亏损”= 带任意错误类标签的交易中亏损交易的亏损合计，并给出占全部亏损的比例和按错误标签拆分。多币种不换算（会提示）。

## K 线数据源结论

| 数据源 | 用途 | 接口 | 浏览器直连（CORS） | 说明 |
|---|---|---|---|---|
| Binance 公共行情 | 加密现货 | `GET /api/v3/klines`（`symbol`、`interval`、`startTime`、`endTime`、`limit≤1000`） | `data-api.binance.vision` 返回 `Access-Control-Allow-Origin: *`，2026-11-04 实测可用 | 默认优先用官方“仅行情”域名 `data-api.binance.vision`，失败再试 `api.binance.com`（在部分地区返回 HTTP 451 且无 CORS 头）。文档：<https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md>、<https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md> |
| OKX 公共行情（备用） | 加密现货 | `GET /api/v5/market/history-candles`（`instId=BTC-USDT`，`bar` 1m/5m/15m/1H/4H/1D，`limit≤100`，用 `after` 向前翻页，返回新→旧） | 回显请求 Origin，实测可用 | 文档：<https://www.okx.com/docs-v5/en/> |
| 用户导入 OHLC CSV | 任意品种（A 股默认方案） | 本地文件 | — | 列：`时间,开盘,最高,最低,收盘,成交量`（也认 `date/open/high/low/close/volume`），时间支持 `2026-11-04 09:31`、`20261104`、毫秒/秒时间戳，按北京时间解释 |

注意：中国大陆网络能否访问 Binance / OKX 不确定；两家行情数据用于网站展示/商业用途前需阅读其服务条款（未在本次确认）。

### A 股：Tushare（用户自带 token）+ 本地 CSV（kim 已决定）

**模式**：每个用户在工具页“设置”里填写**自己的** Tushare token（只存在本机浏览器 localStorage，“一键清除 token 与缓存”可删除 token、设置和 Tushare K 线缓存）。我们不提供 token、不转售数据。设置页写明：“数据由你自己的 Tushare 账号提供，请遵守 Tushare 用户协议；本工具不提供行情数据。”

**官方接口（2026-11-04 用 WebFetch 核实）**

| 用途 | 接口 | 权限 / 积分 | 限频 / 限量 | 来源 |
|---|---|---|---|---|
| HTTP 调用格式 | `POST https://api.tushare.pro`，JSON `{api_name, token, params, fields}`；返回 `{code, msg, data:{fields, items}}`，`code=0` 成功，`2002` 权限问题 | — | — | <https://tushare.pro/document/1?doc_id=130> |
| 股票日线（未复权） | `daily`（vol 手、amount 千元） | 120 积分起可试用 | 120 分：每分钟 50 次、每天 8000 次；5000 分：每分钟 500 次、每次 6000 条 | <https://tushare.pro/document/2?doc_id=27>、<https://tushare.pro/document/1?doc_id=290> |
| ETF 日线 | `fund_daily` | 至少 5000 积分 | 单次 5000 行 | <https://tushare.pro/document/2?doc_id=127> |
| 复权因子 | `adj_factor` | 2000 积分起 | — | <https://tushare.pro/document/2?doc_id=28> |
| 复权行情 | `pro_bar`（qfq/hfq） | 2000 积分 | **官方说明暂不支持 HTTP 调用**，所以本工具用 daily + adj_factor 自行计算前复权 | <https://tushare.pro/document/2?doc_id=109> |
| 历史分钟 | `stk_mins`（1/5/15/30/60min，`trade_time` 为 K 线结束时间） | **需单独开通“A股历史分钟”权限，与积分无关**，个人 2000 元/年（机构为个人 10 倍） | 每分钟 500 次、单次 8000 行、每天 30 万次 | <https://tushare.pro/document/2?doc_id=370>、<https://tushare.pro/document/1?doc_id=290> |
| 交易日历 | `trade_cal` | 2000 积分 | — | <https://tushare.pro/document/2?doc_id=26> |

**实现**（`src/lib/kline/tushare.ts`、`service.ts`）
- 代码 → ts_code：60/68/900 开头 `.SH`，00/30/200 开头 `.SZ`，920 及 43/83/87/88 开头 `.BJ`；ETF/LOF：50/51/52/56/58 → `.SH`，15/16 → `.SZ`（日线走 `fund_daily`）；已带后缀（`600000.SH`、`SZ000001`、`600000.SS`）直接规范化。
- 周期：1d → `daily` / `fund_daily`；1m/5m/15m/1h → `stk_mins` 1min/5min/15min/60min；4h → 60min 重采样；单次 8000 行满了自动向前翻页。
- 分钟无权限：自动改为日线，并提示“你的 Tushare 账号无分钟权限，已显示日线”（本次会话内不再重复请求分钟接口）。
- 复权：默认不复权（与交割单成交价一致）；可选前复权 = 价格 × 当日因子 ÷ 区间末日因子（与 pro_bar 按 end_date 动态复权的口径一致），买卖点、开平仓线、止损/目标线同步换算；adj_factor 权限不足时提示并显示不复权。ETF 暂不复权。
- 错误：token 无效（实测 `{"code":40101,"msg":"您的token不对，请确认。"}`）、权限不足（2002 / 40203 / “权限”文案）、每分钟限频、每日总量、代理拒绝/限流、网络超时，都转成中文提示。
- 缓存：拉取的未复权 K 线写入 IndexedDB（`tushare|代码|周期`），复权在读取后计算；最近 1 天内的区间不登记为已缓存（日线 15~17 点入库）。

**为什么需要代理**（2026-11-04 实测）
- `api.tushare.pro` 的 OPTIONS 预检与 POST 响应都**没有** `Access-Control-Allow-Origin`；Chrome 中从页面直接 `fetch` 结果为 `Failed to fetch`（JSON 预检和 text/plain 简单请求都被拦）。
- 官方示例地址是 `http://api.tushare.pro`；在 https 页面上请求会被 Chrome 以 Mixed Content 拦截（已实测）。`https://api.tushare.pro` 本身可用。
- 因此提供极简透传代理：`src/app/api/tushare/route.proxy.ts`（Vercel / next start）与 `workers/tushare-proxy`（Cloudflare Worker）。两者共用 `src/lib/tushareProxy.ts`：只转发到 `https://api.tushare.pro`；`api_name` 白名单 daily / fund_daily / adj_factor / stk_mins / trade_cal；参数键白名单；请求体 ≤ 4KB 并重建（丢弃多余字段）；Origin 校验（同源 + `NEXT_PUBLIC_SITE_URL` + `TUSHARE_PROXY_ALLOWED_ORIGINS`）；每 IP 每分钟 60 次（内存计数）；不打印日志、不存储 token，响应 `Cache-Control: no-store`；上游超时 25 秒。
- 构建：`route.proxy.ts` 只有普通构建时被 `pageExtensions` 收录；`build:static` 不包含它（静态导出不支持 POST 路由），此时需部署 Worker 并设置 `NEXT_PUBLIC_TUSHARE_PROXY_URL`，或由用户在设置页填写代理地址。

**合规考虑与仍待确认的风险**
- Tushare 数据服务协议（<https://tushare.pro/document/1?doc_id=405>）原文：“本服务是在您遵守本协议……的前提下，Tushare给予您一项**个人的、不可转让的、非商业用途的**、可撤销的、有期限及非排他性的许可……仅可为非商业目的使用，并仅可用作个人查看使用”；“您不得将本人账号以任何方式提供给他人使用，包括但不限于不得以转让、出租、借用、分享、出售等方式”；并禁止“以营利、经营等非个人使用的目的为自己或他人开通本服务”。
- BYO token 模式下：token 由用户本人持有，数据只给本人在自己浏览器里查看，我们不保存 token、不缓存到服务器、不向他人展示，这与“个人查看使用”的方向一致。
- **仍待确认**：① 本工具本身是收费产品，用户用个人非商业许可的数据配合收费工具查看，是否被 Tushare 视为“商业用途”，需向 Tushare 书面确认（可联系其机构/定制服务 <https://tushare.pro/document/1?doc_id=11>）；② token 经过我们的代理转发，虽不记录，但从协议角度是否构成“提供给他人使用”需确认；③ Tushare 的上游数据授权（交易所行情许可）是否覆盖这种第三方工具内展示，未见公开说明；④ 代理所在服务器（Vercel/Cloudflare）可能有平台级访问日志（含 IP，不含请求体），需在隐私说明里披露；⑤ 若用户把 token 填在公共电脑上，风险由用户承担，设置页已提供一键清除。

**用自己的 token 实测**
1. `npm run build && npm start`（或 `npm run dev`），打开 <http://localhost:3000/app#settings>。
2. 在 tushare.pro 个人主页复制“接口 TOKEN”，粘贴到 Tushare token，点“测试连接”：会请求平安银行（000001.SZ）近 20 天日线和近 3 天 5 分钟线，显示日线根数和分钟权限是否可用。
3. 导入带 A 股成交的交割单（或点“载入 A 股示例”），到“交易列表”点任意一笔的 `[ K线复盘 ]`，数据源保持“自动”即走 Tushare；切换 1m/5m/15m 检查分钟权限提示；在设置里把复权改成“前复权”再看一次。
4. 用完可点“一键清除 token 与缓存”。

### A 股行情数据选项（调研记录）

默认**不接入**任何未经授权的非官方接口（新浪/腾讯/东方财富网页接口、以及封装它们的 AKShare 等），A 股 K 线目前只能用 CSV 导入。若要在线展示，可选：

| 方案 | 授权/许可 | 公开价格（以官方最新为准） | 来源 |
|---|---|---|---|
| 交易所信息公司直签：上证所信息网络（上交所）+ 深圳证券信息（深交所） | 沪深交易所联合声明：使用/展示行情须获得两家信息公司许可 | 上交所 L1 行情展示许可 15 万元/年 + 用户使用费 15 万元/年；上证历史数据 L1 3 万元/年（单购日 K 1 万/年、分钟 K 2 万/年）；深交所增强行情展示许可首个应用 35 万元/年，另有终端/普及版收费；申请有注册资本等资质要求 | <https://www.sseinfo.com/aboutus/authstatement/>、<https://www.sseinfo.com/services/cpfwjg/>、<http://www.szsi.cn/cpfw/fwsq/hq/sfbz-2.htm>、<http://www.szsi.cn/cpfw/fwsq/hq/sqlc-5.htm> |
| Tushare Pro | 标准协议为“个人的、不可转让的、非商业用途”；商业/机构需单独联系定制 | 积分制，如 2000 积分 200 元/年；历史分钟数据 2000 元/年；机构价格约 10 倍 | <https://tushare.pro/document/1?doc_id=405>、<https://tushare.pro/document/1?doc_id=290>、<https://tushare.pro/document/1?doc_id=11> |
| Wind / 同花顺 iFinD / 聚宽 JQData 等商业终端或数据 API | 按合同，通常需确认是否允许在面向公众的网站再展示 | 询价；政府采购公开信息参考：Wind 约 3–7 万元/账号/年，iFinD 约 1–1.2 万元/账号/年 | <https://www.wind.com.cn/portal/zh/WDS/index.html>、<https://quantapi.10jqka.com.cn/>、天风证券研报 <https://pdf.dfcfw.com/pdf/H3_AP202304041585061736_1.pdf> |
| 维持现状：用户自行导入 OHLC CSV | 数据由用户自备，本工具只在本地浏览器处理 | 0 | — |

结论：kim 已决定先支持“用户导入 CSV”+“用户自带 Tushare token”；面向公众直接展示行情仍需取得行情展示许可。 Provider 接口（`src/lib/kline/types.ts` 的 `KlineProvider`）已预留，接入新数据源只需实现 `fetchCandles` 并加入 `ONLINE_PROVIDERS`。

## 导入说明

- 先按文件头判断格式：`PK` → xlsx，`D0 CF 11 E0` → 真 xls，均交给 SheetJS；其余都按文本处理（很多券商的 .xls 实为 GBK/GB18030 制表符文本）。
- 文本先严格 UTF-8 解码（支持 BOM），失败则用 `TextDecoder('gbk')`（WHATWG 中 gbk 解码器即 gb18030）。
- Papa Parse 自动识别 Tab / 逗号 / 分号分隔；在前 30 行中找命中已知列名最多的一行作为表头，跳过标题、账号等说明行。
- 方向列识别“买/卖”；撤单、废单、银证转账、利息、红利、申购、中签等非成交行自动跳过并列出原因；方向列缺失时可用负数数量判断卖出。
- 证券代码不足 6 位自动补 0（如 `878` → `000878`）；支持 `20190710`、`2019-07-10`、`2019/7/10`、Excel 日期序列号。
- 有成交编号时用其去重；没有时用整行哈希（同一文件里完全相同的两行都会保留，重复导入同一文件会被跳过）。
- 字段映射界面：自动选择预设并映射，每个字段旁标注“已确认 / 待确认 / 手动”，可逐项调整。

## 券商列名确认情况

“已确认”= 有公开来源；“待确认”= 推测，未见到该券商真实导出文件。**所有预设上线前都要用真实脱敏文件回归测试。** 代码中逐个别名标注在 `src/lib/import/presets.ts`。

### 通用格式（本工具模板）—— 已确认（自定义）
`日期, 时间, 代码, 名称, 方向, 数量, 价格, 成交金额, 佣金, 印花税, 过户费, 其他费用, 品种类型`，见 `  app/api/tushare/route.proxy.ts   Tushare 透传代理（仅非静态构建生效）
workers/tushare-proxy/             Tushare 透传代理 Cloudflare Worker 版（静态部署用）
THIRD_PARTY_NOTICES.md             第三方组件 NOTICE / 归属
public/samples/sample-generic.csv`、`public/samples/sample-crypto.csv`。
- 时间、品种类型为可选列；时间按北京时间 `HH:mm:ss` 填写。
- 方向支持：买入/卖出、BUY/SELL、开多/平多/开空/平空、long/short 等（最终按买/卖成交方向处理，开平由 FIFO 判断）。
- 品种类型：A股 / 加密 / 其他（也认 美股、港股、期货 等 → 其他）；不填时 6 位数字代码按 A 股、`BTCUSDT`、`BTC/USDT`、`BTC-USDT` 之类按加密，其余按其他。交易对统一转成 `BTCUSDT` 形式。

### 东方财富（PC 端「快速交易→查询→交割单→导出数据」）
- 已确认：证券代码、发生日期、交易类别、成交数量、成交金额、发生金额、佣金、其他费用、印花税、过户费、币种。来源：<https://wealthsight.cn/docs/trade-import/eastmoney/>（映射表；“成交金额”出现在同页“成交金额 + 费用”模式说明中）
- 待确认：证券名称、成交价格/成交均价、成交时间、成交日期（作为日期别名）。来源称交割单**无成交编号**，因此按整行去重。
- 导出格式：来源称默认 xlsx；也可能是 GBK 制表符文本，两种都支持。
- 参考（非交割单）：东方财富“投资组合”模拟盘历史成交表头为 成交日期、成交时间、成交编号、证券代码、证券名称、买卖、成交价格、成交数量、成交金额、手续费 <https://group.eastmoney.com/room/index.html>，未作为预设依据。

### 同花顺（PC 端「查询→交割单」导出；列名随接入券商不同）
- 已确认（公开真实样例）：成交日期、证券代码、证券名称、买卖标志、成交价格、成交数量、成交金额、发生金额、佣金、印花税、过户费、其他费、成交编号、股东代码、备注、手续费。来源：<https://github.com/tyr-liu/stock>。
  - ⚠️ 该样例作者**未注明券商/客户端**，格式属同花顺/通达信系；“这就是同花顺主程序的导出”本身仍需真实文件核实。
  - 样例特征：日期 `20190710`；卖出数量为负；代码前导 0 丢失；“手续费”= 佣金+印花税+过户费+其他费（本工具只在没有费用明细时才用它）。
- 已确认（官方文档，成交汇总而非交割单）：操作、成交均价。来源：<https://quant.10jqka.com.cn/view/help/22>
- 待确认：成交时间、币种、发生日期（作为日期别名）、导出文件编码。

### 华泰证券
- 专业版Ⅲ「交割单」右键保存 `table.xls`（实为 GB18030 制表符文本）—— 已确认：证券代码、成交日期、业务名称、成交数量、成交金额、发生金额、手续费、印花税、过户费、其他杂费；无币种列、无唯一编号。
- 高级版「经典交易→查询→资金流水」输出 —— 已确认：证券代码、发生日期、业务名称、成交数量、发生金额、手续费、印花税、过户费、其他费、币种；含出入金等非买卖行（自动过滤）。
- 来源：<https://wealthsight.cn/docs/trade-import/huatai/>
- 待确认：证券名称、成交价格/成交均价、成交时间；“手续费”是否仅为佣金（目前按佣金处理）；涨乐财富通 App 的导出方式与列名（未找到可靠来源）。

## 部署

站点地址只从环境变量 `NEXT_PUBLIC_SITE_URL` 读取（`src/lib/site.ts`），metadataBase、canonical、sitemap、robots、Open Graph、JSON-LD 都引用它，代码中没有硬编码域名。**构建时**必须设置（它会被写进静态 HTML），不要以 `/` 结尾。

### 方式一：Vercel（推荐，零配置）
1. 把项目推到 Git 仓库，在 Vercel 中 Import（Framework 自动识别为 Next.js，Build Command `npm run build`）。
2. 在 Project Settings → Environment Variables 添加 `NEXT_PUBLIC_SITE_URL=https://<项目名>.vercel.app`（换自有域名后改这里并重新部署）。
3. 部署。页面均为静态预渲染；唯一的 Serverless 函数是 Tushare 透传代理 `/api/tushare`（可选设置 `TUSHARE_PROXY_ALLOWED_ORIGINS`、`TUSHARE_PROXY_RATE_PER_MIN`）。

### 方式二：Cloudflare Pages
**A. 静态导出（优先推荐）** —— 本项目全站可 SSG（落地页、博客、sitemap、robots、工具页都是静态的，工具页逻辑全在浏览器），因此直接用 `output: 'export'`：
1. Cloudflare Pages → 连接 Git 仓库，Framework preset 选 None。
2. Build command：`npm run build:static`（等于 `STATIC_EXPORT=1 next build`）；Build output directory：`out`。
3. 环境变量：`NEXT_PUBLIC_SITE_URL=https://<项目名>.pages.dev`，并建议设置 `NODE_VERSION=22`。
4. Cloudflare Pages 会自动把 `/app` 映射到 `app.html`。
5. A 股 Tushare 代理：`cd workers/tushare-proxy`，把 `wrangler.toml` 的 `ALLOWED_ORIGINS` 改成站点地址，`npx wrangler deploy`；再把 Worker 地址设为构建变量 `NEXT_PUBLIC_TUSHARE_PROXY_URL` 并重新构建。
- 取舍：最简单、免费额度最宽、无运行时；但不能使用 Next 的服务端功能（API Route、ISR、中间件、`next/image` 优化——已设置 `images.unoptimized`）。后续若要在同一项目里做面包多回调等服务端接口，建议单独用 Cloudflare Workers，或改走方案 B。

**B. `@opennextjs/cloudflare`（需要服务端能力时）** —— 把 Next.js 构建为 Cloudflare Workers：
1. `npm i -D @opennextjs/cloudflare wrangler`，按其文档生成 `wrangler.jsonc` 与 `open-next.config.ts`；
2. `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy`（部署到 Workers，域名为 `*.workers.dev`，也可绑定自有域名）。
- 取舍：支持 API Route、中间件等完整能力，但配置更多、受 Workers 体积/CPU 限制，且适配器版本需跟随 Next 版本。本骨架未安装该依赖。

## SEO 与性能

- 落地页 SSG，中文关键词（交易复盘、交易日志、股票复盘工具、交易记录分析）写入 title / description / H1 / keywords。
- Metadata API、canonical（`alternates.canonical` + `metadataBase`）、Open Graph（`public/og.png`）、SoftwareApplication JSON-LD（落地页）、Article JSON-LD（文章）、`app/sitemap.ts`、`app/robots.ts`。
- 工具页 `/app` 设置 `noindex, nofollow`，不进 sitemap；robots.txt 不屏蔽它（屏蔽抓取会导致搜索引擎读不到 noindex）。
- Core Web Vitals：落地页只有服务端组件和纯 CSS 背景（无大图、无外部字体）；Lightweight Charts、ECharts、Papa Parse、SheetJS、Dexie 都在工具页按需动态导入（落地页不加载）。
- 文章只讲记录与统计方法，不含买卖建议、荐股或收益承诺。

## 已知问题 / 待办

1. 三家券商预设缺少真实导出文件验证（见上），需向种子用户征集脱敏样本做回归测试。
2. A 股只做多；融券、可转债/期权、分红送转、配股、拆合股未处理（分红送转会让成本与持仓对不上）。期货/合约的保证金、杠杆、资金费率、合约面值未处理（“其他/加密”只按现货价差计算）。
3. 没有按“发生金额”核对费用的提示（数据已保留 `netAmount`）。
4. 多币种未做换算，按原币直接相加（加密显示 U，A 股显示 ¥；分组统计里会提示混合币种）。
5. 资金曲线只含已实现盈亏；回撤比例依赖用户填写的初始资金。
6. 盈亏日历、交易列表在窄屏上靠横向滚动。
7. A 股在线 K 线依赖用户自己的 Tushare 账号（合规待确认项见上）；box 上没有真实 token，只用无效 token 实测了错误格式，成功路径用 mock 测试。Binance/OKX 在中国大陆的可达性、以及其数据用于商业网站展示的条款未确认。
8. 代理限流是单实例内存计数（Serverless 多实例/冷启动会重置），只能防误用，不能防刻意滥用；需要时可换 Vercel KV / Cloudflare Rate Limiting。
9. ETF 不做前复权；stk_mins 对 ETF 是否可用未核实（失败时按无权限降级为日线）；北交所老代码段规则按公开号段推断。
10. 前复权时止损/目标线按开仓日因子换算，跨除权日的持仓可能有小偏差。
11. 成交点按所在 K 线定位，价格用成交价；成交价不在该 K 线高低区间内时（如导入的 K 线和成交来自不同交易所）标记会偏离 K 线。
12. “是否按计划执行”已记录但尚未进入分组统计；复盘日志暂不支持导出/备份（清空浏览器数据会丢失）。
13. 报告导出、激活码（`src/lib/license.ts` 接口占位）尚未实现。
