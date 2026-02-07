/* global L, window, fetch */

(function(){
  "use strict";

  const CFG = window.MAP_VIEWER_CONFIG;
  if(!CFG) {
    document.body.innerHTML = "<p style='padding:20px'>Saknar MAP_VIEWER_CONFIG i config.js</p>";
    return;
  }

  const $ = (sel) => document.querySelector(sel);
  const statusEl = $("#status");
  const fitBtn = $("#fitBtn");

  $("#title").textContent = CFG.title || "Data på karta";
  $("#subtitle").textContent = CFG.subtitle || "";

  // Starkare, men samma ordning: blå → gul → orange → röd
  const COLORS = {
    q1: "#3B82F6", // klar blå
    q2: "#FACC15", // klar gul
    q3: "#F97316", // klar orange
    q4: "#EF4444"  // klar röd
  };

  function setStatus(text){
    if(statusEl) statusEl.textContent = text;
  }

  // ---------- Delimited parsing (CSV/TSV) ----------
  function parseDelimited(text, delimiter){
    const rows = [];
    let i = 0;
    let field = "";
    let row = [];
    let inQuotes = false;

    function endField(){ row.push(field); field = ""; }
    function endRow(){
      if(row.length === 1 && row[0] === "") { row = []; return; }
      rows.push(row);
      row = [];
    }

    while(i < text.length){
      const c = text[i];

      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }

      if(c === '"'){ inQuotes = true; i++; continue; }
      if(c === delimiter){ endField(); i++; continue; }
      if(c === "\r"){ i++; continue; }
      if(c === "\n"){ endField(); endRow(); i++; continue; }

      field += c; i++;
    }

    endField();
    if(row.length) endRow();

    if(rows.length === 0) return { headers: [], data: [] };

    const headers = rows[0].map(h => String(h || "").trim());
    const data = rows.slice(1).map(r => {
      const obj = {};
      for(let k=0; k<headers.length; k++){
        obj[headers[k]] = (r[k] != null ? String(r[k]).trim() : "");
      }
      return obj;
    });

    return { headers, data };
  }

  // ---------- Data loading ----------
  async function loadData(){
    const res = await fetch(CFG.dataFile, { cache: "no-store" });
    if(!res.ok) throw new Error(`Kunde inte hämta datafil: ${CFG.dataFile} (${res.status})`);
    const text = await res.text();

    const fmt = String(CFG.dataFormat || "csv").toLowerCase();

    if(fmt === "json"){
      const arr = JSON.parse(text);
      if(!Array.isArray(arr)) throw new Error("JSON måste vara en array av objekt.");
      return arr;
    }

    if(fmt === "tsv"){
      const { data } = parseDelimited(text, "\t");
      return data;
    }

    const { data } = parseDelimited(text, ",");
    return data;
  }

  // ---------- Helpers ----------
  function toNumber(v){
    if(v == null) return null;
    let s = String(v);

    // Trim + ta bort "osynliga" mellanslag (NBSP, narrow NBSP, thin space)
    s = s.replace(/[\u00A0\u202F\u2009]/g, " ").trim();
    if(!s) return null;

    // Ta bort spaces
    let t = s.replace(/\s+/g, "");

    // Tillåt bara siffror + separators + minus
    t = t.replace(/[^0-9,.\-]/g, "");
    if(!t) return null;

    const hasComma = t.includes(",");
    const hasDot = t.includes(".");

    if(hasComma && hasDot){
      const lastComma = t.lastIndexOf(",");
      const lastDot = t.lastIndexOf(".");
      if(lastComma > lastDot){
        t = t.replace(/\./g, "").replace(",", ".");
      }else{
        t = t.replace(/,/g, "");
      }
    }else if(hasComma && !hasDot){
      t = t.replace(",", ".");
    }

    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function getColumn(obj, colName){
    return obj && colName ? obj[colName] : undefined;
  }

  function quantile(sorted, q){
    if(sorted.length === 0) return null;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const a = sorted[base];
    const b = sorted[Math.min(base + 1, sorted.length - 1)];
    return a + rest * (b - a);
  }

  function computeQuartiles(values){
    const sorted = values.slice().sort((a,b)=>a-b);
    const q1 = quantile(sorted, 0.25);
    const q2 = quantile(sorted, 0.50);
    const q3 = quantile(sorted, 0.75);
    return { q1, q2, q3, min: sorted[0], max: sorted[sorted.length-1] };
  }

  function colorForValue(v, qs){
    if(v == null || !Number.isFinite(v)) return "#9aa7b7";
    if(qs.q1 == null) return COLORS.q1;
    if(v <= qs.q1) return COLORS.q1;
    if(v <= qs.q2) return COLORS.q2;
    if(v <= qs.q3) return COLORS.q3;
    return COLORS.q4;
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function buildPinSvg(color){
    // Din SVG, men med dynamisk fill på "pinnen"
    // Obs: inga radbrytningar krävs, men de gör det lättare att läsa.
    return `
  <svg width="100%" height="100%" viewBox="0 0 35 42" xmlns="http://www.w3.org/2000/svg" xml:space="preserve"
    style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
    <g transform="matrix(0.0172058,0,0,0.0172058,-0.412939,-0.412939)">
      <path d="M315.377,1729.31c-180.027,-180.85 -291.377,-430.18 -291.377,-705.31c0,-551.915 448.085,-1000 1000,-1000c551.91,0 1000,448.085 1000,1000c0,275.13 -111.35,524.46 -291.38,705.31l0.28,0l-708.9,710.69l-708.904,-710.69l0.281,0Z"
        style="fill:${color};"/>
    </g>
    <g transform="matrix(0.0205482,0,0,0.0210702,-8.05327,-4.29364)">
      <ellipse cx="1229.26" cy="1020.37" rx="418.669" ry="408.295" style="fill:#fff;"/>
    </g>
  </svg>`.trim();
  }

  function makePinIcon(color, sizePx){
    // sizePx = bredd på ikonen i px. Höjden följer viewBox proportionen (42/35).
    const w = sizePx;
    const h = Math.round(sizePx * (42 / 35));

    const html = `
      <div class="pinMarker" style="width:${w}px;height:${h}px">
        ${buildPinSvg(color)}
      </div>
    `.trim();

    return L.divIcon({
      className: "",          // ingen Leaflet-standardklass (vi styr helt själva)
      html,
      iconSize: [w, h],
      iconAnchor: [Math.round(w/2), h],        // spetsen nere i mitten
      popupAnchor: [0, -Math.round(h*0.85)]    // popup ovanför markören
    });
  }

  function buildPopup(row){
    const descCol = CFG.columns.description;
    const desc = getColumn(row, descCol) ?? "";

    const lines = [];
    lines.push(`<div class="popup">`);
    if(desc) lines.push(`<div class="popupDesc"><strong>${escapeHtml(desc)}</strong></div>`);

    lines.push(`<div class="popupList">`);
    for(const m of CFG.metrics){
      const raw = getColumn(row, m.key);
      const num = toNumber(raw);
      const val = (num != null) ? num : (raw ?? "");
      lines.push(
        `<div class="popupRow">
          <span class="popupKey">${escapeHtml(m.label || m.key)}</span>
          <span class="popupVal">${escapeHtml(val)}</span>
        </div>`
      );
    }
    lines.push(`</div></div>`);
    return lines.join("");
  }

  function legendItem(color, label, range){
    return `
      <div class="legendItem">
        <div class="legendLeft">
          <span class="swatch" style="background:${color}"></span>
          <span>${escapeHtml(label)}</span>
        </div>
        <span class="code">${escapeHtml(range)}</span>
      </div>
    `;
  }

  function renderLegendInto(el, qs){
    if(!el) return;
    const fmt = (x) => (x == null ? "–" : (Math.round(x * 100) / 100).toString());
    el.innerHTML = [
      legendItem(COLORS.q1, "≤ Q1", `≤ ${fmt(qs.q1)}`),
      legendItem(COLORS.q2, "Q1–Q2", `≤ ${fmt(qs.q2)}`),
      legendItem(COLORS.q3, "Q2–Q3", `≤ ${fmt(qs.q3)}`),
      legendItem(COLORS.q4, "> Q3", `≤ ${fmt(qs.max)}`)
    ].join("");
  }

  function round2(x){
    if(x == null) return "–";
    return (Math.round(x * 100) / 100).toString();
  }

  // ---------- Leaflet map ----------
  const map = L.map("map", { zoomControl: true });

  const baseOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  });

  const baseSat = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "Tiles &copy; Esri" }
  );

  let isSatellite = false;
  baseOSM.addTo(map);

  function applyBasemap(){
    if(isSatellite){
      if(map.hasLayer(baseOSM)) map.removeLayer(baseOSM);
      if(!map.hasLayer(baseSat)) map.addLayer(baseSat);
    }else{
      if(map.hasLayer(baseSat)) map.removeLayer(baseSat);
      if(!map.hasLayer(baseOSM)) map.addLayer(baseOSM);
    }
  }

  // ---------- Map UI controls ----------
  let metricSelectEl = null;
  let metricValueEl = null;
  let basemapBtnEl = null;
  let legendBtnEl = null;

  let legendPanelEl = null;
  let legendBodyEl = null;
  let legendCloseEl = null;

  const MapUiControl = L.Control.extend({
    options: { position: "topright" },
    onAdd: function(){
      const wrap = L.DomUtil.create("div", "leaflet-control mapui");

      wrap.innerHTML = `
        <div class="mapuiStack">
          <div class="mapuiSelect" aria-label="Välj serie">
            <div class="mapuiSelectLabel">Serie</div>
            <div class="mapuiSelectValue" id="metricValue">--</div>
            <select id="metricSelect" aria-label="Serie"></select>
          </div>

          <button type="button" class="mapuiFab" id="bgToggle" aria-label="Växla bakgrund" title="Växla karta/satellit">
            <img src="images/toggle-bg-button-red-on-white.svg" alt="">
          </button>

          <button type="button" class="mapuiFab" id="legendToggle" aria-label="Visa legend" title="Visa legend">
            <span class="legendIcon" aria-hidden="true"></span>
          </button>
        </div>
      `;

      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      metricSelectEl = wrap.querySelector("#metricSelect");
      metricValueEl = wrap.querySelector("#metricValue");
      basemapBtnEl = wrap.querySelector("#bgToggle");
      legendBtnEl = wrap.querySelector("#legendToggle");

      return wrap;
    }
  });

  const LegendPanelControl = L.Control.extend({
    options: { position: "topright" },
    onAdd: function(){
      const panel = L.DomUtil.create("div", "leaflet-control legendpanel hidden");
      panel.innerHTML = `
        <div class="legendpanelHeader">
          <div class="legendpanelTitle">Legend</div>
          <button type="button" class="legendpanelClose" id="legendClose" aria-label="Stäng">×</button>
        </div>
        <div class="legend" id="legendMap"></div>
      `;

      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);

      legendPanelEl = panel;
      legendBodyEl = panel.querySelector("#legendMap");
      legendCloseEl = panel.querySelector("#legendClose");

      return panel;
    }
  });

  map.addControl(new MapUiControl());
  map.addControl(new LegendPanelControl());

  function setLegendOpen(open){
    if(!legendPanelEl) return;
    legendPanelEl.classList.toggle("hidden", !open);
  }

  // ---------- State ----------
  let rawRows = [];
  let markersLayer = L.layerGroup().addTo(map);
  let currentMetricIndex = Math.max(0, Math.min(CFG.defaultMetricIndex || 0, (CFG.metrics.length || 1) - 1));
  let lastBounds = null;

  function buildMetricDropdown(){
    if(!metricSelectEl) return;

    metricSelectEl.innerHTML = "";

    (CFG.metrics || []).forEach((m, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = m.label || m.key;
      metricSelectEl.appendChild(opt);
    });

    metricSelectEl.value = String(currentMetricIndex);
    metricSelectEl.disabled = !CFG.metrics || CFG.metrics.length <= 1;

    const setValueLabel = () => {
      const m = CFG.metrics[currentMetricIndex];
      if(metricValueEl) metricValueEl.textContent = (m && (m.label || m.key)) ? (m.label || m.key) : "--";
    };
    setValueLabel();

    metricSelectEl.addEventListener("change", () => {
      const idx = Number(metricSelectEl.value);
      if(Number.isFinite(idx) && idx >= 0 && idx < CFG.metrics.length){
        currentMetricIndex = idx;
        setValueLabel();
        redrawMarkers();
      }
    });
  }

  function redrawMarkers(){
    markersLayer.clearLayers();

    const latCol = CFG.columns.lat;
    const lonCol = CFG.columns.lon;
    const metric = CFG.metrics[currentMetricIndex];

    const numericValues = [];
    const validPoints = [];

    for(const row of rawRows){
      const lat = toNumber(getColumn(row, latCol));
      const lon = toNumber(getColumn(row, lonCol));
      if(lat == null || lon == null) continue;

      const v = toNumber(getColumn(row, metric.key));
      if(v != null) numericValues.push(v);

      validPoints.push({ row, lat, lon, v });
    }

    const qs = computeQuartiles(numericValues);
    renderLegendInto(legendBodyEl, qs);

    const bounds = [];
    const baseRadius = (CFG.map?.markerRadius ?? 7);
    const radius = baseRadius * 1.5; // 50% större

    for(const p of validPoints){
      const color = colorForValue(p.v, qs);

      // Behåll din "50% större"-logik men i px för pin-ikon
      const base = (CFG.map?.markerRadius ?? 7);
      const sizePx = Math.round(base * 1.5 * 4); // 7→42px-ish. Justera faktor vid behov.

      const icon = makePinIcon(color, sizePx);

      const marker = L.marker([p.lat, p.lon], { icon });

      marker.bindPopup(buildPopup(p.row), { maxWidth: 340 });
      marker.addTo(markersLayer);

      bounds.push([p.lat, p.lon]);
    }

    if(bounds.length){
      lastBounds = L.latLngBounds(bounds);
      setStatus(
        `Punkter: ${bounds.length}\n` +
        `Aktiv kolumn: ${(metric && (metric.label || metric.key)) ? (metric.label || metric.key) : "--"}\n` +
        `Kvartiler: Q1=${round2(qs.q1)} Q2=${round2(qs.q2)} Q3=${round2(qs.q3)}`
      );
    }else{
      setStatus("Inga giltiga punkter (kontrollera kolumner för lat/lon och att data är numerisk där det behövs).");
    }
  }

  function fitToData(){
    if(lastBounds && lastBounds.isValid()){
      map.fitBounds(lastBounds.pad(0.08));
      return;
    }
    const sv = CFG.map?.startView;
    map.setView([sv.lat, sv.lon], sv.zoom);
  }

  if(fitBtn) fitBtn.addEventListener("click", fitToData);

  // ---------- Boot ----------
  (async function main(){
    try{
      setStatus("Laddar data…");
      rawRows = await loadData();

      buildMetricDropdown();
      redrawMarkers();
      fitToData();

      // bakgrundstoggle (rund knapp med SVG)
      if(basemapBtnEl){
        basemapBtnEl.addEventListener("click", () => {
          isSatellite = !isSatellite;
          applyBasemap();
        });
      }

      // legend-knappar
      if(legendBtnEl){
        legendBtnEl.addEventListener("click", () => {
          const open = legendPanelEl ? legendPanelEl.classList.contains("hidden") : true;
          setLegendOpen(open);
        });
      }
      if(legendCloseEl){
        legendCloseEl.addEventListener("click", () => setLegendOpen(false));
      }

    }catch(err){
      console.error(err);
      setStatus("Fel:\n" + (err && err.message ? err.message : String(err)));
    }
  })();

})();