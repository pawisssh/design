#!/usr/bin/env python3
"""Package the fixed builder core with a build plan and ledger state into one use_figma package.

The package embeds plan and state as String.raw text (any "<" rebuilt at run time, see literal()) with a CHECK block of FNV-1a-32 hashes
(#17); the core verifies it before its first change. The package runs only in use_figma.
The output is a directory (build-components.mcp.js and script-package.json go in it); a .js path is refused.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

CORE_START = "async function buildComponentSets"


def fnv1a32(text):
    """FNV-1a-32 over the char codes of ASCII text, as the core computes it with charCodeAt."""
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def core_source(core):
    """What buildComponentSets.toString() returns: the function, from its declaration to the end of the file."""
    if not core.isascii():
        raise ValueError("Core must be ASCII, so its FNV-1a-32 hash is the same in Python and in the core")
    start = core.find(CORE_START)
    if start < 0:
        raise ValueError("Core must declare async function buildComponentSets(figma, PLAN_SRC, STATE_SRC, CHECK)")
    for line in core[:start].splitlines():
        if line.strip() and not line.strip().startswith("//"):
            raise ValueError("Only // comment lines may precede buildComponentSets; other code would escape the core hash")
    return core[start:].rstrip()


def _word(ch):
    return ch.isalnum() or ch in "_$"


def squeeze(line):
    """One line of core code with the spaces it does not need dropped: a space stays only between two word
    characters (`return x`), between two of + and - (`a - -b`) and after < (`i < s`). Strings and template literals are copied unchanged; a
    trailing // comment is dropped. Fails closed on what a line-wise scan cannot read safely: a string that does
    not end on its line, a block comment, and a regex literal (a / where an operand starts)."""
    out, i, n, last = [], 0, len(line), ""
    while i < n:
        ch = line[i]
        if ch in "'\"`":
            j = i + 1
            while j < n and line[j] != ch:
                j += 2 if line[j] == "\\" else 1
            if j >= n:
                raise ValueError(f"Core holds a string or template literal that spans lines; compaction would change it: {line.strip()!r}")
            out.append(line[i:j + 1])
            i, last = j + 1, ch
            continue
        if ch == "/" and line[i + 1:i + 2] == "/":
            break
        if ch == "/" and line[i + 1:i + 2] == "*":
            raise ValueError(f"Core must use // comments only: {line.strip()!r}")
        if ch == "/":
            before = "".join(out).rstrip()
            if not before or before[-1] in "(,=:[!&|?{};+-*%~^" or re.search(r"\b(return|typeof|case|in|of)$", before):
                raise ValueError(f"Core must not hold a regex literal; compaction cannot read one: {line.strip()!r}")
        if ch in " \t":
            j = i
            while j < n and line[j] in " \t":
                j += 1
            nxt = line[j] if j < n else ""
            # after "<" too: "i<s" would spell markup (see MARKUP)
            if last and nxt and ((_word(last) and _word(nxt)) or (last in "+-" and nxt in "+-") or last == "<"):
                out.append(" ")
                last = " "
            i = j
            continue
        out.append(ch)
        i, last = i + 1, ch
    return "".join(out).strip()


def compact(core):
    """The core as packaged, so the components core fits use_figma's 50,000 chars next to a batch plan: blank
    lines, // comments, indentation and the spaces around punctuation dropped (see squeeze). Line breaks stay, so
    automatic semicolons fall where they did and the code means the same; the CHECK core hash is over this text."""
    lines = []
    for line in core.splitlines():
        text = squeeze(line)
        if text:
            lines.append(text)
    return "\n".join(lines) + "\n"


def embeddable(name, text):
    """Text that String.raw carries unchanged."""
    if "`" in text or "${" in text or not text.isascii():
        raise ValueError(f"{name} text must not contain a backtick, ${{ or non-ASCII")
    return text


# use_figma transpiles a script whose string values hold markup-like text ("<svg", "<p", even spelled
# as the escape "\u003csvg"), and that rewrites buildComponentSets.toString(), so the core hash no longer matches (#30).
# The package therefore never spells "<": a text holding one is emitted as String.raw pieces joined
# with String.fromCharCode(60), which rebuilds the exact text at run time.
MARKUP = re.compile(r"<[A-Za-z/!?]|\\u003c|\\x3c|\\u\{0*3c\}", re.IGNORECASE)


def literal(text):
    """A JS expression whose value is `text` and whose source spells no "<"."""
    return "[" + ",".join(f"String.raw`{part}`" for part in text.split("<")) + "].join(String.fromCharCode(60))" if "<" in text else f"String.raw`{text}`"


def plan_entries(plan):
    """The CHECK entry count: the objects the foundations slice builds, the icons, one Base Component, or the batch's variants."""
    if plan.get("slice") == "base":
        return 1
    if plan.get("slice") == "foundations":
        return len(plan["foundations"]["variables"]) + len(plan["foundations"]["textStyles"])
    if plan.get("slice") == "icons":
        return len(plan["icons"])
    return len(plan["selection"]["entries"])


