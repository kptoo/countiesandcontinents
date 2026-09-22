/* Kenya Counties x World Continents — Leaflet (2D) + MapLibre (3D globe)
 * No build step. Everything below runs as plain ES2017 in the browser.
 *
 * Two independent map engines are created up front and kept alive the whole
 * time; switching views just toggles which one is visible (see #view-toggle
 * below), so neither one has to reload data or lose its camera position.
 * Both stay in sync through one shared selection model (selectedType /
 * selectedName) rather than either engine owning "what's selected".
 */

const DATA_URLS = {
  counties: "data/kenya_counties.geojson",
  continents: "data/world_continents.geojson"
};

// CARTO now requires a free API key on basemap tile requests (since Aug 2026).
// Get one at https://carto.com/basemaps/apikey — free tier covers 5M tile
// requests/month, no account needed. This key isn't a secret (it's served to
// every visitor in the page source either way) — it just identifies your
// usage against the free quota, so it's fine to commit as-is. The 3D globe
// below needs no key at all — it has no basemap tiles, just our own data.
const CARTO_API_KEY = "PASTE_YOUR_CARTO_API_KEY_HERE";

// Some browsers restore checkbox states from history on a reload without
// firing a "change" event (e.g. after using the browser's back button or a
// simple refresh). That can leave a checkbox showing unchecked while the
// layer it controls is still on the map from the initial load below. Force
// both to a known state up front so the checkboxes and the map always agree.
document.getElementById("toggle-counties").checked = true;
document.getElementById("toggle-continents").checked = true;

const COLORS = {
  counties: "#E0A458",
  continents: "#5B8FC7",
  highlight: "#F2C744",
  hover: "#EDE7D9"
};

// ---------------------------------------------------------------
// 2D map (Leaflet)
// ---------------------------------------------------------------

const map = L.map("map", {
  zoomControl: false,
  worldCopyJump: true,
  minZoom: 2,
  maxZoom: 10
}).setView([0, 22], 3);

L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer(`https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`, {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
    '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19
}).addTo(map);

// Two panes so Kenya's counties always draw above the continent fills,
// and so a click on a county never also triggers the continent below it.
map.createPane("continentsPane");
map.getPane("continentsPane").style.zIndex = 350;
map.createPane("countiesPane");
map.getPane("countiesPane").style.zIndex = 400;

// ---------------------------------------------------------------
// 3D globe (MapLibre GL JS)
// ---------------------------------------------------------------
// The globe has no basemap tiles at all — just a dark background and our
// own two GeoJSON layers, which double as its "land". That keeps it fully
// self-contained: no extra API key, no extra network requests.

const globeMap = new maplibregl.Map({
  container: "globe",
  style: {
    version: 8,
    // Setting it here as well as belt-and-suspenders: the style spec itself
    // supports a top-level "projection" key, so the globe is already a
    // sphere on the very first frame rather than starting flat and
    // switching over once setProjection() below runs.
    projection: { type: "globe" },
    sources: {},
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#050A08" } }
    ]
  },
  center: [20, 5],
  zoom: 1.4,
  minZoom: 0.4,
  maxZoom: 8,
  attributionControl: false,
  canvasContextAttributes: { antialias: true }
});
globeMap.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");

// The actual, load-bearing way to turn this into a sphere: MapLibre reads
// projection from the style spec or from this runtime call, NOT from a
// plain constructor option — a "projection" key passed alongside "style"
// in the Map() options above is simply ignored, which was the bug in the
// previous version of this file (it quietly rendered as a flat Mercator
// map instead of a globe).
globeMap.on("load", () => {
  globeMap.setProjection({ type: "globe" });

  // Atmosphere glow around the globe's limb. Purely decorative, so if this
  // ever throws on some future/older MapLibre version, the globe still
  // works fine without it.
  try {
    globeMap.setFog({
      range: [0.5, 10],
      color: "rgba(143,163,154,0.15)",
      "high-color": "#1B2A24",
      "space-color": "#050A08",
      "horizon-blend": 0.2,
      "star-intensity": 0.25
    });
  } catch (err) {
    /* fog is a visual nicety, not critical */
  }
});

// ---------------------------------------------------------------
// Styles (2D)
// ---------------------------------------------------------------

