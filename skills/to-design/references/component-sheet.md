# Native Figma coverage audit

Read when mapping a verified sheet to native component properties or auditing direct variant matrices. The source matrix and sheet evidence come from [to-preview's contract](../../to-preview/references/sheet-contract.md).

## Source-to-design mapping

| Source capability | Native representation | Review evidence |
| --- | --- | --- |
| Finite size/hierarchy/state | Variant property | Every supported tuple |
| Independent optional content | BOOLEAN bound to visibility | Every allowed placement, including both if supported |
| Arbitrary label/helper copy | TEXT bound to characters | Default and long-copy resizing |
| Arbitrary icon choice | INSTANCE_SWAP bound to nested instance | Default/alternate real icon and presence cases |
| Source theme | Variable collection modes | All supported modes for all visual tuples |
| Finite structure changes | Variant or source-defined family | Every structure/state |
| Selected/checked/open | Variant or mapped nested component | Each value and supported composites |
| Callback, ref, telemetry ID | Code-only prop | Explicitly recorded as nonvisual |

Choose properties based on actual geometry/style behavior. Loading may need a variant when it changes label visibility, spinner placement, width or disabled styling. A boolean only works when bound to the needed structure. Equivalent aliases need source mapping/evidence; visually distinct values remain separate cases.

## Checker inputs

`check_coverage.py` uses Python's standard library to compare a finite direct variant matrix with canvas readback. For partial selections, pass the approved manifest with `--selection`; the source expected file must also contain its snapshotId, familyId and independent specimen IDs/tuples/themes. It does not prove source discovery, visual fidelity, property behavior, layout, bindings or theme coverage; validate those separately.

The expected JSON is created independently by sheet/source discovery: `family`, nonempty `sources`, finite `axes` and optional evidenced `excluded` tuples. The canonical schema/example lives in the linked sheet contract. Preserve its original content rather than deriving expected tuples from created nodes.

Save `<Family>.actual.json` from direct Figma readback. Include every child using `variantProperties`, not informal captions. Example with only one illustrative row shown:

```json
{
  "fileKey": "the-real-file-key",
  "componentSetId": "12:34",
  "variants": [
    {
      "nodeId": "12:35",
      "nodeType": "COMPONENT",
      "parentId": "12:34",
      "properties": {"Hierarchy": "primary", "Size": "s", "State": "default"}
    }
  ]
}
```

Readback inside `use_figma`, after its prerequisite guidance:

```javascript
const componentSetId = "12:34"; // Replace with the actual returned ID.
const set = await figma.getNodeByIdAsync(componentSetId);
if (!set || set.type !== 'COMPONENT_SET') throw new Error('Expected component set');
return {
  componentSetId: set.id,
  variants: set.children.map(n => ({
    nodeId: n.id,
    nodeType: n.type,
    parentId: n.parent.id,
    properties: n.type === 'COMPONENT' ? n.variantProperties : null
  }))
};
```

Save the response with the actual file key from the connected target. Follow the connected executor's page-context rules when locating nodes.

```bash
python3 /absolute/path/to/to-design/scripts/check_coverage.py \
  .scratch/to-preview/Button.expected.json \
  .scratch/to-design/Button.actual.json \
  --selection .scratch/to-preview/selection-manifest.json
```

Exit `0`: every in-scope selected tuple (or full source tuple without --selection) appears exactly once as a COMPONENT in the recorded set, with unique IDs and no unexpected tuples. Exit `1`: coverage fails. Exit `2`: invalid inputs. Unsupported, duplicated or undocumented exclusions fail input validation.

For partitioned sets, audit each partition plus their global union against the original matrix. For nested representations, verify the resolved tuple-to-component/property mapping and nested instance behavior separately; this direct-set checker does not validate nested combinations.

The selected checker deduplicates native tuples across themes; separately verify all selected theme/mode mappings and visual contexts. Unknown IDs, stale snapshots, altered source tuples/themes and duplicate selected IDs fail input validation.
