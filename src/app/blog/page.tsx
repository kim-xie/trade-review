import Link from "next/link";
import type { Metadata } from "next";
import { POSTS } from "@/lib/blog";
import { OG_IMAGE } from "@/lib/site";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "交易复盘文章",
  description: "交易复盘、交易日志与交易记录分析的方法文章。只讲记录与统计方法，不提供投资建议。",
  alternates: { canonical: "/blog" },
  openGraph: { title: "交易复盘文章", url: "/blog", images: [OG_IMAGE] },
};

export default function BlogIndex() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">交易复盘文章</h1>
      <ul className="mt-10 space-y-5">
        {POSTS.map((p) => (
          <li key={p.slug} className="rounded-xl border border-white/10 bg-white/[0.03] p-6 hover:border-cyan-400/40">
            <article>
              <h2 className="text-lg font-medium">
                <Link href={`/blog/${p.slug}`} className="hover:text-cyan-300">{p.title}</Link>
              </h2>
              <p className="mt-2 text-sm text-slate-400">{p.description}</p>
              <time dateTime={p.date} className="num mt-3 block text-xs text-slate-500">{p.date}</time>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
