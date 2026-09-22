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

function clearSelection() {
  if (selected) {
    selected.layer.setStyle(selected.baseStyle);
    selected = null;
  }
  document.getElementById("detail-panel").classList.add("hidden");
  document.getElementById("prayer-banner").classList.add("hidden");
  document.getElementById("masthead").classList.remove("hidden");
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

  // e.g. "Bomet county" or "Africa continent" — for display during prayer.
  document.getElementById("prayer-name").textContent = `${title} ${kicker.toLowerCase()}`;
  document.getElementById("prayer-banner").classList.remove("hidden");
  document.getElementById("masthead").classList.add("hidden");
}

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

// The "jump to a county" control only makes sense while the counties layer
// is actually visible — hide it otherwise so it can't imply counties are
// showing when they're not.
function syncJumpGroupVisibility() {
  const on = document.getElementById("toggle-counties").checked;
  document.getElementById("jump-group").classList.toggle("hidden", !on);
}
document.getElementById("toggle-counties").addEventListener("change", syncJumpGroupVisibility);

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
    syncJumpGroupVisibility();

    document.getElementById("count-counties").textContent = countiesGeo.features.length;
    document.getElementById("count-continents").textContent = continentsGeo.features.length;

    // County quick-jump
    const select = document.getElementById("county-jump");
    const names = countiesGeo.features
      .map((f) => f.properties.COUNTY)
      .sort((a, b) => a.localeCompare(b));
    names.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    select.addEventListener("change", (e) => {
      const name = e.target.value;
      if (!name) return;
      let match;
      countiesLayer.eachLayer((l) => {
        if (l.feature.properties.COUNTY === name) match = l;
      });
      if (match) {
        if (!document.getElementById("toggle-counties").checked) {
          document.getElementById("toggle-counties").checked = true;
          map.addLayer(countiesLayer);
        }
        match.fire("click");
      }
      select.value = "";
    });

    document.getElementById("loading").style.display = "none";
  })
  .catch((err) => {
    document.getElementById("loading").textContent = "Could not load map data — see console.";
    console.error(err);
  });