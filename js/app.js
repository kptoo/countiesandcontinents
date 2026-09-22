/* Kenya Counties x World Continents — Leaflet app
 * No build step. Everything below runs as plain ES2017 in the browser.
 */

const DATA_URLS = {
  counties: "data/kenya_counties.geojson",
  continents: "data/world_continents.geojson"
};

// CARTO now requires a free API key on basemap tile requests (since Aug 2026).
// Get one at https://carto.com/basemaps/apikey — free tier covers 5M tile
// requests/month, no account needed. This key isn't a secret (it's served to
// every visitor in the page source either way) — it just identifies your
// usage against the free quota, so it's fine to commit as-is.
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
// Map + base layer
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
// Styles
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
// Selection state — only one feature selected at a time, whichever
// layer it belongs to.
// ---------------------------------------------------------------

let selected = null; // { layer, baseStyle }
let countiesLayer, continentsLayer;

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

function clearSelection() {
  if (selected) {
    selected.layer.setStyle(selected.baseStyle);
    selected = null;
  }
  document.getElementById("detail-panel").classList.add("hidden");
  document.getElementById("prayer-input").value = "";
  updatePrayerDisplay();
  highlightListItem(null);
}

function selectFeature(layer, baseStyleFn, kicker, title, rows) {
  if (selected && selected.layer === layer) {
    clearSelection();
    return;
  }
  if (selected) {
    selected.layer.setStyle(selected.baseStyle);
  }
  const base = baseStyleFn();
  layer.setStyle(highlightStyle(base));
  layer.bringToFront();
  selected = { layer, baseStyle: base };
  openPanel(kicker, title, rows);
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
// Feature interaction
// ---------------------------------------------------------------

function onEachCounty(feature, layer) {
  const base = countyStyle();
  layer.on({
    mouseover: () => {
      if (selected && selected.layer === layer) return;
      layer.setStyle({ weight: 2, color: COLORS.hover });
    },
    mouseout: () => {
      if (selected && selected.layer === layer) return;
      layer.setStyle(base);
    },
    click: (e) => {
      // Stop the click from also reaching the continent polygon underneath —
      // inside Kenya, a click should resolve to the county, not both layers at once.
      L.DomEvent.stopPropagation(e);
      const p = feature.properties;
      selectFeature(layer, countyStyle, "County", p.COUNTY, [
        ["Area", `${(p.AREA_KM2 || 0).toLocaleString()} km²`]
      ]);
      map.flyToBounds(layer.getBounds(), { paddingTopLeft: [260, 80], paddingBottomRight: [260, 80], duration: 0.6 });
    }
  });
  layer.bindTooltip(feature.properties.COUNTY, { sticky: true, direction: "top", className: "tt" });
}

function onEachContinent(feature, layer) {
  const base = continentStyle();
  layer.on({
    mouseover: () => {
      if (selected && selected.layer === layer) return;
      layer.setStyle({ weight: 2, color: COLORS.hover });
    },
    mouseout: () => {
      if (selected && selected.layer === layer) return;
      layer.setStyle(base);
    },
    click: () => {
      const p = feature.properties;
      selectFeature(layer, continentStyle, "Continent", p.CONTINENT, [
        ["Area", `${Math.round(p.SQKM).toLocaleString()} km²`]
      ]);
      map.flyToBounds(layer.getBounds(), { padding: [40, 40], duration: 0.6 });
    }
  });
  layer.bindTooltip(feature.properties.CONTINENT, { sticky: true, direction: "top", className: "tt" });
}

// ---------------------------------------------------------------
// Layer toggles — independent checkboxes, so counties, continents,
// both, or neither can be visible at once.
// ---------------------------------------------------------------

function wireToggle(checkboxId, getLayer) {
  document.getElementById(checkboxId).addEventListener("change", (e) => {
    const layer = getLayer();
    if (!layer) return;
    if (e.target.checked) {
      map.addLayer(layer);
    } else {
      if (selected && layer.hasLayer(selected.layer)) clearSelection();
      map.removeLayer(layer);
    }
  });
}
wireToggle("toggle-counties", () => countiesLayer);
wireToggle("toggle-continents", () => continentsLayer);

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
// turns its layer on if needed and fires the same click handling a map
// click would — selecting it, highlighting it, filling the prayer text,
// and flying the map to it.
function buildFeatureList(ulId, layer, nameProp, toggleId) {
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
      if (match) match.fire("click");
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

    buildFeatureList("counties-list", countiesLayer, "COUNTY", "toggle-counties");
    buildFeatureList("continents-list", continentsLayer, "CONTINENT", "toggle-continents");

    document.getElementById("loading").style.display = "none";
  })
  .catch((err) => {
    document.getElementById("loading").textContent = "Could not load map data — see console.";
    console.error(err);
  });