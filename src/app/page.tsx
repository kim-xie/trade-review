import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { PRICING, FREE_TIER } from "@/lib/config";
import { absoluteUrl, DISCLAIMER, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/site";

// 落地页：纯静态（SSG），只用服务端组件，不加载 ECharts / SheetJS 等重库。
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const features = [
  { title: "券商交割单导入", body: "支持 CSV / Excel，自动识别 GBK 编码与表头位置；内置东方财富、同花顺、华泰列名预设，可手动调整字段映射。" },
  { title: "先进先出配对成笔", body: "分批买入、分批卖出、部分平仓都能处理；每笔计算净盈亏、持仓天数，佣金、印花税、过户费按比例分摊。" },
  { title: "交易记录分析", body: "胜率、盈亏比、利润因子、最大回撤、资金曲线一目了然，未平仓持仓单独列出。" },
  { title: "本地优先", body: "所有数据只保存在浏览器 IndexedDB 中，不上传服务器，断网也能用。" },
];

const faqs = [
  { q: "数据会上传吗？", a: "不会。文件在浏览器中解析，结果保存在本机 IndexedDB。清除浏览器数据会一并删除。" },
  { q: "支持哪些券商？", a: "提供通用模板，以及东方财富、同花顺、华泰的列名预设。其他券商可在导入时手动对应列名。" },
  { q: "免费版有什么限制？", a: `免费版仅分析最近 ${FREE_TIER.windowDays} 天的交易记录；买断后解锁全部历史。` },
  { q: "会给出买卖建议吗？", a: "不会。本工具只整理和统计你自己的历史成交记录，不提供行情、荐股或任何投资建议。" },
];

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: absoluteUrl("/"),
    description: SITE_DESCRIPTION,
    inLanguage: "zh-CN",
    offers: { "@type": "Offer", price: String(PRICING.lifetimePrice), priceCurrency: "CNY" },
  };

  return (
    <main>
      <JsonLd data={jsonLd} />
      <section className="relative overflow-hidden">
        <div aria-hidden className="hero-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-24 text-center md:pt-32">
          <p className="mb-5 inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-cyan-300 backdrop-blur">
            本地优先 · 数据不出浏览器
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            <span className="text-gradient">交易复盘</span>，从你的交割单开始
            <span className="mt-3 block text-xl font-normal text-slate-300 md:text-2xl">
              股票复盘工具 · 交易日志 · 交易记录分析
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 md:text-lg">
            导入东方财富、同花顺、华泰等券商成交记录，自动先进先出配对成笔，统计胜率、盈亏比、最大回撤与资金曲线。
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link href="/app" className="rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3 font-medium text-slate-950 hover:opacity-90">
              免费开始复盘
            </Link>
            <Link href="/blog/how-to-review-stock-trades" className="rounded-lg border border-white/15 px-6 py-3 text-slate-200 hover:bg-white/5">
              如何做交易复盘
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="features" className="mx-auto max-w-6xl px-6 py-16">
        <h2 id="features" className="text-2xl font-semibold tracking-tight">功能</h2>
        <ul className="mt-8 grid gap-5 md:grid-cols-2">
          {features.map((f) => (
            <li key={f.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
              <h3 className="font-medium text-slate-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pricing" className="mx-auto max-w-6xl px-6 py-16">
        <h2 id="pricing" className="text-2xl font-semibold tracking-tight">价格</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <article className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <h3 className="font-medium">免费版</h3>
            <p className="num mt-3 text-3xl font-semibold">¥0</p>
            <p className="mt-3 text-sm text-slate-400">全部功能可用，仅分析最近 {FREE_TIER.windowDays} 天的交易记录。</p>
          </article>
          <article className="rounded-xl border border-cyan-400/30 bg-cyan-400/[0.04] p-6">
            <h3 className="font-medium">买断版</h3>
            <p className="mt-3 text-3xl font-semibold">
              <span className="num">¥{PRICING.lifetimePrice}</span>
              <span className="ml-3 text-sm font-normal text-slate-400">首周 <span className="num">¥{PRICING.launchWeekPrice}</span></span>
            </p>
            <p className="mt-3 text-sm text-slate-400">一次付费，解锁全部历史记录分析。（即将开放）</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="faq" className="mx-auto max-w-6xl px-6 py-16">
        <h2 id="faq" className="text-2xl font-semibold tracking-tight">常见问题</h2>
        <dl className="mt-8 divide-y divide-white/10 rounded-xl border border-white/10">
          {faqs.map((f) => (
            <div key={f.q} className="p-6">
              <dt className="font-medium text-slate-100">{f.q}</dt>
              <dd className="mt-2 text-sm text-slate-400">{f.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-sm text-slate-500">{DISCLAIMER}</p>
      </section>
    </main>
  );
}
