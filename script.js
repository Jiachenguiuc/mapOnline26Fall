/* Static site: all project resources use relative paths for GitHub Pages. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const status = $("status");
  if (!window.L) {
    status.textContent = "The map library could not load. Check your connection and refresh.";
    $("boundary-status").textContent = "Map unavailable.";
    $("count").textContent = "Load failed";
    return;
  }
  const TYPES = {
    "Natural Surface Trail": { label: "Natural Surface Trail", color: "#38734b" },
    "Concrete Shared-Use Path": { label: "Concrete Shared-Use Path", color: "#397da1" },
    "Informal / Social Trail": { label: "Informal / Social Trail", color: "#bd8340", dashArray: "6 5" },
    "Neighborhood Connector / Spur": { label: "Neighborhood Connector / Spur", color: "#8b64a2" },
    "Designated Loop Trail": { label: "Designated Loop Trail", color: "#cf6350" },
    "Other": { label: "Other", color: "#6f7d78" }
  };
  const SURFACES = { "Natural Dirt": "Natural Dirt", "Concrete": "Concrete" };
  const value = (v) => v == null || String(v).trim() === "" ? "Not provided" : String(v).trim();
  const typeInfo = (type) => TYPES[type] || { label: value(type), color: "#6f7d78" };
  const map = L.map("map", { zoomControl: false }).setView([32.964, -96.653], 16);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
  const base = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  base.on("tileerror", () => {
    $("tile-status").hidden = false;
    $("tile-status").textContent = "Some basemap tiles could not load. Check your connection; trails remain available.";
  });
  const trails = L.geoJSON(null, { style: styleFor, onEachFeature: attachTrail }).addTo(map);
  map.createPane("boundaryPane");
  map.getPane("boundaryPane").style.zIndex = 350;
  const boundary = L.geoJSON(null, {
    pane: "boundaryPane",
    style: { color: "#42634e", weight: 2, dashArray: "7 5", fillOpacity: 0.06 },
    onEachFeature(feature, layer) {
      const p = feature.properties || {};
      const content = document.createElement("div");
      const title = document.createElement("h3");
      title.className = "popup-title";
      title.textContent = value(p.Preserve) === "Not provided" ? "Preserve boundary" : value(p.Preserve);
      content.append(title);
      [["Owner", p.Owner], ["Location", p.Location], ["Parcel", p.Parcel_Num]].forEach(([label, text]) => {
        const row = document.createElement("p"); row.className = "popup-row";
        const key = document.createElement("span"); key.textContent = label;
        row.append(key, document.createTextNode(value(text))); content.append(row);
      });
      layer.bindPopup(content);
    }
  });
  const layers = L.control.layers({ "OpenStreetMap": base }, { "Trail survey": trails }, { position: "topright", collapsed: true }).addTo(map);
  let features = [];
  let fullBounds = null;
  let trailBounds = null;
  let boundaryBounds = null;
  let selected = null;
  let cards = new Map();
  const featureLayers = new Map();

  function styleFor(feature) {
    const info = typeInfo(feature.properties?.Trail_Type);
    return { color: info.color, weight: 4, opacity: 0.95, dashArray: info.dashArray || null };
  }
  function popup(feature) {
    const p = feature.properties || {};
    const container = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "popup-title";
    title.textContent = value(p.Trail_Name);
    container.append(title);
    [["Trail type", typeInfo(p.Trail_Type).label], ["Surface", SURFACES[p.Surface_Type] || value(p.Surface_Type)], ["Segment ID", value(p.OBJECTID)]].forEach(([label, text]) => {
      const row = document.createElement("p"); row.className = "popup-row";
      const key = document.createElement("span"); key.textContent = label;
      row.append(key, document.createTextNode(text)); container.append(row);
    });
    return container;
  }
  function selectFeature(feature) {
    if (selected && featureLayers.has(selected)) trails.resetStyle(featureLayers.get(selected));
    if (cards.has(selected)) cards.get(selected).setAttribute("aria-pressed", "false");
    selected = feature;
    const layer = featureLayers.get(feature);
    if (layer) { layer.setStyle({ weight: 7, opacity: 1 }); layer.bringToFront(); }
    if (cards.has(feature)) cards.get(feature).setAttribute("aria-pressed", "true");
  }
  function attachTrail(feature, layer) {
    featureLayers.set(feature, layer);
    layer.bindPopup(popup(feature));
    layer.on("mouseover", () => layer.setStyle({ weight: 7 }));
    layer.on("mouseout", () => { if (selected !== feature) trails.resetStyle(layer); });
    layer.on("click", () => selectFeature(feature));
    layer.on("popupclose", () => {
      if (selected === feature) {
        trails.resetStyle(layer);
        cards.get(feature)?.setAttribute("aria-pressed", "false");
        selected = null;
      }
    });
  }
  async function loadGeoJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Expected a GeoJSON FeatureCollection");
    return data;
  }
  function addOptions(id, field, label) {
    [...new Set(features.map((f) => value(f.properties?.[field])))].sort().forEach((v) => {
      const option = document.createElement("option"); option.value = v; option.textContent = label(v); $(id).append(option);
    });
  }
  function swatch(info) {
    const span = document.createElement("span"); span.className = "swatch";
    span.style.setProperty("--swatch", info.color); span.setAttribute("aria-hidden", "true");
    if (info.dashArray) span.style.background = `repeating-linear-gradient(90deg, ${info.color} 0 5px, transparent 5px 8px)`;
    return span;
  }
  function render() {
    const query = $("search").value.trim().toLocaleLowerCase();
    const type = $("type-filter").value, surface = $("surface-filter").value;
    const filtered = features.filter((f) => {
      const p = f.properties || {};
      return (!query || value(p.Trail_Name).toLocaleLowerCase().includes(query)) &&
        (!type || value(p.Trail_Type) === type) && (!surface || value(p.Surface_Type) === surface);
    });
    map.closePopup(); selected = null; trails.clearLayers(); featureLayers.clear();
    trails.addData({ type: "FeatureCollection", features: filtered });
    cards = new Map(); $("trail-list").replaceChildren();
    $("count").textContent = `${filtered.length} / ${features.length} segments`;
    status.textContent = filtered.length ? "" : "No matching trails. Try a different search or filter.";
    filtered.forEach((feature) => {
      const p = feature.properties || {}, info = typeInfo(p.Trail_Type);
      const card = document.createElement("button"); card.type = "button"; card.className = "trail-card"; card.setAttribute("aria-pressed", "false");
      const title = document.createElement("span"); title.className = "card-title"; title.textContent = value(p.Trail_Name);
      const meta = document.createElement("span"); meta.className = "card-meta";
      meta.append(swatch(info), document.createTextNode(`${info.label} · #${value(p.OBJECTID)}`));
      card.append(title, meta);
      card.addEventListener("click", () => {
        if (!map.hasLayer(trails)) map.addLayer(trails);
        const layer = featureLayers.get(feature);
        map.fitBounds(layer.getBounds(), { padding: [45, 45], maxZoom: 18 });
        layer.openPopup(); selectFeature(feature);
        if (window.matchMedia("(max-width: 760px)").matches) $("map").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      cards.set(feature, card); $("trail-list").append(card);
    });
    $("legend-items").replaceChildren();
    [...new Set(filtered.map((f) => f.properties?.Trail_Type))].forEach((type) => {
      const info = typeInfo(type), row = document.createElement("div"); row.className = "legend-row";
      row.append(swatch(info), document.createTextNode(info.label)); $("legend-items").append(row);
    });
  }
  $("search").addEventListener("input", render);
  $("type-filter").addEventListener("change", render);
  $("surface-filter").addEventListener("change", render);
  $("reset").addEventListener("click", () => {
    $("search").value = ""; $("type-filter").value = ""; $("surface-filter").value = ""; render();
  });
  function fitFullExtent() {
    if (!fullBounds?.isValid()) return;
    map.invalidateSize({ pan: false });
    const legend = document.querySelector(".legend");
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    // Reserve space for the legend so the complete boundary remains visible.
    const right = !mobile && legend.open ? legend.offsetWidth + 40 : 35;
    const bottom = mobile && legend.open ? legend.offsetHeight + 45 : 45;
    map.fitBounds(fullBounds, {
      paddingTopLeft: [35, 65], paddingBottomRight: [right, bottom],
      maxZoom: 17, animate: false
    });
  }
  $("fit-bounds").addEventListener("click", fitFullExtent);

  async function loadTrails() {
    try {
      const data = await loadGeoJSON("./data/roadSurvey.geojson");
      features = data.features.filter((f) => f.geometry && ["LineString", "MultiLineString"].includes(f.geometry.type));
      addOptions("type-filter", "Trail_Type", (v) => typeInfo(v).label);
      addOptions("surface-filter", "Surface_Type", (v) => SURFACES[v] || v);
      render();
      trailBounds = trails.getBounds();
      if (!features.length) status.textContent = "No line features are available in the trail file.";
    } catch (error) {
      status.textContent = "Trail data could not load. Check the file path, GeoJSON format and connection, then refresh.";
      $("count").textContent = "Load failed";
      console.error("Trail data:", error);
    }
  }
  async function loadBoundary() {
    try {
      const data = await loadGeoJSON("./data/LeeFJacksonBoundary.geojson");
      const valid = data.features.filter((f) => f.geometry && ["Polygon", "MultiPolygon"].includes(f.geometry.type));
      if (!valid.length) {
        $("boundary-status").textContent = "Boundary unavailable: the current file has no polygon geometry.";
        return;
      }
      boundary.addData({ type: "FeatureCollection", features: valid }).addTo(map);
      layers.addOverlay(boundary, "Preserve boundary");
      $("boundary-legend").hidden = false;
      boundaryBounds = boundary.getBounds();
      if (valid.length < data.features.length) $("boundary-status").textContent = `Showing ${valid.length} boundary features; remaining features have no polygon geometry.`;
      else $("boundary-status").hidden = true;
    } catch (error) {
      $("boundary-status").textContent = "Boundary data could not load. The trail map remains available.";
      console.error("Boundary data:", error);
    }
  }
  // Set the opening view once both requests finish, independent of their order.
  Promise.all([loadTrails(), loadBoundary()]).then(() => {
    fullBounds = boundaryBounds?.isValid() ? boundaryBounds : trailBounds;
    fitFullExtent();
  });
})();
