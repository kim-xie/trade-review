/**
 * Tushare 透传代理（Vercel / `next start`）。
 * 文件名使用 route.proxy.ts：普通构建时 next.config 把 "proxy.ts" 加入 pageExtensions 使其生效；
 * build:static（output: 'export'）时不加入，避免静态导出因 POST 路由失败。静态部署请改用 workers/tushare-proxy。
 */
import { handleTushareProxy, parseAllowedOrigins, RateLimiter } from "@/lib/tushareProxy";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(Number(process.env.TUSHARE_PROXY_RATE_PER_MIN) || 60);

async function handle(req: Request): Promise<Response> {
  const allowedOrigins = [...parseAllowedOrigins(process.env.TUSHARE_PROXY_ALLOWED_ORIGINS), new URL(SITE_URL).origin];
  const out = await handleTushareProxy(
    {
      method: req.method,
      url: req.url,
      origin: req.headers.get("origin"),
      ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown",
      bodyText: () => req.text(),
    },
    { allowedOrigins, limiter },
  );
  return new Response(out.body, { status: out.status, headers: out.headers });
}

export const POST = handle;
export const OPTIONS = handle;
