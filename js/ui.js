export function clampProgress(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
function el(id) { return typeof document === 'undefined' ? null : document.getElementById(id); }
export function setStatus(message, level = 'info') {
  const node = el('status'); if (!node) return;
  node.textContent = String(message); node.className = `status ${level}`;
}
export function setProgress(percent) {
  const value=clampProgress(percent);
  const node = el('progressBar'); if (node) node.style.width = `${value}%`;
  el('modelProgress')?.setAttribute('aria-valuenow',String(value));
  const label=el('progressValue');if(label)label.textContent=`${Math.round(value)}%`;
}
export function setMapContext({municipality,barangay,floodPeriod,hasFlood=false,inputCount=0}) {
  const area=el('mapArea'),period=el('mapPeriod'),overview=el('dataOverview');
  if(area)area.textContent=municipality?[barangay,municipality].filter(Boolean).join(', '):'Quezon Province';
  if(period)period.textContent=floodPeriod?`${floodPeriod}-year flood`:hasFlood?'Custom flood raster':'No flood raster';
  if(overview)overview.textContent=`${inputCount} raster inputs loaded`;
}
export function appendLog(message) {
  const node = el('log'); if (!node) return;
  const stamp = new Date().toLocaleTimeString();
  node.textContent += `[${stamp}] ${message}\n`; node.scrollTop = node.scrollHeight;
}
export function setOnlineStatus(isOnline, source = '') {
  const node = el('onlineStatus'); if (!node) return;
  node.textContent = `${isOnline ? 'ONLINE' : 'OFFLINE'}${source ? ` · ${source}` : ''}`;
  node.dataset.online = String(Boolean(isOnline));
}
export function setDiagnostics(html) { const node=el('diagnostics'); if(node) node.innerHTML=html; }
export function syncRangeAndNumber(range, number) {
  range.addEventListener('input', () => { number.value = range.value; });
  number.addEventListener('input', () => { range.value = number.value; });
}
