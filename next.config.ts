import type { NextConfig } from "next";

/**
 * 部署模式：
 * - 默认（Vercel / `next start`）：普通 Next.js 构建，所有页面均为 SSG。
 * - STATIC_EXPORT=1：输出纯静态站点到 out/（适合 Cloudflare Pages 静态托管）。
 *   页面全部是静态的；唯一的服务端代码是 Tushare 透传代理 /api/tushare，静态导出时不包含，
 *   需要另外部署 workers/tushare-proxy 并设置 NEXT_PUBLIC_TUSHARE_PROXY_URL。
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(isStaticExport ? { output: "export" as const } : {}),
  // src/app/api/tushare/route.proxy.ts 只在非静态构建时生效（静态导出不支持 POST 路由）
  pageExtensions: isStaticExport ? ["tsx", "ts"] : ["proxy.ts", "tsx", "ts"],
  env: { NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? "1" : "" },
  images: { unoptimized: true },
};

export default nextConfig;
