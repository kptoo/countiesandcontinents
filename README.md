# Kenya Counties × World Continents

An interactive Leaflet map showing Kenya's 47 counties and the world's continents
as two independent, toggleable layers with click-to-highlight and detail panels.

## Architecture

**Stack:** plain HTML + CSS + vanilla JS, [Leaflet.js](https://leafletjs.com) for the
map engine. No build step, no framework, no bundler — this is deliberate:
GitHub Pages serves static files as-is, so anything that needs `npm run build`
is one more thing that can go stale or break in CI. Leaflet is loaded from a
CDN (unpkg) so there's nothing to install to run this locally.

```
kenya-continents-map/
├── index.html          # page shell, panel markup, CDN + local asset links
├── css/
│   └── style.css        # all styling (theme, panels, responsive rules)
├── js/
│   └── app.js            # map init, layer loading, interaction logic
├── data/
│   ├── kenya_counties.geojson     # 47 counties, simplified (~170 KB)
│   └── world_continents.geojson   # 8 continents, simplified (~75 KB)
└── README.md
```

Why this split: `data/` is separate from `js/` so you can swap in a newer
source file without touching any code, and a browser caches the geometry
independently of your logic. Everything is fetched at runtime with
`fetch()` + `Promise.all()`, so both layers load in parallel.

### Why the data was simplified

Your originals were **7.6 MB** (183k coordinate points across 47 county
polygons) and **6.3 MB** (179k points across 8 continent polygons) — several
orders of magnitude more detail than a web map needs; at that density the
browser has to parse and render vertices you'd never see at any reasonable
zoom level, and 14 MB of JSON is a slow first load on GitHub Pages. I ran
both through [mapshaper](https://github.com/mapshaper/mapshaper)'s
topology-preserving (Visvalingam) simplifier and rounded coordinate
precision to ~11 m, which shares boundaries between adjacent polygons so
they still line up edge-to-edge:

| File | Original | Simplified | Points |
|---|---|---|---|
| Kenya counties | 7.6 MB | **173 KB** | 183k → ~9k |
| World continents | 6.3 MB | **77 KB** | 179k → ~4k |

Non-essential fields (`OBJECTID`, `FID`, `PERIMETER`, `AREA`, `SQMI`) were
dropped too, keeping just the name and area used by the UI. If you need the
full-resolution originals for GIS analysis later, keep them outside this
repo (or in a separate `data/raw/` folder that you `.gitignore`) — they add
nothing at web-map scale but would slow down every clone and page load.

### Layer stacking and click behavior

Leaflet panes are used to explicitly stack `countiesPane` above
`continentsPane`. Because Kenya's counties sit geographically inside the
Africa continent polygon, a click there could in principle hit both shapes —
panes plus `L.DomEvent.stopPropagation` ensure a click always resolves to
whichever shape is on top (the county), not both at once, so only one
feature is ever "selected." That selection is layer-agnostic: clicking a
continent elsewhere on the globe behaves the same way, with its own panel
and highlight color.

### Layer toggles

The two checkboxes in the top-left panel are independent (not radio
buttons), so you can show counties only, continents only, both together, or
neither — `map.addLayer()` / `map.removeLayer()` per checkbox, no shared
state beyond "is this layer currently on the map."

## Running locally

Because `app.js` loads the GeoJSON with `fetch()`, opening `index.html`
directly via `file://` will fail in most browsers (blocked by CORS on local
files). Serve the folder instead:

```bash
# Python (already on most systems)
python3 -m http.server 8000

# or Node
npx serve .
```

Then visit `http://localhost:8000`.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repo (root of the repo, or a `docs/` folder
   — either works).
2. In the repo: **Settings → Pages → Build and deployment → Source** = *Deploy
   from a branch*, pick `main` and `/ (root)` (or `/docs`).
3. Your map will be live at `https://<username>.github.io/<repo-name>/`
   within a minute or two.

No secrets, API keys, or server code are involved anywhere in this project.

## Customizing

- **Colors / fonts** — everything is a CSS custom property at the top of
  `css/style.css` (`--counties`, `--continents`, `--highlight`, fonts).
- **Basemap** — swapped by changing the `L.tileLayer` URL in `app.js`; any
  [CARTO](https://carto.com/basemaps) or other XYZ tile source works without
  an API key.
- **Stats shown per feature** — edit the `rows` arrays passed to
  `selectFeature()` in `js/app.js` (currently just area; county/continent
  name is already available on `feature.properties` if you want to add more
  fields back into the simplified GeoJSON).
- **Add a third layer** — follow the pattern of `countiesLayer` /
  `continentsLayer`: a new pane, a style function, an `onEachFeature`
  handler, a checkbox in `index.html`, and a `wireToggle()` call.

## Data sources & attribution

The source files' field names (`OBJECTID`, `Shape_Area`, `FID`, `SQMI`)
suggest an Esri/ArcGIS Hub origin. Add the specific source and license you
pulled these from to this section before publishing — that's normal practice
for boundary datasets and something clients on Upwork will often ask about.
