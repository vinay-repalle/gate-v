#!/usr/bin/env python3
"""Convert data/syllabus.txt (indented outline) into data/syllabus.json.

Usage: python3 -I scripts/build_syllabus.py <syllabus.txt> <syllabus.json>

Each node: {id, num, title, src, note, children}
  id   = stable path id (slug of titles, or a pinned {id} segment)
  num  = display number like "1.3.2"
  src  = "official" (*), "notes" (^) or "expanded" (no prefix)
"""
import json
import re
import sys
from collections import Counter


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:40].strip("-") or "x"


def parse_item(raw: str, depth: int, line_no: int) -> dict:
    """Parse a single title fragment (no '::' list) into a node dict."""
    text = raw.strip()
    src = "expanded"
    if text.startswith("*"):
        src, text = "official", text[1:].lstrip()
    elif text.startswith("^"):
        src, text = "notes", text[1:].lstrip()

    note = None
    if " ~ " in text:
        text, note = text.split(" ~ ", 1)
        note = note.strip()

    pin = None
    m = re.search(r"\s*\{([a-z0-9-]+)\}\s*$", text)
    if m:
        pin = m.group(1)
        text = text[: m.start()]

    text = text.strip()
    if not text:
        raise ValueError(f"line {line_no}: empty title")
    return {"title": text, "src": src, "note": note, "pin": pin,
            "children": [], "depth": depth, "line": line_no}


def parse(path: str):
    roots, stack = [], []
    with open(path, encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            indent = len(line) - len(line.lstrip(" "))
            if indent % 2:
                raise ValueError(f"line {line_no}: odd indentation")
            depth = indent // 2
            if depth > len(stack):
                raise ValueError(f"line {line_no}: indentation jumps a level")

            head, _, leaves = line.strip().partition(" :: ")
            node = parse_item(head, depth, line_no)
            if leaves:
                for part in leaves.split(" | "):
                    node["children"].append(parse_item(part, depth + 1, line_no))

            del stack[depth:]
            if depth == 0:
                roots.append(node)
            else:
                stack[depth - 1]["children"].append(node)
            stack.append(node)
    return roots


def finish(nodes, parent_id="", parent_num=""):
    """Assign ids / numbers, drop helper keys."""
    seen = Counter()
    out = []
    for i, n in enumerate(nodes, 1):
        seg = n["pin"] or slug(n["title"])
        seen[seg] += 1
        if seen[seg] > 1:
            seg = f"{seg}-{seen[seg]}"
        nid = f"{parent_id}.{seg}" if parent_id else seg
        num = f"{parent_num}.{i}" if parent_num else str(i)
        node = {"id": nid, "num": num, "title": n["title"], "src": n["src"]}
        if n["note"]:
            node["note"] = n["note"]
        kids = finish(n["children"], nid, num)
        if kids:
            node["children"] = kids
        out.append(node)
    return out


def walk(nodes, depth=1):
    for n in nodes:
        yield n, depth
        yield from walk(n.get("children", []), depth + 1)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src_path, out_path = sys.argv[1], sys.argv[2]
    tree = finish(parse(src_path))

    ids = [n["id"] for n, _ in walk(tree)]
    dupes = [k for k, v in Counter(ids).items() if v > 1]
    if dupes:
        sys.exit(f"duplicate ids: {dupes[:10]}")

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(tree, fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    leaves = sum(1 for n, _ in walk(tree) if not n.get("children"))
    max_depth = max(d for _, d in walk(tree))
    by_src = Counter(n["src"] for n, _ in walk(tree))
    print(f"nodes={len(ids)} leaves={leaves} max_depth={max_depth} src={dict(by_src)}")
    for s in tree:
        cnt = sum(1 for _ in walk([s]))
        deepest = max(d for _, d in walk([s]))
        print(f"  {s['num']:>2} {s['title'][:45]:<45} nodes={cnt:<4} depth={deepest}")


if __name__ == "__main__":
    main()
