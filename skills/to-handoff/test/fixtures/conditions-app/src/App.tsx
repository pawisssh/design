// The condition shapes of #213, one per line: class strings, a && inside a template literal, a style object,
// a && chain with a parenthesized comparison, and an `_error` property.
import { useState } from 'react';

export default function App() {
  const [mode, setMode] = useState<'fixed' | 'diy'>('diy');
  const [amount] = useState(0);
  const [limit] = useState(100);
  const [pl] = useState(5);
  const [drift] = useState(0);
  const result: { total: number; _error?: string } = { total: amount };
  const over = amount > limit;
  return (
    <main className="calc">
      <button className={`tab ${mode === 'fixed' ? 'tab-on' : 'tab-off'}`} onClick={() => setMode('fixed')}>Fixed</button>
      <p className={`total ${amount > 0 && amount < limit ? 'total-low' : 'total-ok'}`}>{amount}</p>
      <div className="bar" style={{ left: drift < 0 ? '40%' : '50%' }} />
      {mode === 'diy' && (amount * (pl / 100)) > 0 && !over && <p className="gain">Gain</p>}
      {result._error && <p className="error">{result._error}</p>}
    </main>
  );
}
