import { useState } from "react";

const CARD = "rounded-[8px] border border-[#e2e8f0] bg-[#ffffff] p-4 shadow-sm";
const VIEWS = ["Day", "Week", "Month"];

function buttonClass(kind: string) {
  return kind === "link" ? "underline" : "rounded bg-[#0f172a] px-2 py-1 text-[#ffffff]";
}

export default function App() {
  const [view, setView] = useState("Day");
  const [active, setActive] = useState(false);
  const [extra, setExtra] = useState(0);
  const [trend, setTrend] = useState("Gain");
  const canClear = extra > 0;
  let s = active ? "bg-[#16a34a] text-[#ffffff]" : "border border-[#cbd5e1] bg-[#ffffff] text-[#475569]";

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-1">
        <button className="ml-2 inline-flex items-center justify-center rounded p-1 text-[#16a34a] hover:bg-[#f0fdf4]">
          <svg className="size-4" viewBox="0 0 16 16"><path d="M2 8h12" /></svg>
        </button>
        <button className="inline-flex items-center justify-center rounded p-1 text-[#dc2626] hover:bg-[#fef2f2]">
          <svg className="size-4" viewBox="0 0 16 16"><path d="M2 8h12" /></svg>
        </button>
        <button className="flex-1 inline-flex items-center justify-center rounded p-1 text-[#ea580c] hover:bg-[#fff7ed] disabled:opacity-40" disabled={extra === 0}>
          <svg className="size-4" viewBox="0 0 16 16"><path d="M2 8h12" /></svg>
        </button>
      </div>
      <div className="flex gap-2">
        <span className="inline-flex items-center rounded-[10px] bg-[#eef2ff] px-2 py-0.5 text-xs text-[#3730a3]">Paid</span>
        <span className="inline-flex items-center rounded-[10px] bg-[#eef2ff] px-2 py-0.5 text-xs text-[#3730a3]">Due</span>
        <span className="inline-flex items-center gap-1 rounded-[10px] bg-[#eef2ff] px-2 py-0.5 text-xs text-[#3730a3]">
          <svg className="size-3" viewBox="0 0 16 16"><path d="M2 8h12" /></svg>
          Sent
        </span>
      </div>
      <div className="flex items-center justify-between">
        {VIEWS.map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`inline-flex items-center justify-center rounded-[6px] px-3 py-1 text-sm font-medium ${view === v ? "bg-[#ffffff] text-[#0f172a] shadow-sm" : "text-[#64748b]"}`}
          >
            {v}
          </button>
        ))}
      </div>
      <button
        onClick={() => setExtra(0)}
        disabled={!canClear}
        className={`inline-flex items-center justify-center rounded px-4 py-2 text-sm font-semibold ${canClear ? "bg-[#dc2626] text-[#ffffff]" : "bg-[#e2e8f0] text-[#94a3b8]"}`}
      >
        Clear Extra
      </button>
      <button
        onClick={() => setActive(!active)}
        className={`inline-flex items-center justify-center rounded-[999px] px-3 py-1 text-xs font-medium ${s}`}
      >
        Quick Withdraw
      </button>
      <button className={buttonClass("solid")}>Save</button>
      <div className={CARD}>
        <div className="flex items-center justify-between">
          <span className="text-sm">Total</span>
        </div>
      </div>
      <div className={`${CARD} mt-4`}>
        <span className="text-sm">Fund</span>
      </div>
      <div className="rounded-[4px] bg-[#fef9c3] p-2">
        <span className="text-sm">Heads up</span>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTrend("Gain")} className={`inline-flex items-center rounded-[12px] px-3 py-1 text-xs font-medium ${trend === "Gain" ? "bg-[#16a34a] text-[#ffffff]" : "bg-[#f0fdf4] text-[#16a34a]"}`}>Gain</button>
        <button onClick={() => setTrend("Loss")} className={`inline-flex items-center rounded-[12px] px-3 py-1 text-xs font-medium ${trend === "Loss" ? "bg-[#dc2626] text-[#ffffff]" : "bg-[#fef2f2] text-[#dc2626]"}`}>Loss</button>
        <button onClick={() => setTrend("Flat")} className={`inline-flex items-center rounded-[12px] px-3 py-1 text-xs font-medium ${trend === "Flat" ? "bg-[#475569] text-[#ffffff]" : "bg-[#f1f5f9] text-[#475569]"}`}>Flat</button>
      </div>
    </div>
  );
}