def check_sets(plan):
    for field in ("fileKey", "page", "family", "set", "templates", "tree", "props", "P", "frags", "selection", "total"):
        if field not in plan:
            raise ValueError(f"Sets plan needs {field}")
    if not plan.get("snapshotId") or not str(plan.get("contentHash", "")).startswith("sha256:"):
        raise ValueError("Sets plan must carry the approved Contract's snapshotId and contentHash")
    options = plan.get("options") or {}
    mode = options.get("mode", "build")
    selection = plan["selection"]
    axes = selection.get("axes") if isinstance(selection, dict) else None
    entries = selection.get("entries") if isinstance(selection, dict) else None
    if selection.get("schemaVersion") != 1 or not isinstance(axes, list) or not axes or not isinstance(entries, list):
        raise ValueError("Sets plan selection must be versioned axis-ordered tuples")
    # an append that picks no variant (setsPlan indexes []) updates the set alone: its name, properties and grid
    set_only = mode == "build" and options.get("phase") == "append" and options.get("picked") == 0
    if not entries and mode in ("build", "reconcile", "sample", "theme") and not set_only:
        raise ValueError(f"A {mode} plan must select variants")
    seen = set()
    for e in entries:
        if not isinstance(e, list) or not all(isinstance(x, int) and x >= 0 for x in e) or len(e) < len(axes) + 1:
            raise ValueError("Sets plan entries must be lists of indexes")
        if e[0] in seen or e[0] >= plan["total"]:
            raise ValueError("Sets plan entries must hold unique expansion indexes below total")
        seen.add(e[0])
        if mode != "reconcile" and (str(e[len(axes) + 1]) not in plan["P"] or any(str(f) not in plan["frags"] for f in e[len(axes) + 2:])):
            raise ValueError(f"Sets plan entry {e[0]} names a wiring or fragment the plan does not carry")


def check_foundations(plan):
    f = plan.get("foundations")
    if not isinstance(f, dict) or not isinstance(f.get("collections"), list) or not isinstance(f.get("variables"), dict) or not isinstance(f.get("textStyles"), dict):
        raise ValueError("Foundations plan must carry collections, variables and textStyles")
    if not plan.get("fileKey") or not plan.get("documentHash"):
        raise ValueError("Foundations plan must name its fileKey and documentHash")


def check_icons(plan):
    icons = plan.get("icons")
    if not plan.get("fileKey") or not plan.get("page") or not isinstance(icons, list):
        raise ValueError("Icons plan must name its fileKey and page and carry an icons list")
    keys = [icon.get("key") for icon in icons if isinstance(icon, dict)]
    if len(keys) != len(icons) or len(set(keys)) != len(keys):
        raise ValueError("Icons plan entries must have unique keys")
    for icon in icons:
        if not all(isinstance(icon.get(field), str) and icon[field] for field in ("key", "name", "file", "svg", "sha256")):
            raise ValueError(f"Icon {icon.get('key')} needs key, name, file, svg and sha256")


def check_base(plan):
    base = plan.get("base")
    if not plan.get("fileKey") or not plan.get("page") or not plan.get("family") or not isinstance(base, dict):
        raise ValueError("Base plan must name its fileKey, page and family and carry a base spec")
    for field in ("name", "tree", "layout", "paint", "visible", "text", "swap", "fonts"):
        if field not in base:
            raise ValueError(f"Base spec needs {field}")
    if not plan.get("snapshotId") or not str(plan.get("contentHash", "")).startswith("sha256:"):
        raise ValueError("Base plan must carry the Contract's snapshotId and contentHash")


