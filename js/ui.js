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
  const node = el('progressBar'); if (node) node.style.width = `${clampProgress(percent)}%`;
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
