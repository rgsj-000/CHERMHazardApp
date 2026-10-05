import { cpSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function copy(src,dst){const from=resolve(root,src),to=resolve(root,dst);if(!existsSync(from))throw new Error(`Missing dependency asset: ${src}`);mkdirSync(dirname(to),{recursive:true});copyFileSync(from,to);console.log(`${src} -> ${dst}`);}
copy('node_modules/leaflet/dist/leaflet.js','vendor/leaflet/leaflet.js');
copy('node_modules/leaflet/dist/leaflet.css','vendor/leaflet/leaflet.css');
const images=resolve(root,'node_modules/leaflet/dist/images');if(existsSync(images))cpSync(images,resolve(root,'vendor/leaflet/images'),{recursive:true});
copy('node_modules/geotiff/dist-browser/geotiff.js','vendor/geotiff/geotiff.js');
