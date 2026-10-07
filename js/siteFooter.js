(function () {
  function addFooter() {
    if (document.querySelector('.nolli-site-footer')) return;
    const footer = document.createElement('footer');
    footer.className = `nolli-site-footer${document.getElementById('map') ? ' nolli-map-footer' : ''}`;
    footer.setAttribute('aria-label', 'Información legal');
    footer.innerHTML = `
      <span class="nolli-footer-copyright"><span class="brand-nolli">nolli.</span> &copy; ${new Date().getFullYear()}</span>
      <details class="nolli-footer-details">
        <summary aria-label="Abrir enlaces y catálogo">EXPLORAR</summary>
        <nav aria-label="Enlaces del atlas y legales">
        <a href="/ciudades">CIUDADES</a>
        <a href="/arquitectos">ARQUITECTOS</a>
        <a href="/categorias">CATEGORÍAS</a>
        <a href="/landing">ATLAS</a>
        <a href="/legal#aviso-legal">AVISO LEGAL</a>
        <a href="/legal#privacidad">PRIVACIDAD</a>
        <a href="/legal#cookies">COOKIES</a>
        <a href="/legal#terminos">TÉRMINOS</a>
        <a href="mailto:nolli@signes.studio">CONTACTO</a>
        </nav>
      </details>`;
    document.body.appendChild(footer);
  }
  document.addEventListener('DOMContentLoaded', addFooter);
}());
