/* =========================================================================
   MOBILEBOTTOMNAV.JS — Controlador de navegación inferior táctil (<= 768px)
   Transición instantánea entre vistas (0.2s), exclusión mutua y backdrop
   ========================================================================= */

import { state } from './state.js';

export function initMobileBottomNav() {
  const bottomBar = document.getElementById('mobile-bottom-bar');
  const panelBackdrop = document.getElementById('panel-backdrop');

  const btnSearch = document.getElementById('mobile-nav-search');
  const btnFilters = document.getElementById('mobile-nav-filters');
  const btnPlaces = document.getElementById('mobile-nav-places');
  const btnLayers = document.getElementById('mobile-nav-layers');

  const searchPanel = document.getElementById('search-panel');
  const filterPanel = document.getElementById('filter-panel');
  const myPlacesPanel = document.getElementById('my-places-panel');
  const mapStylePanel = document.getElementById('map-style-panel');
  const adminPanel = document.getElementById('admin-panel');
  const sheet = document.getElementById('sheet');

  const allPanels = [searchPanel, filterPanel, myPlacesPanel, mapStylePanel, adminPanel, sheet].filter(Boolean);
  const allNavButtons = [btnSearch, btnFilters, btnPlaces, btnLayers].filter(Boolean);

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function syncNavButtons() {
    if (!isMobile()) return;

    btnSearch?.classList.toggle('active', Boolean(searchPanel?.classList.contains('open')));
    btnFilters?.classList.toggle('active', Boolean(filterPanel?.classList.contains('open')));
    btnPlaces?.classList.toggle('active', Boolean(myPlacesPanel?.classList.contains('open')));
    btnLayers?.classList.toggle('active', Boolean(mapStylePanel?.classList.contains('open')));

    const hasAnyOpen = allPanels.some((panel) => panel.classList.contains('open'));
    if (panelBackdrop) {
      panelBackdrop.classList.toggle('active', hasAnyOpen);
    }
  }

  function closeAllPanels(except = null) {
    allPanels.forEach((panel) => {
      if (panel !== except && panel.classList.contains('open')) {
        panel.classList.remove('open');
      }
    });
    syncNavButtons();
  }

  function toggleMobilePanel(targetPanel, focusInput = null) {
    if (!targetPanel) return;

    const isCurrentlyOpen = targetPanel.classList.contains('open');

    // Cerrar los demás al instante
    closeAllPanels(isCurrentlyOpen ? null : targetPanel);

    if (isCurrentlyOpen) {
      targetPanel.classList.remove('open');
      if (panelBackdrop) panelBackdrop.classList.remove('active');
    } else {
      targetPanel.classList.add('open');
      if (panelBackdrop) panelBackdrop.classList.add('active');
      if (focusInput) {
        setTimeout(() => focusInput.focus(), 120);
      }
      document.dispatchEvent(new CustomEvent('radar:cerrar-ficha'));
    }

    syncNavButtons();
  }

  // Eventos de botones táctiles inferiores
  if (btnSearch) {
    btnSearch.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(searchPanel, document.getElementById('building-search'));
    });
  }

  if (btnFilters) {
    btnFilters.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(filterPanel);
    });
  }

  if (btnPlaces) {
    btnPlaces.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(myPlacesPanel);
    });
  }

  if (btnLayers) {
    btnLayers.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobilePanel(mapStylePanel);
    });
  }

  // Cierre táctil al tocar fuera (Backdrop)
  if (panelBackdrop) {
    panelBackdrop.addEventListener('click', () => {
      closeAllPanels();
      if (panelBackdrop) panelBackdrop.classList.remove('active');
    });
  }

  // Tecla Escape en dispositivos con teclado conectado
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobile()) {
      closeAllPanels();
      if (panelBackdrop) panelBackdrop.classList.remove('active');
    }
  });

  // Observador de cambios de clase para sincronizar botones al abrir/cerrar desde mapa u otros triggers
  const observer = new MutationObserver(() => {
    syncNavButtons();
  });

  allPanels.forEach((panel) => {
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
  });

  // Inicializar estado de iconos
  if (window.lucide) window.lucide.createIcons();
}

