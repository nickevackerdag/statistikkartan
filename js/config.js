/* global window */
window.MAP_VIEWER_CONFIG = {
  title: "Data på karta",
  subtitle: "Generisk visning av datapunkter",

  // Indata: CSV (rubriker krävs). Relativ sökväg från index.html.
  dataFile: "data/villaprisdata.tsv",
  dataFormat: "tsv", // "csv" | "tsv" | "json"

  // Kolumnnamn i indatafilen
  columns: {
    lat: "lat",
    lon: "long",
    description: "Gatuadress"
  },

  // En eller flera visningskolumner.
  // - key: kolumnnamnet i CSV/JSON
  // - label: vad som visas i UI/popup
  metrics: [
    { key: "Försäljningspris", label: "Försäljningspris" },
    { key: "Kronor/m²", label: "Kronor/m²" },
    { key: "Tomtyta", label: "Tomtyta" }
  ],

  // Startval för metric (index i metrics)
  defaultMetricIndex: 0,

  // Kartinställningar
  map: {
    startView: { lat: 62.5, lon: 16.5, zoom: 5 }, // fallback om vi inte kan "fit bounds"
    markerRadius: 7,
    markerOpacity: 0.9,
    markerStrokeOpacity: 0.75
  }
};
