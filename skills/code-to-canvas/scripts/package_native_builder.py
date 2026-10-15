#!/usr/bin/env python3
"""Package one shared native Figma builder into MCP and Console/Scripter JS."""
import argparse
import hashlib
import json
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
    seen = set()
    for row in selection["entries"]:
        if not isinstance(row, dict) or row.get("familyId") not in families or not isinstance(row.get("properties"), dict) or not isinstance(row.get("themeId"), str) or not row["themeId"]:
            raise ValueError("Invalid selected specimen")
        identifier = row.get("specimenId")
        if not isinstance(identifier, str) or not identifier or identifier in seen:
            raise ValueError("Selection specimen IDs must be unique and nonempty")
        seen.add(identifier)
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
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / "build-components.mcp.js").write_text(mcp)
        (args.output / "build-components.js").write_text(standalone)
        (args.output / "script-package.json").write_text(json.dumps({"schemaVersion": 1, "inputHash": identity, "snapshotId": plan["snapshotId"], "execution": "not-run", "files": ["build-components.mcp.js", "build-components.js"]}, indent=2))
    except (OSError, ValueError, TypeError) as error:
        print(json.dumps({"status": "invalid-input", "error": str(error)}))
        return 2
    print(json.dumps({"status": "packaged", "inputHash": identity, "output": str(args.output), "execution": "not-run"}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
