import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('README documents offline and online launch paths',async()=>{
  const readme=await readFile(new URL('../README.md',import.meta.url),'utf8');
  assert.match(readme,/start\.bat/i); assert.match(readme,/GitHub Pages/i); assert.match(readme,/offline/i);
  assert.match(readme,/susceptibility/i); assert.match(readme,/not.*calibrated probability/i);
});

test('vendor automation copies pinned Leaflet and GeoTIFF browser assets',async()=>{
  const script=await readFile(new URL('../tools/vendor-assets.mjs',import.meta.url),'utf8');
  assert.match(script,/leaflet\/dist\/leaflet\.js/); assert.match(script,/geotiff\/dist-browser\/geotiff\.js/);
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.dependencies.leaflet,'1.9.4'); assert.equal(pkg.dependencies.geotiff,'2.1.3'); assert.equal(pkg.scripts.vendor,'node tools/vendor-assets.mjs');
});

test('runtime HTML contains no CDN dependency',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/i);
});