function countyStyle() {
  return { color: COLORS.counties, weight: 1.2, fillColor: COLORS.counties, fillOpacity: 0.18, opacity: 0.9 };
}
function continentStyle() {
  return { color: COLORS.continents, weight: 1, fillColor: COLORS.continents, fillOpacity: 0.12, opacity: 0.7 };
}
function highlightStyle(base) {
  return Object.assign({}, base, { weight: 3, color: COLORS.highlight, fillOpacity: 0.4, opacity: 1 });
}

// ---------------------------------------------------------------
// Selection state — one shared model for both engines. Only one
// feature is selected at a time, whichever map it was picked on.
// ---------------------------------------------------------------

let selectedType = null; // "county" | "continent" | null
let selectedName = null;
let countiesLayer, continentsLayer; // Leaflet layers
let countyIdByName = {}, continentIdByName = {}; // for MapLibre feature-state
let countyCenters = {}, continentCenters = {}; // for flyTo on both engines

// The shared card shows itself whenever the prayer line or the verse (or
// both) have content, and hides itself when neither does. The masthead
// steps aside at the same time, so the center of attention during a
// service isn't competing with the app's own small branding label.
function updateFocusStack() {
  const prayerShown = !document.getElementById("prayer-banner").classList.contains("hidden");
  const verseShown = !document.getElementById("verse-banner").classList.contains("hidden");
  document.getElementById("focus-stack").classList.toggle("hidden", !(prayerShown || verseShown));
  document.getElementById("masthead").classList.toggle("hidden", prayerShown || verseShown);
}

// The prayer line is driven by #prayer-input, live — typing in it (or
// clicking a region, which fills it in) updates the banner immediately.
// #toggle-prayer is an independent on/off switch: turning it off hides the
// banner right away without touching the typed text or the map selection,
// so it can be turned back on later, or the map can just be viewed plain.
function updatePrayerDisplay() {
  const text = document.getElementById("prayer-input").value.trim();
  const on = document.getElementById("toggle-prayer").checked;
  document.getElementById("prayer-name").textContent = text;
  document.getElementById("prayer-banner").classList.toggle("hidden", !(on && text.length > 0));
  updateFocusStack();
}
document.getElementById("prayer-input").addEventListener("input", updatePrayerDisplay);
document.getElementById("toggle-prayer").addEventListener("change", updatePrayerDisplay);

// Marks the selected region's entry in whichever browsable list it belongs
// to (counties or continents) with the same gold accent used to highlight
// its shape on the map, and clears any other entry that was marked before.
function highlightListItem(activeName) {
  document.querySelectorAll(".feature-list button").forEach((btn) => {
    btn.classList.toggle("active", activeName !== null && btn.textContent === activeName);
  });
}

// Applies (or clears) the highlight color on both engines at once, for
// whatever selectedType/selectedName currently is. Iterating every feature
// on every selection change is trivial at this scale (55 features total).
function applyMapHighlights() {
  [
    { layer: countiesLayer, prop: "COUNTY", styleFn: countyStyle, type: "county" },
    { layer: continentsLayer, prop: "CONTINENT", styleFn: continentStyle, type: "continent" }
  ].forEach(({ layer, prop, styleFn, type }) => {
    if (!layer) return;
    layer.eachLayer((l) => {
      const isSel = selectedType === type && l.feature.properties[prop] === selectedName;
      l.setStyle(isSel ? highlightStyle(styleFn()) : styleFn());
      if (isSel) l.bringToFront();
    });
  });

  if (globeMap.getSource("counties")) {
    Object.keys(countyIdByName).forEach((name) => {
      globeMap.setFeatureState(
        { source: "counties", id: countyIdByName[name] },
        { selected: selectedType === "county" && selectedName === name }
      );
    });
  }
  if (globeMap.getSource("continents")) {
    Object.keys(continentIdByName).forEach((name) => {
      globeMap.setFeatureState(
        { source: "continents", id: continentIdByName[name] },
        { selected: selectedType === "continent" && selectedName === name }
      );
    });
  }
}

