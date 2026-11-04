"use client";

import { useState } from "react";
import { newId, renderMarkdown, TAG_COLORS, type Emotion, type Journal, type Strategy, type Tag, type TagKind } from "@/lib/journal";

export interface JournalLib {
  tags: Tag[];
  strategies: Strategy[];
  emotions: Emotion[];
}

export interface LibActions {
  putTag(t: Tag): Promise<void>;
  deleteTag(id: string): Promise<void>;
  putStrategy(s: Strategy): Promise<void>;
  deleteStrategy(id: string): Promise<void>;
  putEmotion(e: Emotion): Promise<void>;
  deleteEmotion(id: string): Promise<void>;
}

const label = "font-mono text-[11px] tracking-wider text-slate-400";
const input = "w-full rounded-md border border-white/10 bg-slate-900/80 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none";
const chip = "rounded-full border px-2.5 py-0.5 text-xs transition-colors";

/** 复盘面板（受控组件）：标签、策略、入场原因、情绪、评分、计划、笔记 */
export default function JournalPanel({
  value,
  onChange,
  lib,
  actions,
  savedAt,
}: {
  value: Journal;
  onChange: (j: Journal) => void;
  lib: JournalLib;
  actions: LibActions;
  savedAt: string | null;
}) {
  const set = (patch: Partial<Journal>) => onChange({ ...value, ...patch });
  const [preview, setPreview] = useState(false);
  const toggleTag = (id: string) =>
    set({ tagIds: value.tagIds.includes(id) ? value.tagIds.filter((x) => x !== id) : [...value.tagIds, id] });
  const strategy = lib.strategies.find((s) => s.id === value.strategyId);

  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm tracking-wider text-slate-200"><span className="text-cyan-400">&gt;</span> TRADE_JOURNAL</h3>
        <span className="font-mono text-[10px] text-slate-500">{savedAt ? `已自动保存 ${savedAt}` : "自动保存"}</span>
      </div>

      {/* 策略 + 入场原因 */}
      <section className="space-y-2">
        <div className={label}>策略 STRATEGY</div>
        <select value={value.strategyId ?? ""} onChange={(e) => set({ strategyId: e.target.value || undefined })} className={input}>
          <option value="">（未选择）</option>
          {lib.strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {strategy?.description && <p className="text-xs text-slate-500">{strategy.description}</p>}
        <StrategyManager lib={lib} actions={actions} />
        <div className={label}>入场原因 ENTRY_REASON</div>
        <textarea rows={2} value={value.entryReason ?? ""} onChange={(e) => set({ entryReason: e.target.value })} placeholder="当时为什么开仓？依据是什么？" className={input} />
      </section>

      {/* 标签 */}
      <section className="space-y-2">
        <div className={label}>标签 TAGS</div>
        {(["mistake", "normal"] as TagKind[]).map((kind) => (
          <div key={kind} className="flex flex-wrap items-center gap-1.5">
            <span className="w-10 shrink-0 text-[11px] text-slate-500">{kind === "mistake" ? "错误类" : "普通类"}</span>
            {lib.tags.filter((t) => t.kind === kind).map((t) => {
              const on = value.tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(t.id)}
                  className={chip}
                  style={on ? { borderColor: t.color, background: `${t.color}26`, color: t.color } : { borderColor: "rgba(255,255,255,0.12)", color: "#94a3b8" }}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        ))}
        <TagManager lib={lib} actions={actions} />
      </section>

      {/* 情绪 */}
      <section className="space-y-2">
        <div className={label}>入场情绪 EMOTION</div>
        <div className="flex flex-wrap gap-1.5">
          {lib.emotions.map((e) => {
            const on = value.emotionId === e.id;
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={on}
                onClick={() => set({ emotionId: on ? undefined : e.id })}
                className={`${chip} ${on ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-300" : "border-white/12 text-slate-400 hover:text-slate-200"}`}
              >
                {e.name}
              </button>
            );
          })}
        </div>
        <EmotionManager lib={lib} actions={actions} />
      </section>

      {/* 评分 */}
      <section className="space-y-1">
        <div className={label}>执行评分 EXECUTION_SCORE</div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="执行评分">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value.rating === n}
              aria-label={`${n} 星`}
              onClick={() => set({ rating: value.rating === n ? undefined : n })}
              className={`text-xl leading-none ${(value.rating ?? 0) >= n ? "text-amber-300" : "text-slate-700 hover:text-slate-500"}`}
            >
              ★
            </button>
          ))}
          <span className="ml-2 font-mono text-xs text-slate-500">{value.rating ? `${value.rating}/5` : "未评分"}</span>
        </div>
      </section>

      {/* 计划 */}
      <section className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className={label}>计划止损价</span>
          <input type="number" step="any" inputMode="decimal" value={value.stopLoss ?? ""} onChange={(e) => set({ stopLoss: e.target.value === "" ? undefined : Number(e.target.value) })} className={`${input} num`} />
        </label>
        <label className="space-y-1">
          <span className={label}>目标价</span>
          <input type="number" step="any" inputMode="decimal" value={value.takeProfit ?? ""} onChange={(e) => set({ takeProfit: e.target.value === "" ? undefined : Number(e.target.value) })} className={`${input} num`} />
        </label>
        <div className="col-span-2 flex items-center gap-2">
          <span className={label}>按计划执行？</span>
          {([
            [true, "是"],
            [false, "否"],
            [undefined, "未填"],
          ] as const).map(([v, t]) => (
            <button
              key={t}
              type="button"
              aria-pressed={value.followedPlan === v}
              onClick={() => set({ followedPlan: v })}
              className={`${chip} ${value.followedPlan === v ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-300" : "border-white/12 text-slate-400"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* 笔记 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={label}>复盘笔记 NOTES（支持简单 Markdown）</span>
          <button type="button" onClick={() => setPreview(!preview)} className="font-mono text-[11px] text-cyan-300 hover:underline">
            {preview ? "[ 编辑 ]" : "[ 预览 ]"}
          </button>
        </div>
        {preview ? (
          <div
            className="prose-sm min-h-[120px] rounded-md border border-white/10 bg-slate-900/50 p-3 text-slate-300 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_h4]:font-semibold [&_h5]:font-semibold [&_li]:ml-4 [&_li]:list-disc"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(value.notes ?? "") || '<p class="text-slate-600">（空）</p>' }}
          />
        ) : (
          <textarea
            rows={6}
            value={value.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder={"- 做对了什么\n- 做错了什么\n- 下次如何改进"}
            className={`${input} font-mono text-xs leading-relaxed`}
          />
        )}
      </section>
    </div>
  );
}

function Manager({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-md border border-white/5 bg-white/[0.02] px-2 py-1 text-xs text-slate-400">
      <summary className="cursor-pointer select-none py-0.5 font-mono text-[11px] text-slate-500 hover:text-slate-300">{title}</summary>
      <div className="space-y-2 py-2">{children}</div>
    </details>
  );
}

function TagManager({ lib, actions }: { lib: JournalLib; actions: LibActions }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TagKind>("normal");
  const [color, setColor] = useState(TAG_COLORS[0]);
  return (
    <Manager title="[ 管理标签 ]">
      {lib.tags.map((t) => (
        <div key={t.id} className="flex items-center gap-1.5">
          <input
            defaultValue={t.name}
            onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && actions.putTag({ ...t, name: e.target.value.trim() })}
            className={`${input} !py-0.5 text-xs`}
            aria-label="标签名称"
          />
          <select value={t.kind} onChange={(e) => actions.putTag({ ...t, kind: e.target.value as TagKind })} className={`${input} !w-20 !py-0.5 text-xs`} aria-label="标签类别">
            <option value="mistake">错误类</option>
            <option value="normal">普通类</option>
          </select>
          <ColorPicker value={t.color} onChange={(c) => actions.putTag({ ...t, color: c })} />
          <button type="button" onClick={() => confirm(`删除标签“${t.name}”？已打的标签会一并移除。`) && actions.deleteTag(t.id)} className="px-1 text-slate-500 hover:text-rose-400" aria-label="删除">✕</button>
        </div>
      ))}
      <form
        className="flex items-center gap-1.5 border-t border-white/5 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          actions.putTag({ id: newId("t"), name: name.trim(), kind, color });
          setName("");
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="新标签" className={`${input} !py-0.5 text-xs`} />
        <select value={kind} onChange={(e) => setKind(e.target.value as TagKind)} className={`${input} !w-20 !py-0.5 text-xs`}>
          <option value="mistake">错误类</option>
          <option value="normal">普通类</option>
        </select>
        <ColorPicker value={color} onChange={setColor} />
        <button type="submit" className="rounded border border-cyan-400/40 px-2 py-0.5 text-cyan-300">添加</button>
      </form>
    </Manager>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 shrink-0 cursor-pointer appearance-none rounded border border-white/10" style={{ background: value }} aria-label="颜色">
      {TAG_COLORS.map((c) => <option key={c} value={c} style={{ background: c }}>{c}</option>)}
    </select>
  );
}

function StrategyManager({ lib, actions }: { lib: JournalLib; actions: LibActions }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <Manager title="[ 策略库 ]">
      {lib.strategies.length === 0 && <p className="text-slate-600">还没有策略，先添加一个。</p>}
      {lib.strategies.map((s) => (
        <div key={s.id} className="flex items-start gap-1.5">
          <div className="flex-1 space-y-1">
            <input defaultValue={s.name} onBlur={(e) => e.target.value.trim() && actions.putStrategy({ ...s, name: e.target.value.trim() })} className={`${input} !py-0.5 text-xs`} aria-label="策略名称" />
            <input defaultValue={s.description ?? ""} onBlur={(e) => actions.putStrategy({ ...s, description: e.target.value })} placeholder="描述" className={`${input} !py-0.5 text-xs`} aria-label="策略描述" />
          </div>
          <button type="button" onClick={() => confirm(`删除策略“${s.name}”？`) && actions.deleteStrategy(s.id)} className="px-1 pt-1 text-slate-500 hover:text-rose-400" aria-label="删除">✕</button>
        </div>
      ))}
      <form
        className="space-y-1 border-t border-white/5 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          actions.putStrategy({ id: newId("s"), name: name.trim(), description: desc.trim() || undefined });
          setName("");
          setDesc("");
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="策略名称，如：趋势回踩" className={`${input} !py-0.5 text-xs`} />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="描述（可选）" className={`${input} !py-0.5 text-xs`} />
        <button type="submit" className="rounded border border-cyan-400/40 px-2 py-0.5 text-cyan-300">添加策略</button>
      </form>
    </Manager>
  );
}

function EmotionManager({ lib, actions }: { lib: JournalLib; actions: LibActions }) {
  const [name, setName] = useState("");
  return (
    <Manager title="[ 自定义情绪 ]">
      <div className="flex flex-wrap gap-1.5">
        {lib.emotions.filter((e) => !e.builtin).map((e) => (
          <span key={e.id} className="rounded-full border border-white/10 px-2 py-0.5">
            {e.name}
            <button type="button" onClick={() => actions.deleteEmotion(e.id)} className="ml-1 text-slate-500 hover:text-rose-400" aria-label={`删除${e.name}`}>✕</button>
          </span>
        ))}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          actions.putEmotion({ id: newId("e"), name: name.trim() });
          setName("");
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="新情绪，如：疲惫" className={`${input} !py-0.5 text-xs`} />
        <button type="submit" className="shrink-0 rounded border border-cyan-400/40 px-2 py-0.5 text-cyan-300">添加</button>
      </form>
    </Manager>
  );
}
