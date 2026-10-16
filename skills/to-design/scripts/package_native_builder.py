#!/usr/bin/env python3
"""Package the fixed builder core with a build plan and ledger state into one use_figma package.

The package embeds plan and state as String.raw text (any "<" rebuilt at run time, see literal()) with a CHECK block of FNV-1a-32 hashes
(#17); the core verifies it before its first change. MCP-only: there is no Console/Scripter wrapper.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
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
    """The CHECK entry count: the objects the foundations slice builds, the icons, or the selected variants."""
    if plan.get("slice") == "foundations":
        return len(plan["foundations"]["variables"]) + len(plan["foundations"]["textStyles"])
    if plan.get("slice") == "icons":
        return len(plan["icons"])
    return len(plan["selection"]["entries"])


def check_selection(plan):
    selection = plan.get("selection")
    if not isinstance(selection, dict) or selection.get("schemaVersion") != 1:
        raise ValueError("Plan must embed the approved versioned selection")
    if not plan.get("snapshotId") or selection.get("snapshotId") != plan["snapshotId"]:
        raise ValueError("Selection and plan source snapshots must match")
    if not isinstance(selection.get("entries"), list) or not selection["entries"]:
        raise ValueError("Selection must contain approved specimens")
    families = selection.get("selectedFamilies")
    if not isinstance(families, list) or not families or not all(isinstance(value, str) and value.strip() for value in families) or len(families) != len(set(families)):
        raise ValueError("Selection must contain unique selected families")
    seen = set()
    for row in selection["entries"]:
        if not isinstance(row, dict) or row.get("familyId") not in families or not isinstance(row.get("properties"), dict):
            raise ValueError("Invalid selected specimen")
        key = json.dumps(row, sort_keys=True)
        if key in seen:
            raise ValueError("Selection entries must be unique")
        seen.add(key)


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


def package(core, plan, state):
    if not re.search(r"async\s+function\s+buildComponentSets\s*\(", core):
        raise ValueError("Core must declare async function buildComponentSets(figma, PLAN_SRC, STATE_SRC, CHECK)")
    if not isinstance(plan, dict) or plan.get("schemaVersion") != 1:
        raise ValueError("Build plan schemaVersion must be 1")
    if plan.get("slice") == "foundations":
        check_foundations(plan)
    elif plan.get("slice") == "icons":
        check_icons(plan)
    else:
        check_selection(plan)
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


def package_path(path):
    """Path of the package relative to the project dir, as the hook resolves it."""
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path.cwd()).resolve()
    relative = Path(os.path.relpath(path.resolve(), root)).as_posix()
    if relative == ".." or relative.startswith("../") or re.search(r"\s", relative):
        raise ValueError(f"Package path must be inside the project dir {root} and contain no whitespace: {relative}")
    return relative


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("core", type=Path)
    parser.add_argument("plan", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--state", type=Path)
    args = parser.parse_args()
    try:
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
