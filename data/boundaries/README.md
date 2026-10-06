# Administrative boundaries

`municipality.geojson` and `barangay.geojson` contain the bundled RSTW2026 boundaries in WGS 84 longitude/latitude. The app loads them automatically. Original UTM GeoJSON and shapefile exports are kept in `data/source/rstw2026/boundaries/`.

Users can replace either input with a GeoJSON FeatureCollection from the file controls.

The first release automatically recognizes common municipality fields such as `MUNICIPALITY`, `Municipality`, `ADM3_EN`, `MUN_NAME`, and `NAME_3`. Common Barangay fields include `BARANGAY`, `BRGY_NAME`, `ADM4_EN`, and `NAME_4`.

Barangay features must also contain a municipality-name field so the Barangay dropdown can be filtered to the selected Municipality. The supplied `Municipali` field is supported.
