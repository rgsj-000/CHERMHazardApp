export const appState = {
  rasters: {},
  mapLayers: {},
  boundaries: { municipalityGeoJSON: null, barangayGeoJSON: null, index: null },
  selection: { municipality: null, barangay: null, geometry: null },
  model: { futureLandcover: null, futureLandslide: null, futureFlood: null },
  map: null,
  layerControl: null,
  running: false
};
