#!/usr/bin/env python3
"""Compare source-derived visual axes with native Figma component readback."""

import argparse
from collections import Counter
import itertools
import json
from pathlib import Path
import sys


def require(condition, message):
    if not condition:
        raise ValueError(message)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def compare(expected, actual, selection=None):
    require(isinstance(expected, dict), "Expected input must be an object")
    require(isinstance(actual, dict), "Actual input must be an object")
    require(nonempty(expected.get("family")), "family must be a nonempty string")
    sources = expected.get("sources")
    require(isinstance(sources, list) and sources and all(map(nonempty, sources)),
            "sources must contain source references")
    axes = expected.get("axes")
    require(isinstance(axes, dict), "axes must be an object (empty for a single structural variant)")
    for name, values in axes.items():
        require(nonempty(name), "Axis names must be nonempty strings")
        require(isinstance(values, list) and values and all(map(nonempty, values)),
                f"{name}: values must be nonempty strings")
        require(len(values) == len(set(values)), f"{name}: duplicate axis values")
    names = tuple(axes)

    def key(properties):
        require(isinstance(properties, dict) and set(properties) == set(names),
                "Tuple properties must match the expected axis names exactly")
        require(all(nonempty(properties[name]) for name in names),
                "Tuple property values must be nonempty strings")
        return tuple(properties[name] for name in names)

    domain = set(itertools.product(*(axes[name] for name in names)))
    exclusions = expected.get("excluded", [])
    require(isinstance(exclusions, list), "excluded must be a list")
    excluded = set()
    for item in exclusions:
        require(isinstance(item, dict), "Each exclusion must be an object")
        require(nonempty(item.get("reason")) and nonempty(item.get("evidence")),
                "Each exclusion needs a reason and source evidence")
        values = key(item.get("values"))
        require(values in domain, "Exclusion is outside the source axis domain")
        require(values not in excluded, "Duplicate exclusion")
        excluded.add(values)
    wanted = domain - excluded
    require(bool(wanted), "Expected matrix has no supported tuples")

    selected_themes = []
    selected_specimen_count = None
    if selection is not None:
        require(isinstance(selection, dict) and selection.get("schemaVersion") == 1,
                "Selection schemaVersion must be 1")
        require(nonempty(expected.get("snapshotId")) and selection.get("snapshotId") == expected["snapshotId"],
                "Selection source snapshot does not match expected coverage")
        family_id = expected.get("familyId")
        require(nonempty(family_id), "Partial selection requires expected familyId")
        require(isinstance(selection.get("selectedFamilies"), list) and family_id in selection["selectedFamilies"],
                "Family is not selected")
        require(isinstance(selection.get("entries"), list), "Selection entries must be a list")
        source_rows = expected.get("specimens")
        require(isinstance(source_rows, list), "Selection audit needs independent source specimens")
        source_by_id = {}
        for row in source_rows:
            require(isinstance(row, dict) and nonempty(row.get("id")) and nonempty(row.get("themeId")),
                    "Source specimens require id, themeId and properties")
            require(row["id"] not in source_by_id, "Duplicate source specimen ID")
            require(key(row.get("properties")) in wanted, "Source specimen tuple is unsupported")
            source_by_id[row["id"]] = row
        selected = set()
        seen_ids = set()
        rows_for_family = []
        for row in selection["entries"]:
            require(isinstance(row, dict), "Selection entries must be objects")
            if row.get("familyId") != family_id:
                continue
            identifier = row.get("specimenId")
            require(nonempty(identifier) and identifier in source_by_id, "Unknown selected specimen ID")
            require(identifier not in seen_ids, "Duplicate selected specimen ID")
            seen_ids.add(identifier)
            source = source_by_id[identifier]
            values = key(row.get("properties"))
            require(values == key(source["properties"]) and row.get("themeId") == source["themeId"],
                    "Selected specimen properties/theme do not match source")
            selected.add(values)
            rows_for_family.append(row)
        require(bool(selected), "Family has no selected specimens")
        wanted = selected
        selected_specimen_count = len(rows_for_family)
        selected_themes = sorted({row["themeId"] for row in rows_for_family})

    require(nonempty(actual.get("fileKey")), "fileKey must be a nonempty string")
    set_id = actual.get("componentSetId")
    require(nonempty(set_id), "componentSetId must be a nonempty string")
    rows = actual.get("variants")
    require(isinstance(rows, list), "variants must contain the complete readback list")
    seen = Counter()
    node_ids = Counter()
    structure_errors = []
    for index, row in enumerate(rows):
        require(isinstance(row, dict), f"Variant {index} must be an object")
        node_id = row.get("nodeId")
        require(nonempty(node_id), f"Variant {index} needs a nodeId")
        node_ids[node_id] += 1
        if row.get("nodeType") != "COMPONENT":
            structure_errors.append(f"{node_id}: expected COMPONENT")
            continue
        if row.get("parentId") != set_id:
            structure_errors.append(f"{node_id}: not a child of {set_id}")
            continue
        seen[key(row.get("properties"))] += 1

    def tuples(items):
        return [dict(zip(names, values)) for values in sorted(items)]

    missing = wanted - set(seen)
    unexpected = set(seen) - wanted
    duplicate_tuples = {values for values, count in seen.items() if count > 1}
    duplicate_ids = sorted(node_id for node_id, count in node_ids.items() if count > 1)
    passed = not (missing or unexpected or duplicate_tuples or duplicate_ids or structure_errors)
    return {
        "status": "passed" if passed else "failed",
        "family": expected["family"],
        "scope": "selected" if selection is not None else "complete",
        "selectedSpecimenCount": selected_specimen_count,
        "selectedThemes": selected_themes,
        "expectedCount": len(wanted),
        "excludedCount": len(excluded),
        "readbackCount": len(rows),
        "matchedUniqueCount": len(wanted & set(seen)),
        "missing": tuples(missing),
        "unexpected": tuples(unexpected),
        "duplicateTuples": tuples(duplicate_tuples),
        "duplicateNodeIds": duplicate_ids,
        "structureErrors": structure_errors,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("expected", type=Path)
    parser.add_argument("actual", type=Path)
    parser.add_argument("--selection", type=Path, help="Approved selection manifest for partial scope")
    args = parser.parse_args()
    try:
        result = compare(json.loads(args.expected.read_text()),
                         json.loads(args.actual.read_text()),
                         json.loads(args.selection.read_text()) if args.selection else None)
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "invalid-input", "error": str(error)}, ensure_ascii=False))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
