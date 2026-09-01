(function () {
  function addFooter() {
    if (document.querySelector('.nolli-site-footer')) return;
    const footer = document.createElement('footer');
    footer.className = `nolli-site-footer${document.getElementById('map') ? ' nolli-map-footer' : ''}`;
    footer.setAttribute('aria-label', 'Información legal');
    footer.innerHTML = `
      <span class="nolli-footer-copyright">NOLLI &copy; ${new Date().getFullYear()}</span>
      <details class="nolli-footer-details">
        <summary aria-label="Abrir enlaces legales">[ LEGAL ]</summary>
        <nav aria-label="Enlaces legales">
        <a href="legal.html#aviso-legal">[ AVISO LEGAL ]</a>
        <a href="legal.html#privacidad">[ PRIVACIDAD ]</a>
        <a href="legal.html#cookies">[ COOKIES ]</a>
        <a href="legal.html#terminos">[ TÉRMINOS ]</a>
        <a href="mailto:nolli@signes.studio">[ CONTACTO ]</a>
        </nav>
      </details>`;
    document.body.appendChild(footer);
  }
  document.addEventListener('DOMContentLoaded', addFooter);
}());
