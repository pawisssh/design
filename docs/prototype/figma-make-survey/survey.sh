#!/bin/bash
# survey.sh <dir-of-clones> <repo-list>: shallow-clone each repo (no checkout of blobs outside the tree we read) and report its Make shape.
out=$1; list=$2
while read -r repo; do
  d="$out/$(echo "$repo" | tr '/' '__')"
  [ -d "$d" ] || git clone -q --depth 1 "https://github.com/$repo.git" "$d" 2>/dev/null || { echo "$repo CLONE-FAIL"; continue; }
  sha=$(git -C "$d" rev-parse --short=12 HEAD)
  # The package.json at the bundle's root may sit in a subfolder: take the one named @figma/my-make-file.
  pj=$(grep -rl --include=package.json '"@figma/my-make-file"' "$d" 2>/dev/null | grep -v node_modules | head -1)
  [ -z "$pj" ] && { echo "$repo $sha NO-PKG"; continue; }
  root=$(dirname "$pj")
  ui=$(cd "$root" && ls -d src/app/components/ui src/components/ui components/ui 2>/dev/null | head -1)
  nui=$( [ -n "$ui" ] && ls "$root/$ui" | wc -l | tr -d ' ' || echo 0)
  users=$( [ -n "$ui" ] && grep -rlE "from ['\"][^'\"]*(/ui/|components/ui/)[a-z-]+['\"]" "$root/src" 2>/dev/null | grep -v "/$ui/" | wc -l | tr -d ' ' || echo 0)
  cj=$( [ -f "$root/components.json" ] && echo yes || echo no)
  lock=$(cd "$root" && ls package-lock.json pnpm-lock.yaml bun.lock bun.lockb yarn.lock 2>/dev/null | tr '\n' ',' )
  rdeps=$(grep -c '"react":' "$pj")
  peer=$(sed -n '/"peerDependencies"/,/}/p' "$pj" | grep -c '"react"')
  dep=$(sed -n '/"dependencies"/,/}/p' "$pj" | grep -c '"react":')
  tw=$(grep -oE '"tailwindcss": *"[^"]+"' "$pj" | head -1)
  twa=$(grep -oE '"tw-animate-css": *"[^"]+"' "$pj" | head -1)
  vite=$(grep -oE '"vite": *"[^"]+"' "$pj" | head -1)
  mui=$(grep -rlE "from ['\"]@mui/" "$root/src" 2>/dev/null | wc -l | tr -d ' ')
  rel=${root#$d}
  echo "$repo $sha root=${rel:-.} ui=${ui:-none}($nui) users=$users cj=$cj lock=${lock:-none} peerReact=$peer depReact=$dep $tw $twa $vite muiUse=$mui"
done < "$list"
