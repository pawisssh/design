#!/bin/sh
# PROTOTYPE #8 (throwaway): regenerate every offline output from the saved Figma readbacks in out/.
# No Figma calls. Contract v0 is the Button example; v1 is the owner-edited Contract this writes.
set -e
cd "$(dirname "$0")"
V0=../../contract/examples/carbon-button.component.json
EXPAND=../../contract/tools/expand_contract.py
tmp=$(mktemp -d)
node run.mjs diff $V0 out/readback.typed24.json | grep -v '^wrote' > out/diff.typed24.txt
node run.mjs diff $V0 out/readback.tweaked.json | grep -v '^wrote' > out/diff.tweaked.txt
node run.mjs apply $V0 out/proposals.json contract.v1.json
{
  echo "== check: rebuilt base + derived variants vs Contract v1 (each against its own tuple)"
  node run.mjs check contract.v1.json out/readback.v1.json | grep -v '^wrote'
  echo; echo "== same canvas vs Contract v0 (what propagated)"
  node run.mjs check $V0 out/readback.v1.json | grep -v '^wrote'
  echo; echo "== owner-tweaked node 18:31 vs Contract v1 (residue = what the Contract cannot carry)"
  node run.mjs check contract.v1.json out/readback.tweaked.json | grep -v '^wrote'
} > out/check.txt
node run.mjs approval $V0 contract.v1.json > out/approval.txt
python3 -I $EXPAND $V0 > out/expand.v0.txt
python3 -I $EXPAND contract.v1.json > out/expand.v1.txt
norm() { python3 -I -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), indent=4, sort_keys=True))' "$1"; }
norm $V0 > "$tmp/v0.json"; norm contract.v1.json > "$tmp/v1.json"
diff -u --label 'contract.v0.json (normalized)' --label 'contract.v1.json (normalized)' "$tmp/v0.json" "$tmp/v1.json" > out/contract.v0-v1.diff || true
rm -r "$tmp"
echo regenerated
