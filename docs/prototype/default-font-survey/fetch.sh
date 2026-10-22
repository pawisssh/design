#!/bin/zsh
# fetch each bundle's stylesheets, index.html, tailwind config and root package.json at its pinned SHA (data only)
#   fetch.sh <out-dir> repos.txt     (repos.txt: <name> <owner/repo> <sha> per line)
out=$1; list=$2
while read -r name repo sha; do
  d="$out/$name"; mkdir -p "$d"
  gh api "repos/$repo/git/trees/$sha?recursive=1" --jq '.tree[]|select(.type=="blob")|.path' 2>/dev/null \
    | grep -v node_modules | grep -E '\.css$|(^|/)index\.html$|tailwind\.config\.' > "$d/.files"
  while read -r p; do
    mkdir -p "$d/$(dirname "$p")"
    gh api -H 'Accept: application/vnd.github.raw' "repos/$repo/contents/$p?ref=$sha" > "$d/$p" 2>/dev/null
  done < "$d/.files"
  gh api -H 'Accept: application/vnd.github.raw' "repos/$repo/contents/package.json?ref=$sha" > "$d/package.json" 2>/dev/null || rm -f "$d/package.json"
done < "$list"
