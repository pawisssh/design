// PROTOTYPE (#88): in-page check. For every rendered specimen, compare the shadcn Button's computed box with
// what the Contract resolves for that tuple (window.__expected). Call window.__check() in the console.
window.__check = function () {
  const rows = [];
  for (const host of document.querySelectorAll('.tp-specimen')) {
    const want = window.__expected[host.dataset.key];
    const btn = host.querySelector('button');
    if (!btn) continue;
    const cs = getComputedStyle(btn);
    const svg = btn.querySelector(':scope > svg');
    const text = [...btn.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const got = {
      paddingLeft: parseFloat(cs.paddingLeft), paddingRight: parseFloat(cs.paddingRight), height: btn.offsetHeight,
      width: typeof want?.width === 'number' ? btn.offsetWidth : 'hug', gap: parseFloat(cs.columnGap),
      icon: !!svg, label: text, iconSize: svg ? svg.getBoundingClientRect().width : want?.iconSize,
    };
    const diff = want ? Object.keys(got).filter(k => got[k] !== want[k]) : ['not selected'];
    rows.push({ key: host.dataset.key, ok: diff.length === 0, diff: diff.map(k => `${k}: want ${want && want[k]} got ${got[k]}`) });
  }
  return { specimens: rows.length, mismatches: rows.filter(r => !r.ok) };
};
