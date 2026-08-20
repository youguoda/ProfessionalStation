"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { PERSONA_TEMPLATES } from "@/lib/agent/persona";
import { splitCapture } from "@/lib/parsing/capture";

const FIELDS: Array<{
  key: "role" | "tone" | "style" | "boundaries";
  label: string;
  placeholder: string;
}> = [
  { key: "role", label: "角色", placeholder: "它是什么身份、与你的关系" },
  { key: "tone", label: "语气", placeholder: "说话的语气与情绪基调" },
  { key: "style", label: "风格", placeholder: "回复的结构与表达习惯" },
  { key: "boundaries", label: "边界", placeholder: "什么不能做、什么必须做" },
];

export function AgentSettings({ onBack }: { onBack: () => void }) {
  const agentProfile = useStore((s) => s.agentProfile);
  const saveAgentProfile = useStore((s) => s.saveAgentProfile);

  const [name, setName] = useState(agentProfile?.name ?? "马力");
  const [personaId, setPersonaId] = useState(agentProfile?.personaId ?? "comrade");
  const [custom, setCustom] = useState({
    role: agentProfile?.custom.role.join("\n") ?? "",
    tone: agentProfile?.custom.tone.join("\n") ?? "",
    style: agentProfile?.custom.style.join("\n") ?? "",
    boundaries: agentProfile?.custom.boundaries.join("\n") ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await saveAgentProfile({
        name: name.trim() || "马力",
        personaId,
        custom: {
          role: splitCapture(custom.role),
          tone: splitCapture(custom.tone),
          style: splitCapture(custom.style),
          boundaries: splitCapture(custom.boundaries),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← 返回
        </button>
        <span className="text-sm font-medium">人格设置</span>
        <span className="w-10" />
      </div>

      <label className="block text-xs text-muted-foreground">
        名字
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        />
      </label>

      <div className="mb-1 mt-4 text-xs text-muted-foreground">
        预设人格（选一个做底子，下面可以继续改）
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PERSONA_TEMPLATES.map((p) => (
          <button
            key={p.id}
            onClick={() => setPersonaId(p.id)}
            className={`rounded-lg border p-2 text-left transition-colors ${
              personaId === p.id ? "border-primary bg-primary/10" : "bg-background hover:border-primary/40"
            }`}
          >
            <div className="text-sm font-medium">
              {p.emoji} {p.label}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{p.desc}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-xs text-muted-foreground">
            {f.label}（每行一条，叠加在模板之上）
            <textarea
              value={custom[f.key]}
              onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))}
              rows={2}
              placeholder={f.placeholder}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {saved ? "已保存 ✓" : busy ? "保存中…" : "保存人格"}
      </button>
    </div>
  );
}
