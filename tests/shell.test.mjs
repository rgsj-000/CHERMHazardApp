import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('application shell uses local runtime assets and required controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /vendor\/leaflet\/leaflet\.css/);
  assert.match(html, /vendor\/leaflet\/leaflet\.js/);
  assert.match(html, /vendor\/geotiff\/geotiff\.js/);
  for (const id of ['map', 'municipality', 'barangay', 'status']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.doesNotMatch(html, /unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/i);
});
