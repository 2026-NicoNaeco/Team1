"""조각으로 받은 OSM XML 을 하나로 합친다. 경계에 걸친 도로·노드·회전 금지는 여러 조각에 겹쳐 들어 있어 id 로 한 번만 남긴다.

    python scripts/merge_osm_tiles.py 출력.osm tile_1.osm tile_2.osm ...
"""

import sys
import xml.etree.ElementTree as ET

out_path, *inputs = sys.argv[1:]
seen: dict[str, dict[str, ET.Element]] = {"node": {}, "way": {}, "relation": {}}
for path in inputs:
    root = ET.parse(path).getroot()
    for kind, bucket in seen.items():
        for el in root.iter(kind):
            bucket.setdefault(el.get("id"), el)
    print(f"{path}: 누적 노드 {len(seen['node'])}, 도로 {len(seen['way'])}, 관계 {len(seen['relation'])}")

merged = ET.Element("osm", version="0.6", generator="merge_tiles")
for kind in ("node", "way", "relation"):
    merged.extend(seen[kind].values())
ET.ElementTree(merged).write(out_path, encoding="utf-8", xml_declaration=True)
print(f"합침: {out_path}")