// Centers whichever region is selected on both engines — the flat map
// flies to its bounds, the globe flies to an approximate center/zoom
// computed from its bounding box. Both run every time regardless of which
// view is currently visible, so switching views mid-selection still lands
// on the right place.
function flyToFeature(type, name) {
  const layer = type === "county" ? countiesLayer : continentsLayer;
  const prop = type === "county" ? "COUNTY" : "CONTINENT";
  if (layer) {
    let match;
    layer.eachLayer((l) => {
      if (l.feature.properties[prop] === name) match = l;
    });
    if (match) {
      const opts = type === "county"
        ? { paddingTopLeft: [260, 80], paddingBottomRight: [260, 80], duration: 0.6 }
        : { padding: [40, 40], duration: 0.6 };
      map.flyToBounds(match.getBounds(), opts);
    }
  }
  const centers = type === "county" ? countyCenters : continentCenters;
  const c = centers[name];
  if (c) {
    globeMap.flyTo({ center: [c.lng, c.lat], zoom: c.zoom, duration: 1200 });
  }
}

function clearSelection() {
  selectedType = null;
  selectedName = null;
  applyMapHighlights();
  document.getElementById("detail-panel").classList.add("hidden");
  document.getElementById("prayer-input").value = "";
  updatePrayerDisplay();
  highlightListItem(null);
}

// The single entry point for "this is now selected", called from a map
// click (either engine), a list item, or the county quick-jump — so
// highlighting, the detail panel, the prayer text, and both cameras all
// stay in sync no matter how a region was picked.
function selectFeature(type, name, rows) {
  if (selectedType === type && selectedName === name) {
    clearSelection();
    return;
  }
  selectedType = type;
  selectedName = name;
  applyMapHighlights();
  openPanel(type === "county" ? "County" : "Continent", name, rows);
  flyToFeature(type, name);
}

function openPanel(kicker, title, rows) {
  document.getElementById("detail-kicker").textContent = kicker;
  document.getElementById("detail-title").textContent = title;
  const dl = document.getElementById("detail-stats");
  dl.innerHTML = "";
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
  document.getElementById("detail-panel").classList.remove("hidden");
  document.getElementById("hint").classList.add("hidden");

  // Fills the editable prayer text in, e.g. "Bomet county" or "Africa
  // continent" — the banner itself only shows if #toggle-prayer is on.
  document.getElementById("prayer-input").value = `${title} ${kicker.toLowerCase()}`;
  updatePrayerDisplay();
  highlightListItem(title);
}

// ---------------------------------------------------------------
// Bible verse — shown live as it's typed, independent of any
// county/continent selection so it can be shown on its own.
// ---------------------------------------------------------------

document.getElementById("verse-input").addEventListener("input", (e) => {
  const text = e.target.value;
  document.getElementById("verse-text").textContent = text;
  document.getElementById("verse-banner").classList.toggle("hidden", text.trim().length === 0);
  updateFocusStack();
});

document.getElementById("panel-close").addEventListener("click", clearSelection);

// ---------------------------------------------------------------
// Feature interaction — 2D map
// ---------------------------------------------------------------

function onEachCounty(feature, layer) {
  const base = countyStyle();
  layer.on({
    mouseover: () => {
      if (selectedType === "county" && selectedName === feature.properties.COUNTY) return;
      layer.setStyle({ weight: 2, color: COLORS.hover });
    },
    mouseout: () => {
      if (selectedType === "county" && selectedName === feature.properties.COUNTY) return;
      layer.setStyle(base);
    },
    click: (e) => {
      // Stop the click from also reaching the continent polygon underneath —
      // inside Kenya, a click should resolve to the county, not both layers at once.
      L.DomEvent.stopPropagation(e);
      const p = feature.properties;
      selectFeature("county", p.COUNTY, [["Area", `${(p.AREA_KM2 || 0).toLocaleString()} km²`]]);
    }
  });
  layer.bindTooltip(feature.properties.COUNTY, { sticky: true, direction: "top", className: "tt" });
}

function onEachContinent(feature, layer) {
  const base = continentStyle();
  layer.on({
    mouseover: () => {
      if (selectedType === "continent" && selectedName === feature.properties.CONTINENT) return;
      layer.setStyle({ weight: 2, color: COLORS.hover });
    },
    mouseout: () => {
      if (selectedType === "continent" && selectedName === feature.properties.CONTINENT) return;
      layer.setStyle(base);
    },
    click: () => {
      const p = feature.properties;
      selectFeature("continent", p.CONTINENT, [["Area", `${Math.round(p.SQKM).toLocaleString()} km²`]]);
    }
  });
  layer.bindTooltip(feature.properties.CONTINENT, { sticky: true, direction: "top", className: "tt" });
}