def package(core, plan, state):
    if not re.search(r"async\s+function\s+buildComponentSets\s*\(", core):
        raise ValueError("Core must declare async function buildComponentSets(figma, PLAN_SRC, STATE_SRC, CHECK)")
    if not isinstance(plan, dict) or plan.get("schemaVersion") != 1:
        raise ValueError("Build plan schemaVersion must be 1")
    if plan.get("slice") == "foundations":
        check_foundations(plan)
    elif plan.get("slice") == "icons":
        check_icons(plan)
    elif plan.get("slice") == "base":
        check_base(plan)
    elif plan.get("slice") == "sets":
        check_sets(plan)
    else:
        raise ValueError(f"Plan slice must be one of foundations, icons, base, sets; got {plan.get('slice')!r}")
    # Markup-like text in a comment fails closed too, though compaction drops the comment.
    found = MARKUP.search(core)
    if found:
        raise ValueError(f"Core spells markup-like text {found.group(0)!r}: {core[max(0, found.start() - 30):found.end() + 30]!r}")
    core_source(core)  # ASCII, and nothing outside the function, before compaction reads it
    core = compact(core)
    if not isinstance(state, dict):
        raise ValueError("State must be an object")
    if state.get("fileKey") and plan.get("fileKey") and state["fileKey"] != plan["fileKey"]:
        raise ValueError("State fileKey does not match the build target")
    # Compact, ASCII-escaped JSON: every char is one byte, so FNV-1a-32 here agrees with the core's charCodeAt loop.
    plan_src = embeddable("Plan", json.dumps(plan, ensure_ascii=True, sort_keys=True, separators=(",", ":")))
    state_src = embeddable("State", json.dumps(state, ensure_ascii=True, sort_keys=True, separators=(",", ":")))
    check = {"planLen": len(plan_src), "entries": plan_entries(plan), "plan": fnv1a32(plan_src), "state": fnv1a32(state_src), "core": fnv1a32(core_source(core))}
    identity = hashlib.sha256((core + plan_src + state_src).encode()).hexdigest()
    mcp = (
        f"// Native build package: {identity}\n{core.rstrip()}\n"
        f"const PLAN_SRC = {literal(plan_src)};\n"
        f"const STATE_SRC = {literal(state_src)};\n"
        f"const CHECK = {json.dumps(check, separators=(',', ':'))};\n"
        "return await buildComponentSets(figma, PLAN_SRC, STATE_SRC, CHECK);\n"
    )
    # Data comes through literal(); markup-like text anywhere else (a core comment or string) fails closed.
    found = MARKUP.search(mcp)
    if found:
        raise ValueError(f"Package spells markup-like text {found.group(0)!r}, which makes use_figma rewrite the core: "
                         f"{mcp[max(0, found.start() - 30):found.end() + 30]!r}")
    return mcp, check, identity


def main_working_tree(directory):
    """The main working tree of the git repository holding `directory`, or None outside git. The desktop host loads
    project hooks and sets CLAUDE_PROJECT_DIR from the main working tree, also for a session in a worktree (#26)."""
    try:
        common = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=directory,
                                capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    common = Path(common)
    return common.parent.resolve() if common.name == ".git" else None


def package_path(path):
    """Path of the package relative to the project dir, as the hook resolves it: the main working tree when the
    package sits in a git repository (so a worktree's package reads .claude/worktrees/<wt>/.scratch/...), else
    CLAUDE_PROJECT_DIR or the current directory."""
    existing = path.parent.resolve()
    while not existing.exists():
        existing = existing.parent
    main_tree = main_working_tree(existing)
    root = main_tree or Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path.cwd()).resolve()
    relative = Path(os.path.relpath(path.resolve(), root)).as_posix()
    if relative == ".." or relative.startswith("../"):
        if main_tree:
            raise ValueError(f"Package path must be inside the main working tree {root}, where the hook resolves it; "
                             f"write the package there (a worktree under it works): {relative}")
        raise ValueError(f"Package path must be inside the project dir {root}: {relative}")
    if re.search(r"\s", relative):
        raise ValueError(f"Package path must contain no whitespace: {relative}")
    return relative


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("core", type=Path)
    parser.add_argument("plan", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--state", type=Path)
    args = parser.parse_args()
    try:
        if args.output.suffix == ".js":
            raise ValueError(f"output is a directory, and the package goes in {args.output}/build-components.mcp.js: got a .js path")
        core = args.core.read_text()
        plan = json.loads(args.plan.read_text())
        state = json.loads(args.state.read_text()) if args.state else {}
        mcp, check, identity = package(core, plan, state)
        mcp_path = args.output / "build-components.mcp.js"
        stub_path = package_path(mcp_path)
        mcp_bytes = mcp.encode()
        file_sha = hashlib.sha256(mcp_bytes).hexdigest()
        args.output.mkdir(parents=True, exist_ok=True)
        mcp_path.write_bytes(mcp_bytes)
        (args.output / "script-package.json").write_text(json.dumps({"schemaVersion": 1, "inputHash": identity, "fileSha256": file_sha, "snapshotId": plan.get("snapshotId"), "check": check, "execution": "not-run", "files": ["build-components.mcp.js"]}, indent=2))
    except (OSError, ValueError, TypeError, KeyError) as error:
        print(json.dumps({"status": "invalid-input", "error": str(error)}))
        return 2
    # chars counts UTF-16 units, as the hook checks use_figma's 50,000 limit.
    # The use_figma package hook swaps this stub for the verified file (see hooks/use-figma-package.mjs).
    stub = f'/*@package {stub_path} sha256={file_sha}*/ throw new Error("package not injected");'
    print(json.dumps({"status": "packaged", "inputHash": identity, "fileSha256": file_sha, "chars": len(mcp.encode("utf-16-le")) // 2, "check": check, "output": str(args.output), "execution": "not-run", "stub": stub}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
