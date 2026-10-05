# Administrative boundaries

Municipality and Barangay boundaries are loaded by the user as GeoJSON FeatureCollections.

The first release automatically recognizes common municipality fields such as `MUNICIPALITY`, `Municipality`, `ADM3_EN`, `MUN_NAME`, and `NAME_3`. Common Barangay fields include `BARANGAY`, `BRGY_NAME`, `ADM4_EN`, and `NAME_4`.

Barangay features must also contain a municipality-name field so the Barangay dropdown can be filtered to the selected Municipality.
