// The Tailwind shapes of #216, one per line: template-literal classNames whose static parts set buttons apart
// (a pair sharing one, a partial `w-${n}` token), inputs apart by width, a region, usages and copy styled only with
// utilities or nothing, and one authored class (`.summary` in summary.css) that still names its element.
import { useState } from 'react';

export default function App() {
  const [mode, setMode] = useState('even');
  const [n] = useState(4);
  return (
    <div className="min-h-screen flex flex-col p-6">
      <p className="text-[8px] opacity-50">Version 4.5 Precision Banding</p>
      <p className="summary text-sm">Three funds to sell</p>
      <button className={`flex-1 py-1.5 rounded-lg ${mode === 'even' ? 'bg-white' : 'text-slate-500'}`} onClick={() => setMode('even')}>Even</button>
      <button className={`flex-1 py-1.5 rounded-lg ${mode === 'model' ? 'bg-white' : 'text-slate-500'}`} onClick={() => setMode('model')}>Model</button>
      <button className={`rounded-md border px-2 shrink-0 ${mode === 'min' ? 'bg-orange-600' : 'bg-slate-50'}`}>Min.</button>
      <button className={`ml-auto p-1 w-${n} h-${n}`}>Clear</button>
      <button className="px-2 text-xs">Reset</button>
      <input type="text" className={`w-14 text-right ${n > 0 ? 'text-green-600' : 'text-red-600'}`} />
      <input type="text" className={`w-8 text-right ${n > 0 ? 'text-green-600' : 'text-red-600'}`} />
      <span>{n} funds left</span>
    </div>
  );
}
