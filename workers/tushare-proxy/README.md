# tushare-proxy（Cloudflare Worker）

静态部署（`npm run build:static` → Cloudflare Pages 等）时没有 Next.js 路由，用这个 Worker 作为 Tushare 透传代理。

```bash
cd workers/tushare-proxy
# 修改 wrangler.toml 里的 ALLOWED_ORIGINS 为你的站点地址
npx wrangler deploy
```

部署后把 Worker 地址（如 `https://tushare-proxy.<你的子域>.workers.dev`）写到站点构建环境变量
`NEXT_PUBLIC_TUSHARE_PROXY_URL`，重新构建；用户也可以在工具页“设置”里手动填写代理地址。

行为：只接受 POST JSON `{api_name, token, params, fields}`，`api_name` 只允许 daily / fund_daily / adj_factor / stk_mins / trade_cal，
参数键只允许 ts_code / start_date / end_date / trade_date / freq / exchange / is_open；校验 Origin；每 IP 每分钟 60 次；
只转发到 https://api.tushare.pro；不记录、不存储 token。
