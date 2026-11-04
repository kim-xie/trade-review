import type { Metadata } from "next";
import ToolClient from "@/components/ToolClient";
import { DISCLAIMER } from "@/lib/site";

export const metadata: Metadata = {
  title: "复盘工作台",
  description: "导入券商成交记录，先进先出配对并统计。",
  alternates: { canonical: "/app" },
  robots: { index: false, follow: false },
};

export default function AppPage() {
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">复盘工作台</h1>
        <p className="text-xs text-amber-300/80">{DISCLAIMER}</p>
      </div>
      <ToolClient />
    </main>
  );
}
