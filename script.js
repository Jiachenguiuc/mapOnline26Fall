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
  let analysisMode = false;
  let riskBreaks = [];
  let flowOverlay = null;
  let flowMetadata = null;
  const RISK_CLASSES = [
    { label: "Low", color: "#2b9b50" },
    { label: "Medium", color: "#e9ba25" },
    { label: "High", color: "#d73535" }
  ];
  const riskScore = (feature) => {
    const raw = feature.properties?.Risk_Score;
    return raw == null || raw === "" ? NaN : Number(raw);
  };
  function riskInfo(feature) {
    const score = riskScore(feature);
    if (!Number.isFinite(score) || !riskBreaks.length) return { label: "No risk data", color: "#7c8582" };
    const index = riskBreaks.findIndex((upper) => score <= upper);
    return RISK_CLASSES[index < 0 ? riskBreaks.length - 1 : index];
  }
  const map = L.map("map", { zoomControl: false }).setView([32.964, -96.653], 16);
  map.createPane("flowPane");
  map.getPane("flowPane").style.zIndex = 250;
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
  const layers = L.control.layers({}, { "Trail survey": trails }, { position: "topright", collapsed: true }).addTo(map);
  let features = [];
  let fullBounds = null;
  let trailBounds = null;
  let boundaryBounds = null;
  let selected = null;
  let cards = new Map();
  const featureLayers = new Map();
  const POINT_CATEGORIES = {
    Signage: { color: "#246a9b", path: 'M12 3v18M4 5h13l3 4-3 4H4z' },
    Amenity: { color: "#965b32", path: 'M4 5h16v6H4zM3 14h18M6 11v9M18 11v9' },
    Habitat: { color: "#438346", path: 'M3 10l9-7 9 7M6 8v13h12V8M12 12a2 2 0 1 0 0 4a2 2 0 1 0 0-4' },
    Other: { color: "#79569b", path: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0zM12 7v6M9 10h6' }
  };
  function pointSymbol(category) {
    const info = POINT_CATEGORIES[category] || POINT_CATEGORIES.Other;
    return `<span class="point-symbol" style="--point-color:${info.color}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${info.path}"/></svg></span>`;
  }
  let imageManifest = {};
  let photoIndexAvailable = true;
  let pointBounds = null;
  function pointPopup(feature) {
    const p = feature.properties || {};
    const id = value(p.PointID);
    const name = value(p.Name);
    const content = document.createElement("div"); content.className = "point-popup";
    const title = document.createElement("h3"); title.className = "popup-title"; title.textContent = name;
    const meta = document.createElement("p"); meta.className = "popup-row";
    meta.textContent = `${value(p.Category ?? p.category)} · Point ${id}`;
    content.append(title, meta);
    const photos = imageManifest[id] || [];
    if (!photos.length) {
      const message = document.createElement("p"); message.className = "photo-message";
      message.textContent = photoIndexAvailable ? "No photos available for this point." : "The photo index could not load. Please refresh to try again.";
      content.append(message);
    }
    photos.forEach((file, index) => {
      const url = "./data/images/" + file.split("/").map(encodeURIComponent).join("/");
      const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener";
      link.title = "Open full-size photo";
      const img = document.createElement("img"); img.src = url; img.alt = `${name} — photo ${index + 1}`;
      img.loading = "lazy"; img.decoding = "async"; img.className = "point-photo";
      img.addEventListener("error", () => { link.replaceWith(document.createTextNode("Photo unavailable.")); });
      link.append(img); content.append(link);
    });
    return content;
  }
  async function loadPoints() {
    try {
      const [data, manifest] = await Promise.all([
        loadGeoJSON("./data/signage.json"),
        fetch("./data/image-manifest.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
          .catch(() => { photoIndexAvailable = false; return {}; })
      ]);
      imageManifest = manifest;
      const groups = new Map();
      data.features.filter((f) => f.geometry?.type === "Point").forEach((feature) => {
        const p = feature.properties || {};
        const category = value(p.Category ?? p.category);
        if (!groups.has(category)) groups.set(category, L.featureGroup().addTo(map));
        const [lng, lat] = feature.geometry.coordinates;
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({ className: "point-marker", html: pointSymbol(category), iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -18] }),
          title: value(p.Name), alt: `${value(p.Name)} (${category})`, riseOnHover: true
        });
        marker.bindTooltip(value(p.Name), { direction: "top", offset: [0, -16] });
        marker.bindPopup(() => pointPopup(feature), { maxWidth: 310, minWidth: 240, maxHeight: 340 });
        groups.get(category).addLayer(marker);
      });
      const combined = L.featureGroup();
      groups.forEach((group, category) => {
        layers.addOverlay(group, `Points · ${category}`);
        group.eachLayer((marker) => combined.addLayer(marker));
        const row = document.createElement("div"); row.className = "legend-row point-legend-row";
        const icon = document.createElement("span"); icon.innerHTML = pointSymbol(category);
        row.append(icon, document.createTextNode(`${category} (${group.getLayers().length})`));
        $("point-legend").append(row);
      });
      pointBounds = combined.getBounds();
    } catch (error) {
      $("point-status").hidden = false;
      $("point-status").textContent = "Point data could not load. Trails and boundaries remain available.";
      console.error("Point data:", error);
    }
  }

  function styleFor(feature) {
    const info = analysisMode ? riskInfo(feature) : typeInfo(feature.properties?.Trail_Type);
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
    if (analysisMode) {
      const row = document.createElement("p"); row.className = "popup-row";
      row.textContent = `Erosion risk: ${riskInfo(feature).label} · Score: ${Number.isFinite(riskScore(feature)) ? riskScore(feature).toFixed(2) : "Not provided"}`;
      container.append(row);
    }
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
      const p = feature.properties || {}, info = analysisMode ? riskInfo(feature) : typeInfo(p.Trail_Type);
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
    if (analysisMode) {
      const heading = document.createElement("strong"); heading.className = "risk-heading";
      heading.textContent = "Erosion Risk · Natural Breaks"; $("legend-items").append(heading);
      riskBreaks.forEach((upper, i) => {
        const row = document.createElement("div"); row.className = "legend-row";
        const lower = i === 0 ? Math.min(...features.map(riskScore).filter(Number.isFinite)) : riskBreaks[i - 1];
        row.append(swatch(RISK_CLASSES[i]), document.createTextNode(`${RISK_CLASSES[i].label}: ${i ? "> " : ""}${lower.toFixed(2)} – ${upper.toFixed(2)}`));
        $("legend-items").append(row);
      });
      if (filtered.some((f) => !Number.isFinite(riskScore(f)))) {
        const row = document.createElement("div"); row.className = "legend-row";
        row.append(swatch({ color: "#7c8582" }), document.createTextNode("No risk data")); $("legend-items").append(row);
      }
      if (flowMetadata) {
        const label = document.createElement("p"); label.textContent = "FlowAcc_Log · 0.5% clip / Gamma 1";
        const ramp = document.createElement("div"); ramp.className = "flow-ramp";
        const range = document.createElement("div"); range.className = "flow-range";
        range.textContent = `${flowMetadata.stretch[0].toFixed(2)} (light) → ${flowMetadata.stretch[1].toFixed(2)} (blue)`;
        $("legend-items").append(label, ramp, range);
      }
    } else [...new Set(filtered.map((f) => f.properties?.Trail_Type))].forEach((type) => {
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
    const bottom = mobile && legend.open ? Math.min(legend.offsetHeight + 45, map.getSize().y * 0.45) : 45;
    map.fitBounds(fullBounds, {
      paddingTopLeft: [35, 65], paddingBottomRight: [right, bottom],
      maxZoom: 17, animate: false
    });
  }
  $("fit-bounds").addEventListener("click", fitFullExtent);

  async function loadTrails() {
    try {
      const data = await loadGeoJSON("./data/roadSurvey_ErosionRisk.geojson");
      data.features.forEach((f) => {
        const p = f.properties || (f.properties = {});
        p.Trail_Type = p.Trail_Type ?? p["Trail Type"];
        p.Trail_Name = p.Trail_Name ?? p["Trail Name"];
        p.Surface_Type = p.Surface_Type ?? p["Surface Type"];
      });
      features = data.features.filter((f) => f.geometry && ["LineString", "MultiLineString"].includes(f.geometry.type));
      riskBreaks = window.naturalBreaks(features.map(riskScore), 3);
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
  async function loadFlowOverlay() {
    try {
      const response = await fetch("./data/analysis/flowacc-overlay.json");
      if (!response.ok) throw new Error(response.status);
      flowMetadata = await response.json();
      flowOverlay = L.imageOverlay("./data/analysis/flowacc-overlay.png", flowMetadata.bounds, { pane: "flowPane", attribution: "FlowAcc_Log · Field GIS data", interactive: false });
      await new Promise((resolve, reject) => {
        const image = new Image(); image.onload = resolve; image.onerror = reject;
        image.src = "./data/analysis/flowacc-overlay.png";
      });
      $("analysis-toggle").disabled = false;
    } catch (error) {
      $("analysis-toggle").textContent = "Analysis basemap unavailable";
      console.error("Flow accumulation:", error);
    }
  }
  $("analysis-toggle").addEventListener("click", () => {
    analysisMode = !analysisMode;
    $("analysis-toggle").setAttribute("aria-pressed", String(analysisMode));
    $("analysis-toggle").textContent = analysisMode ? "Back to trail explorer" : "Erosion risk analysis";
    $("map").classList.toggle("analysis-map", analysisMode);
    if (analysisMode) { map.removeLayer(base); flowOverlay.addTo(map); $("tile-status").hidden = true; }
    else { map.removeLayer(flowOverlay); base.addTo(map); }
    render();
  });
  loadFlowOverlay();
  // Set the opening view once both requests finish, independent of their order.
  Promise.all([loadTrails(), loadBoundary(), loadPoints()]).then(() => {
    fullBounds = boundaryBounds?.isValid() ? boundaryBounds : trailBounds?.isValid() ? trailBounds : pointBounds;
    fitFullExtent();
  });
})();
