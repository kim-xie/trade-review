import Link from "next/link";
import { DISCLAIMER, SITE_NAME } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
        <p>
          © {new Date().getFullYear()} {SITE_NAME}。数据仅保存在你的浏览器本地。
        </p>
        <nav aria-label="页脚导航" className="flex gap-6">
          <Link href="/" className="hover:text-slate-200">首页</Link>
          <Link href="/app" className="hover:text-slate-200">打开工具</Link>
          <Link href="/blog" className="hover:text-slate-200">复盘文章</Link>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-6 text-xs text-slate-500">
        开源组件：K 线复盘图表使用{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 underline-offset-2 hover:underline">
          TradingView
        </a>{" "}
        Lightweight Charts™（Apache-2.0）；资金曲线使用 Apache ECharts（Apache-2.0）。详见项目 THIRD_PARTY_NOTICES.md。
      </p>
      <p className="mx-auto max-w-6xl px-6 pb-10 pt-2 text-xs text-slate-500">{DISCLAIMER}</p>
    </footer>
  );
}
