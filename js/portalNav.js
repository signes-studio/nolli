/* =========================================================================
   JS/PORTALNAV.JS — Controlador de Navegación Móvil y Filtros para nolli.
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Control del Drawer Móvil
  const menuBtn = document.querySelector('.portal-menu-btn');
  const drawer = document.querySelector('.portal-drawer');
  const backdrop = document.querySelector('.portal-drawer-backdrop');
  const closeBtn = document.querySelector('.portal-drawer-close');

  function openDrawer() {
    if (!drawer || !backdrop) return;
    drawer.classList.add('open');
    backdrop.classList.add('open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  }

  function closeDrawer() {
    if (!drawer || !backdrop) return;
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    if (menuBtn) {
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.focus();
    }
    document.body.style.overflow = '';
  }

  if (menuBtn) menuBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // 2. Buscador reactivo en vivo para páginas con .portal-search-input
  const searchInput = document.querySelector('.portal-search-input');
  const searchableCards = document.querySelectorAll('.portal-card[data-search]');
  const chips = document.querySelectorAll('.portal-chip[data-filter]');

  let activeFilter = 'all';

  function filterCards() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    searchableCards.forEach((card) => {
      const text = (card.getAttribute('data-search') || '').toLowerCase();
      const category = card.getAttribute('data-category') || '';

      const matchesQuery = !query || text.includes(query);
      const matchesFilter = activeFilter === 'all' || category === activeFilter;

      if (matchesQuery && matchesFilter) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });

    const visibleCount = Array.from(searchableCards).filter((c) => c.style.display !== 'none').length;
    const countEl = document.getElementById('portal-results-count');
    if (countEl) {
      countEl.textContent = `${visibleCount} ${visibleCount === 1 ? 'resultado' : 'resultados'}`;
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', filterCards);
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.getAttribute('data-filter') || 'all';
      filterCards();
    });
  });
});

