# GATE 2027 ECE tracker

Syllabus tree + progress tracker. Static site in `public/` (no build tools).

## Run locally
```
cd public && python3 -m http.server 8765
# open http://127.0.0.1:8765
```

## Edit the syllabus
1. Edit `data/syllabus.txt` (format explained at the top of the file).
2. Rebuild: `python3 -I scripts/build_syllabus.py data/syllabus.txt public/syllabus.json`
3. Pin a topic's id with `{some-id}` before renaming its title, so saved progress stays attached.

## Layout
- `public/index.html`, `style.css`, `app.js` — the UI
- `public/store.js` — storage layer (currently browser-only; Firebase sync + PIN login comes next)
- `source/EC_GATE2027_Syllabus.pdf` — official syllabus used as the source