// ---------------------------------------------------------------
// Layer toggles — independent checkboxes, so counties, continents,
// both, or neither can be visible at once, on both engines together.
// ---------------------------------------------------------------

function wireToggle(checkboxId, getLayer, type, globeFillId, globeLineId) {
  document.getElementById(checkboxId).addEventListener("change", (e) => {
    const layer = getLayer();
    if (layer) {
      if (e.target.checked) {
        map.addLayer(layer);
      } else {
        if (selectedType === type) clearSelection();
        map.removeLayer(layer);
      }
    }
    if (globeMap.getLayer(globeFillId)) {
      const vis = e.target.checked ? "visible" : "none";
      globeMap.setLayoutProperty(globeFillId, "visibility", vis);
      globeMap.setLayoutProperty(globeLineId, "visibility", vis);
    }
  });
}
wireToggle("toggle-counties", () => countiesLayer, "county", "counties-fill", "counties-line");
wireToggle("toggle-continents", () => continentsLayer, "continent", "continents-fill", "continents-line");

// A browsable list only makes sense while its layer is actually visible —
// hide its floating panel otherwise, so it can't imply a layer is showing
// when it isn't.
function syncListVisibility() {
  if (!document.getElementById("toggle-counties").checked) {
    document.getElementById("counties-panel").classList.add("hidden");
  }
  if (!document.getElementById("toggle-continents").checked) {
    document.getElementById("continents-panel").classList.add("hidden");
  }
}
document.getElementById("toggle-counties").addEventListener("change", syncListVisibility);
document.getElementById("toggle-continents").addEventListener("change", syncListVisibility);

// Builds an alphabetical, clickable list of every feature in a layer (all
// 47 counties, or all 8 continents) inside the given <ul>. Clicking a name
// turns its layer on if needed, then runs it through the same selection
// path a map click would.
function buildFeatureList(ulId, layer, nameProp, toggleId, type, rowsFn) {
  const ul = document.getElementById(ulId);
  const names = [];
  layer.eachLayer((l) => names.push(l.feature.properties[nameProp]));
  names.sort((a, b) => a.localeCompare(b));
  names.forEach((name) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = name;
    btn.addEventListener("click", () => {
      const toggle = document.getElementById(toggleId);
      if (!toggle.checked) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event("change"));
      }
      let match;
      layer.eachLayer((l) => {
        if (l.feature.properties[nameProp] === name) match = l;
      });
      if (match) selectFeature(type, name, rowsFn(match.feature.properties));
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

// ---------------------------------------------------------------
// Floating county/continent list panels — open/close, drag, and
// per-panel text size.
// ---------------------------------------------------------------

// Keeps a panel fully on screen, whether it's just been opened or is
// about to be dragged past an edge.
function clampToViewport(panel) {
  const margin = 6;
  const rect = panel.getBoundingClientRect();
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  const left = Math.min(Math.max(rect.left, margin), maxLeft);
  const top = Math.min(Math.max(rect.top, margin), maxTop);
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function wireListOpenButton(btnId, panelId, toggleId) {
  document.getElementById(btnId).addEventListener("click", () => {
    const panel = document.getElementById(panelId);
    const opening = panel.classList.contains("hidden");
    if (!opening) {
      panel.classList.add("hidden");
      return;
    }
    const toggle = document.getElementById(toggleId);
    if (!toggle.checked) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));
    }
    panel.classList.remove("hidden");
    clampToViewport(panel);
  });
}
wireListOpenButton("open-counties-list", "counties-panel", "toggle-counties");
wireListOpenButton("open-continents-list", "continents-panel", "toggle-continents");

document.querySelectorAll(".list-panel-close").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.panel).classList.add("hidden");
  });
});

// Drag a panel by its handle. Pointer events cover mouse, touch, and pen
// in one code path, and pointer capture keeps the drag going even if the
// pointer moves faster than the panel and briefly leaves the handle.
function makeDraggable(panel, handle) {
  let dragging = false;
  let startX, startY, startLeft, startTop, panelW, panelH;

  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    panelW = rect.width;
    panelH = rect.height;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    e.preventDefault();
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const margin = 6;
    const maxLeft = Math.max(margin, window.innerWidth - panelW - margin);
    const maxTop = Math.max(margin, window.innerHeight - panelH - margin);
    const left = Math.min(Math.max(startLeft + (e.clientX - startX), margin), maxLeft);
    const top = Math.min(Math.max(startTop + (e.clientY - startY), margin), maxTop);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
}
document.querySelectorAll(".list-panel").forEach((panel) => {
  makeDraggable(panel, panel.querySelector(".list-panel-drag"));
});

