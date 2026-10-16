#!/usr/bin/env python3
"""Package one shared native Figma builder into MCP and Console/Scripter JS."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys


def package(core, plan, state):
    if not re.search(r"async\s+function\s+buildComponentSets\s*\(", core):
        raise ValueError("Core must declare async function buildComponentSets(figma, plan, state)")
    if not isinstance(plan, dict) or plan.get("schemaVersion") != 1:
        raise ValueError("Build plan schemaVersion must be 1")
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
    for row in selection["entries"]:
        if not isinstance(row, dict) or row.get("familyId") not in families or not isinstance(row.get("properties"), dict):
            raise ValueError("Invalid selected specimen")
    if not isinstance(state, dict):
        raise ValueError("State must be an object")
    if state.get("fileKey") and plan.get("fileKey") and state["fileKey"] != plan["fileKey"]:
        raise ValueError("State fileKey does not match the build target")
    encoded_plan = json.dumps(plan, ensure_ascii=True, sort_keys=True)
    encoded_state = json.dumps(state, ensure_ascii=True, sort_keys=True)
    identity = hashlib.sha256((core + encoded_plan + encoded_state).encode()).hexdigest()
    common = f"// Native build package: {identity}\n{core}\nconst BUILD_PLAN = {encoded_plan};\nconst BUILD_STATE = {encoded_state};\n"
    mcp = common + "return await buildComponentSets(figma, BUILD_PLAN, BUILD_STATE);\n"
    standalone = "(async () => {\n" + common + "  const result = await buildComponentSets(figma, BUILD_PLAN, BUILD_STATE);\n  console.log(JSON.stringify(result, null, 2));\n  return result;\n})().catch(error => { console.error(error); throw error; });\n"
    return mcp, standalone, identity


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
        mcp, standalone, identity = package(core, plan, state)
        mcp_path = args.output / "build-components.mcp.js"
        stub_path = package_path(mcp_path)
        mcp_bytes = mcp.encode()
        file_sha = hashlib.sha256(mcp_bytes).hexdigest()
        args.output.mkdir(parents=True, exist_ok=True)
        mcp_path.write_bytes(mcp_bytes)
        (args.output / "build-components.js").write_text(standalone)
        (args.output / "script-package.json").write_text(json.dumps({"schemaVersion": 1, "inputHash": identity, "fileSha256": file_sha, "snapshotId": plan["snapshotId"], "execution": "not-run", "files": ["build-components.mcp.js", "build-components.js"]}, indent=2))
    except (OSError, ValueError, TypeError) as error:
        print(json.dumps({"status": "invalid-input", "error": str(error)}))
        return 2
    # The use_figma package hook swaps this stub for the verified file (see hooks/use-figma-package.mjs).
    stub = f'/*@package {stub_path} sha256={file_sha}*/ throw new Error("package not injected");'
    print(json.dumps({"status": "packaged", "inputHash": identity, "fileSha256": file_sha, "chars": len(mcp), "output": str(args.output), "execution": "not-run", "stub": stub}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
