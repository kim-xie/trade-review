import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-gradient-to-br from-cyan-400 to-blue-500" />
          {SITE_NAME}
        </Link>
        <nav aria-label="主导航" className="flex items-center gap-6 text-sm text-slate-300">
          <Link href="/blog" className="hover:text-white">文章</Link>
          <Link
            href="/app"
            className="rounded-md bg-gradient-to-r from-cyan-400 to-blue-500 px-3 py-1.5 font-medium text-slate-950 hover:opacity-90"
          >
            开始复盘
          </Link>
        </nav>
      </div>
    </header>
  );
}
