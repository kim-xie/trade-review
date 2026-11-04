import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { getPost, POSTS } from "@/lib/blog";
import { absoluteUrl, DISCLAIMER, OG_IMAGE, SITE_NAME } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: "article", title: post.title, description: post.description, url: `/blog/${post.slug}`, publishedTime: post.date, images: [OG_IMAGE] },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    inLanguage: "zh-CN",
    mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
    publisher: { "@type": "Organization", name: SITE_NAME },
  };
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <JsonLd data={jsonLd} />
      <nav aria-label="面包屑" className="text-sm text-slate-500">
        <Link href="/blog" className="hover:text-slate-300">文章</Link> / <span>{post.title}</span>
      </nav>
      <article className="mt-6">
        <header>
          <h1 className="text-3xl font-semibold leading-snug tracking-tight">{post.title}</h1>
          <time dateTime={post.date} className="num mt-3 block text-sm text-slate-500">{post.date}</time>
        </header>
        {post.sections.map((s) => (
          <section key={s.heading} className="mt-10">
            <h2 className="text-xl font-medium text-slate-100">{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-4 leading-8 text-slate-300">{p}</p>
            ))}
            {s.list && (
              <ul className="mt-4 list-disc space-y-2 pl-6 text-slate-300">
                {s.list.map((li) => <li key={li}>{li}</li>)}
              </ul>
            )}
          </section>
        ))}
        <aside className="mt-12 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
          {DISCLAIMER} <Link href="/app" className="text-cyan-300 hover:underline">用交易复盘工具整理你的交割单 →</Link>
        </aside>
      </article>
    </main>
  );
}
