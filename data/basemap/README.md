# Offline basemap

The application does not require a street basemap to model or display hazards. When offline, it uses a neutral map background unless the user loads an optional local georeferenced GeoTIFF basemap from the Basemap panel.

For the first release the local basemap reader uses the first GeoTIFF band and displays it as grayscale. Keep the local basemap in a geographic coordinate system compatible with Leaflet and the analysis rasters.
