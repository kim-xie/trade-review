/**
 * Tushare 透传代理 —— Cloudflare Worker 版（静态部署 / Cloudflare Pages 用）。
 * 与 Next.js 路由共用 src/lib/tushareProxy.ts 的逻辑：只转发到 https://api.tushare.pro，白名单 api_name，
 * Origin 校验，简单限流（每个 isolate 内存计数），不记录、不存储 token。
 *
 * 环境变量（wrangler.toml [vars] 或 Dashboard）：
 * - ALLOWED_ORIGINS：逗号分隔，如 "https://your-site.pages.dev,http://localhost:3000"（必填，否则拒绝所有跨域请求）
 * - RATE_PER_MIN：每 IP 每分钟最多请求数，默认 60
 */
import { handleTushareProxy, parseAllowedOrigins, RateLimiter } from "../../../src/lib/tushareProxy";

interface Env {
  ALLOWED_ORIGINS?: string;
  RATE_PER_MIN?: string;
}

let limiter: RateLimiter | null = null;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    limiter ??= new RateLimiter(Number(env.RATE_PER_MIN) || 60);
    const out = await handleTushareProxy(
      {
        method: req.method,
        url: req.url,
        origin: req.headers.get("origin"),
        ip: req.headers.get("cf-connecting-ip") ?? "unknown",
        bodyText: () => req.text(),
      },
      { allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS), limiter },
    );
    return new Response(out.body, { status: out.status, headers: out.headers });
  },
};
