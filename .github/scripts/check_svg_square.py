#!/usr/bin/env python3
"""Print WxH for an SVG file (from width/height or viewBox). Exit 1 if unparseable."""
import re
import sys

with open(sys.argv[1]) as f:
    s = f.read()
w = re.search(r'<svg[^>]*\swidth=["\']([0-9.]+)', s)
h = re.search(r'<svg[^>]*\sheight=["\']([0-9.]+)', s)
if w and h:
    print(f"{w.group(1)}x{h.group(1)}")
else:
    vb = re.search(r'viewBox="([^"]+)"', s)
    if vb:
        parts = vb.group(1).split()
        if len(parts) >= 4:
            print(f"{parts[2]}x{parts[3]}")
        else:
            sys.exit(1)
    else:
        sys.exit(1)