// Each panel's text size is independent (counties and continents can be
// sized differently) and lives on the <ul> itself, so every button in it
// just inherits the current size.
function adjustFontSize(panelId, delta) {
  const list = document.querySelector(`#${panelId} .feature-list`);
  const current = parseFloat(getComputedStyle(list).fontSize);
  const next = Math.min(22, Math.max(11, current + delta * 1.5));
  list.style.fontSize = `${next}px`;
}
document.querySelectorAll(".font-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    adjustFontSize(btn.dataset.panel, parseInt(btn.dataset.delta, 10));
  });
});

// ---------------------------------------------------------------
// 2D / 3D view switch
// ---------------------------------------------------------------

function setView(view) {
  const flatBtn = document.getElementById("view-flat");
  const globeBtn = document.getElementById("view-globe");
  document.getElementById("map").classList.toggle("view-hidden", view !== "flat");
  document.getElementById("globe").classList.toggle("view-hidden", view !== "globe");
  flatBtn.classList.toggle("active", view === "flat");
  globeBtn.classList.toggle("active", view === "globe");
  flatBtn.setAttribute("aria-pressed", String(view === "flat"));
  globeBtn.setAttribute("aria-pressed", String(view === "globe"));
  // Re-center whichever engine just became visible on the current
  // selection, if there is one, so switching views mid-prayer still shows
  // the right region front and center.
  if (selectedType && selectedName) flyToFeature(selectedType, selectedName);
}
document.getElementById("view-flat").addEventListener("click", () => setView("flat"));
document.getElementById("view-globe").addEventListener("click", () => setView("globe"));

// ---------------------------------------------------------------
// A rough bounding-box center/zoom for a GeoJSON geometry, used to fly the
// globe to a region. Approximate rather than a true centroid — plenty for
// framing a shape, not meant for precise measurement. Note: this doesn't
// special-case geometry that crosses the antimeridian (±180°), so a region
// like Oceania — which really does span the date line — can get an
// oversized bounding box and a wider-than-ideal default framing.
// ---------------------------------------------------------------

function bboxCenterZoom(geometry) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      coords.forEach(walk);
    }
  };
  walk(geometry.coordinates);
  const lng = (minLng + maxLng) / 2;
  const lat = (minLat + maxLat) / 2;
  const span = Math.max(maxLng - minLng, (maxLat - minLat) * 2, 0.05);
  const zoom = Math.max(1.2, Math.min(6.5, Math.log2(360 / span) - 1.2));
  return { lng, lat, zoom };
}

// ---------------------------------------------------------------
// Globe layers — sources, paint (feature-state driven highlighting),
// click routing, and hover cursor.
// ---------------------------------------------------------------

