/* Consentimiento de servicios opcionales. Se carga antes de los modulos de la aplicacion. */
(function () {
  const STORAGE_KEY = 'nolli_cookie_consent';
  const FONT_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=League+Spartan:wght@600;700;800;900&display=swap';
  let consent = readConsent();
  let dialog = null;
  let opener = null;

  function readConsent() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return value && value.version === 1 ? value : null;
    } catch {
      return null;
    }
  }

  function hasConsent(category) {
    if (category === 'necesarias') return true;
    return Boolean(readConsent()?.[category]);
  }

  function applyFontPreference() {
    const fontLink = document.getElementById('nolli-external-fonts');
    if (hasConsent('tipografia_externa')) {
      if (!fontLink) {
        const link = document.createElement('link');
        link.id = 'nolli-external-fonts';
        link.rel = 'stylesheet';
        link.href = FONT_URL;
        document.head.appendChild(link);
      }
      document.documentElement.classList.remove('nolli-local-fonts');
    } else {
      fontLink?.remove();
      document.documentElement.classList.add('nolli-local-fonts');
    }
  }

  function save(preferences) {
    consent = {
      version: 1,
      necesarias: true,
      mapa_terceros: Boolean(preferences.mapa_terceros),
      tipografia_externa: Boolean(preferences.tipografia_externa),
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    applyFontPreference();
    window.dispatchEvent(new CustomEvent('nolli:cookie-consent', { detail: consent }));
  }

  function focusableElements() {
    return Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], select, textarea, [tabindex]:not([tabindex="-1"])'));
  }

  function trapFocus(event) {
    if (event.key === 'Escape') {
      if (consent) close();
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = focusableElements();
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function close() {
    if (!consent || !dialog) return;
    dialog.remove();
    dialog = null;
    opener?.focus();
  }

  function openConfiguration() {
    opener = document.activeElement;
    if (dialog) return;
    const saved = readConsent();
    dialog = document.createElement('section');
    dialog.className = 'nolli-consent-backdrop';
    dialog.innerHTML = `
      <div class="nolli-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="nolli-consent-title" aria-describedby="nolli-consent-description">
        <p class="nolli-consent-kicker">CONFIGURACIÓN // COOKIES Y ALMACENAMIENTO</p>
        <h2 id="nolli-consent-title">CONTROL DE SERVICIOS EXTERNOS</h2>
        <p id="nolli-consent-description">NOLLI usa almacenamiento técnico necesario. Puedes decidir si autorizas los servicios externos de mapa y tipografía.</p>
        <div class="nolli-consent-actions">
          <button type="button" data-consent-action="accept">ACEPTAR TODO</button>
          <button type="button" data-consent-action="reject">RECHAZAR TODO</button>
          <button type="button" data-consent-action="configure" aria-expanded="false">CONFIGURAR</button>
        </div>
        <div class="nolli-consent-preferences" hidden>
          <label><input type="checkbox" checked disabled> <span><strong>NECESARIAS</strong><small>Sesión, seguridad y preferencias técnicas.</small></span></label>
          <label><input id="nolli-consent-map" type="checkbox" ${saved?.mapa_terceros ? 'checked' : ''}> <span><strong>MAPA DE TERCEROS</strong><small>Teselas de Mapbox y telemetría de Mapbox Events.</small></span></label>
          <label><input id="nolli-consent-fonts" type="checkbox" ${saved?.tipografia_externa ? 'checked' : ''}> <span><strong>TIPOGRAFÍA EXTERNA</strong><small>Solicitud de fuentes a Google Fonts.</small></span></label>
          <button type="button" data-consent-action="save">GUARDAR PREFERENCIAS</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    const configPanel = dialog.querySelector('.nolli-consent-preferences');
    const configButton = dialog.querySelector('[data-consent-action="configure"]');
    dialog.addEventListener('keydown', trapFocus);
    dialog.addEventListener('click', (event) => {
      const action = event.target.closest('[data-consent-action]')?.dataset.consentAction;
      if (!action) return;
      if (action === 'configure') {
        configPanel.hidden = false;
        configButton.setAttribute('aria-expanded', 'true');
        dialog.querySelector('#nolli-consent-map').focus();
      } else if (action === 'accept') {
        save({ mapa_terceros: true, tipografia_externa: true });
        close();
      } else if (action === 'reject') {
        save({ mapa_terceros: false, tipografia_externa: false });
        close();
      } else if (action === 'save') {
        save({
          mapa_terceros: dialog.querySelector('#nolli-consent-map').checked,
          tipografia_externa: dialog.querySelector('#nolli-consent-fonts').checked,
        });
        close();
      }
    });
    requestAnimationFrame(() => dialog.querySelector('[data-consent-action="accept"]').focus());
  }

  function addSettingsButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nolli-cookie-settings';
    button.textContent = 'COOKIES';
    button.addEventListener('click', openConfiguration);
    document.body.appendChild(button);
  }

  window.nolliHasConsent = hasConsent;
  applyFontPreference();
  document.addEventListener('DOMContentLoaded', () => {
    addSettingsButton();
    if (!consent) openConfiguration();
  });
}());
