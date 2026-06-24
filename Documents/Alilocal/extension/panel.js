/**
 * Locali — Panel helpers
 * Utilidades compartidas para el panel lateral.
 * La lógica principal del panel vive en content.js.
 * Este archivo puede ser extendido para lógica más compleja del panel.
 */

/**
 * Inyectar o actualizar el panel en el DOM.
 * @param {string} html - HTML interior del panel
 */
function aliLocalUpdatePanel(html) {
  let panel = document.getElementById('locali-panel');
  if (!panel) return;
  let body = panel.querySelector('.locali-body');
  if (!body) return;
  body.innerHTML = html;
}

/**
 * Mostrar/ocultar el panel.
 * @param {boolean} visible
 */
function aliLocalSetVisible(visible) {
  const panel = document.getElementById('locali-panel');
  if (!panel) return;
  if (visible) {
    panel.classList.remove('locali-hidden');
  } else {
    panel.classList.add('locali-hidden');
  }
}

/**
 * Formatear precio en ILS con símbolo ₪
 * @param {number} amount
 * @returns {string}
 */
function aliLocalFormatILS(amount) {
  if (!amount && amount !== 0) return '—';
  return `₪${parseFloat(amount).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Formatear precio en USD
 * @param {number} amount
 * @returns {string}
 */
function aliLocalFormatUSD(amount) {
  if (!amount && amount !== 0) return '—';
  return `$${parseFloat(amount).toFixed(2)}`;
}

// Exportar para uso desde content.js si se carga como módulo
if (typeof module !== 'undefined') {
  module.exports = { aliLocalUpdatePanel, aliLocalSetVisible, aliLocalFormatILS, aliLocalFormatUSD };
}