function setupGlobeLayers(countiesGeo, continentsGeo) {
  globeMap.addSource("continents", { type: "geojson", data: continentsGeo, generateId: true });
  globeMap.addSource("counties", { type: "geojson", data: countiesGeo, generateId: true });

  const selExpr = (selColor, baseColor) =>
    ["case", ["boolean", ["feature-state", "selected"], false], selColor, baseColor];

  globeMap.addLayer({
    id: "continents-fill",
    type: "fill",
    source: "continents",
    paint: {
      "fill-color": selExpr(COLORS.highlight, COLORS.continents),
      "fill-opacity": selExpr(0.55, 0.28)
    }
  });
  globeMap.addLayer({
    id: "continents-line",
    type: "line",
    source: "continents",
    paint: {
      "line-color": selExpr(COLORS.highlight, COLORS.continents),
      "line-width": selExpr(2, 1)
    }
  });
  globeMap.addLayer({
    id: "counties-fill",
    type: "fill",
    source: "counties",
    paint: {
      "fill-color": selExpr(COLORS.highlight, COLORS.counties),
      "fill-opacity": selExpr(0.65, 0.35)
    }
  });
  globeMap.addLayer({
    id: "counties-line",
    type: "line",
    source: "counties",
    paint: {
      "line-color": selExpr(COLORS.highlight, COLORS.counties),
      "line-width": selExpr(2.5, 1)
    }
  });

  if (!document.getElementById("toggle-continents").checked) {
    globeMap.setLayoutProperty("continents-fill", "visibility", "none");
    globeMap.setLayoutProperty("continents-line", "visibility", "none");
  }
  if (!document.getElementById("toggle-counties").checked) {
    globeMap.setLayoutProperty("counties-fill", "visibility", "none");
    globeMap.setLayoutProperty("counties-line", "visibility", "none");
  }

  // One click handler, querying both layers at once, rather than a
  // separate listener per layer — queryRenderedFeatures returns the
  // topmost-rendered match first, so this gives counties priority over
  // the continent underneath, the same way the 2D map's panes do.
  globeMap.on("click", (e) => {
    const results = globeMap.queryRenderedFeatures(e.point, { layers: ["counties-fill", "continents-fill"] });
    if (!results.length) return;
    const f = results[0];
    const p = f.properties;
    if (f.layer.id === "counties-fill") {
      selectFeature("county", p.COUNTY, [["Area", `${(p.AREA_KM2 || 0).toLocaleString()} km²`]]);
    } else {
      selectFeature("continent", p.CONTINENT, [["Area", `${Math.round(p.SQKM).toLocaleString()} km²`]]);
    }
  });

  ["counties-fill", "continents-fill"].forEach((id) => {
    globeMap.on("mouseenter", id, () => { globeMap.getCanvas().style.cursor = "pointer"; });
    globeMap.on("mouseleave", id, () => { globeMap.getCanvas().style.cursor = ""; });
  });
}

// ---------------------------------------------------------------
// Load data
// ---------------------------------------------------------------

Promise.all([
  fetch(DATA_URLS.counties).then((r) => r.json()),
  fetch(DATA_URLS.continents).then((r) => r.json())
])
  .then(([countiesGeo, continentsGeo]) => {
    continentsLayer = L.geoJSON(continentsGeo, {
      pane: "continentsPane",
      style: continentStyle,
      onEachFeature: onEachContinent
    });
    countiesLayer = L.geoJSON(countiesGeo, {
      pane: "countiesPane",
      style: countyStyle,
      onEachFeature: onEachCounty
    });

    // Add each layer only if its checkbox actually says so, rather than
    // assuming both start on — keeps the map truthful to the UI from the
    // very first paint.
    if (document.getElementById("toggle-continents").checked) map.addLayer(continentsLayer);
    if (document.getElementById("toggle-counties").checked) map.addLayer(countiesLayer);
    syncListVisibility();

    document.getElementById("count-counties").textContent = countiesGeo.features.length;
    document.getElementById("count-continents").textContent = continentsGeo.features.length;

    buildFeatureList("counties-list", countiesLayer, "COUNTY", "toggle-counties", "county",
      (p) => [["Area", `${(p.AREA_KM2 || 0).toLocaleString()} km²`]]);
    buildFeatureList("continents-list", continentsLayer, "CONTINENT", "toggle-continents", "continent",
      (p) => [["Area", `${Math.round(p.SQKM).toLocaleString()} km²`]]);

    // Name → id (for feature-state) and name → center/zoom (for flyTo),
    // built from the same feature arrays passed to MapLibre's sources —
    // generateId assigns ids by array index, so this stays in sync.
    countiesGeo.features.forEach((f, i) => {
      countyIdByName[f.properties.COUNTY] = i;
      countyCenters[f.properties.COUNTY] = bboxCenterZoom(f.geometry);
    });
    continentsGeo.features.forEach((f, i) => {
      continentIdByName[f.properties.CONTINENT] = i;
      continentCenters[f.properties.CONTINENT] = bboxCenterZoom(f.geometry);
    });

    const initGlobeLayers = () => setupGlobeLayers(countiesGeo, continentsGeo);
    if (globeMap.isStyleLoaded()) initGlobeLayers();
    else globeMap.once("load", initGlobeLayers);

    document.getElementById("loading").style.display = "none";
  })
  .catch((err) => {
    document.getElementById("loading").textContent = "Could not load map data — see console.";
    console.error(err);
  });