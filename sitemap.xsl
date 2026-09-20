<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="es">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>
          <xsl:choose>
            <xsl:when test="sitemap:sitemapindex">Índice de Sitemaps XML · nolli.</xsl:when>
            <xsl:otherwise>Sitemap XML · nolli.</xsl:otherwise>
          </xsl:choose>
        </title>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin=""/>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=League+Spartan:wght@700;800;900&amp;family=Montserrat:wght@200;300;700;800&amp;display=swap" rel="stylesheet"/>
        <style>
          :root {
            --bg: #F4F1EA;
            --bg-surface: #FFFFFF;
            --bg-elevated: #EDE7D8;
            --fg: #141411;
            --fg-dim: #666660;
            --border: #D5CFC0;
            --border-subtle: rgba(20, 20, 17, 0.08);
            --accent: #EA560D;
            --accent-hover: #9E3700;
            --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
            --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.06);
          }

          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #141411;
              --bg-surface: #1B1B18;
              --bg-elevated: #242420;
              --fg: #F4F1EA;
              --fg-dim: #9E9E94;
              --border: rgba(255, 255, 255, 0.12);
              --border-subtle: rgba(255, 255, 255, 0.08);
              --shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.3);
              --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.4);
            }
          }

          *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--bg);
            color: var(--fg);
            line-height: 1.5;
            padding: 24px 16px 48px;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }

          .container {
            max-width: 1180px;
            margin: 0 auto;
          }

          /* CABECERA EDITORIAL */
          .header {
            background-color: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 24px 28px;
            margin-bottom: 24px;
            box-shadow: var(--shadow-md);
          }

          .header-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border-subtle);
            margin-bottom: 16px;
          }

          .brand-logo {
            font-family: 'League Spartan', -apple-system, BlinkMacSystemFont, sans-serif;
            font-weight: 800;
            font-size: 26px;
            line-height: 1;
            letter-spacing: -0.03em;
            text-transform: lowercase;
            color: var(--fg);
            text-decoration: none;
            display: inline-flex;
            align-items: baseline;
          }

          .brand-logo .dot {
            color: var(--accent);
          }

          .header-nav {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
          }

          .nav-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background-color: var(--bg);
            color: var(--fg);
            font-family: 'Inter', sans-serif;
            font-weight: 600;
            font-size: 12.5px;
            text-decoration: none;
            padding: 8px 14px;
            border: 1px solid var(--border);
            border-radius: 6px;
            box-shadow: var(--shadow-sm);
            transition: all 0.15s ease;
          }

          .nav-btn:hover {
            border-color: var(--accent);
            color: var(--accent);
            transform: translateY(-1px);
          }

          .nav-btn--accent {
            background-color: var(--accent);
            color: #FFFFFF;
            border-color: var(--accent);
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .nav-btn--accent:hover {
            background-color: var(--accent-hover);
            color: #FFFFFF;
            border-color: var(--accent-hover);
          }

          .header-meta {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .header-title {
            font-family: 'League Spartan', sans-serif;
            font-weight: 900;
            font-size: 22px;
            letter-spacing: -0.01em;
            text-transform: uppercase;
            color: var(--fg);
          }

          .header-desc {
            font-size: 14px;
            color: var(--fg-dim);
            max-width: 820px;
          }

          /* PANEL DE CONTROL / RESUMEN Y FILTRO */
          .toolbar {
            background-color: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            box-shadow: var(--shadow-sm);
          }

          .toolbar-stats {
            display: flex;
            align-items: center;
            gap: 16px;
            flex-wrap: wrap;
          }

          .stat-tag {
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 11px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            padding: 4px 10px;
            background-color: var(--bg-elevated);
            color: var(--fg);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
          }

          .stat-counter {
            font-size: 13.5px;
            font-weight: 500;
            color: var(--fg);
          }

          .stat-counter strong {
            color: var(--accent);
            font-weight: 700;
          }

          .search-box {
            flex: 1;
            min-width: 260px;
            max-width: 420px;
            position: relative;
          }

          .search-input {
            width: 100%;
            padding: 9px 14px;
            font-family: 'Inter', sans-serif;
            font-size: 13px;
            color: var(--fg);
            background-color: var(--bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            outline: none;
            transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
          }

          .search-input:focus {
            border-color: var(--accent);
            background-color: var(--bg-surface);
            box-shadow: 0 0 0 2px rgba(234, 86, 13, 0.15);
          }

          .search-input::placeholder {
            color: var(--fg-dim);
            font-size: 12px;
          }

          /* TABLAS DE SITEMAP */
          .table-wrapper {
            background-color: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: var(--shadow-md);
          }

          table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 13px;
          }

          thead {
            background-color: var(--bg-elevated);
            color: var(--fg);
          }

          th {
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 11.5px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            padding: 12px 14px;
            border-bottom: 1px solid var(--border);
            white-space: nowrap;
          }

          td {
            padding: 10px 14px;
            border-bottom: 1px solid var(--border-subtle);
            vertical-align: middle;
            color: var(--fg);
          }

          tbody tr:nth-child(even) {
            background-color: rgba(20, 20, 17, 0.015);
          }

          tbody tr:hover {
            background-color: rgba(234, 86, 13, 0.04);
          }

          .col-num {
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 12px;
            color: var(--fg-dim);
            text-align: center;
            width: 44px;
          }

          .col-loc {
            word-break: break-all;
            font-family: 'Inter', monospace;
            font-size: 13px;
          }

          .col-loc a {
            color: var(--fg);
            text-decoration: none;
            font-weight: 500;
            border-bottom: 1px dotted var(--fg-dim);
            transition: color 0.15s ease, border-color 0.15s ease;
          }

          .col-loc a:hover {
            color: var(--accent);
            border-bottom: 1px solid var(--accent);
          }

          .col-lang {
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
          }

          .badge-lang {
            display: inline-block;
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 10px;
            letter-spacing: 0.04em;
            padding: 2px 6px;
            border: 1px solid var(--border);
            border-radius: 4px;
            background-color: var(--bg-elevated);
            color: var(--fg);
          }

          .badge-lang--es {
            background-color: var(--bg-elevated);
          }

          .badge-lang--en {
            background-color: rgba(75, 107, 148, 0.12);
            border-color: #4B6B94;
            color: #4B6B94;
          }

          .badge-lang--ca {
            background-color: rgba(217, 119, 54, 0.12);
            border-color: #D97736;
            color: #D97736;
          }

          .col-priority {
            white-space: nowrap;
          }

          .badge-priority {
            display: inline-block;
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 11px;
            padding: 2px 6px;
            border: 1px solid var(--border);
            border-radius: 4px;
            background-color: var(--bg-surface);
            color: var(--fg);
          }

          .col-freq {
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 11px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--fg-dim);
            white-space: nowrap;
          }

          .col-date {
            font-family: 'Inter', monospace;
            font-size: 12px;
            color: var(--fg-dim);
            white-space: nowrap;
          }

          /* PIE DE PÁGINA */
          .footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;
            font-size: 12px;
            color: var(--fg-dim);
          }

          .footer-project-by {
            font-size: 12px;
            color: var(--fg-dim);
            display: inline-flex;
            align-items: baseline;
            gap: 5px;
          }

          .brand-nolli {
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 1.22em;
            line-height: 1;
            letter-spacing: -0.02em;
            text-transform: lowercase;
            display: inline-block;
            vertical-align: baseline;
          }

          .brand-signes {
            font-family: 'Montserrat', sans-serif;
            text-decoration: none;
            color: var(--fg);
            display: inline-flex;
            align-items: baseline;
            letter-spacing: 0.04em;
          }

          .brand-signes-bold {
            font-weight: 800;
          }

          .brand-signes-thin {
            font-weight: 200;
          }

          .footer-note {
            font-family: 'Inter', sans-serif;
          }

          @media (max-width: 768px) {
            body {
              padding: 14px 10px 36px;
            }

            .header {
              padding: 16px 18px;
            }

            .brand-logo {
              font-size: 24px;
            }

            .toolbar {
              flex-direction: column;
              align-items: stretch;
            }

            .search-box {
              max-width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- CABECERA -->
          <header class="header">
            <div class="header-top">
              <a href="https://nollimap.app" class="brand-logo">
                nolli<span class="dot">.</span>
              </a>
              <nav class="header-nav">
                <a href="https://nollimap.app" class="nav-btn nav-btn--accent">
                  ← Ir al Mapa Principal
                </a>
                <xsl:if test="sitemap:urlset">
                  <a href="/sitemap.xml" class="nav-btn">
                    ↑ Índice General (/sitemap.xml)
                  </a>
                </xsl:if>
              </nav>
            </div>
            <div class="header-meta">
              <h1 class="header-title">
                <xsl:choose>
                  <xsl:when test="sitemap:sitemapindex">Índice Cartográfico // Sitemaps XML</xsl:when>
                  <xsl:otherwise>Sitemap XML // Listado de Enlaces</xsl:otherwise>
                </xsl:choose>
              </h1>
              <p class="header-desc">
                Este archivo XML ha sido generado según el protocolo estándar de sitemaps (<a href="https://www.sitemaps.org" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">sitemaps.org</a>) para motores de búsqueda (Google, Bing, Yandex). Indexación exclusiva en español. Se visualiza con una hoja de transformación XSLT para facilitar su lectura humana, auditoría SEO e inspección técnica.
              </p>
            </div>
          </header>

          <!-- VISTA 1: SITEMAP INDEX (/sitemap.xml) -->
          <xsl:if test="sitemap:sitemapindex">
            <section class="toolbar">
              <div class="toolbar-stats">
                <span class="stat-tag">TIPO: ÍNDICE DE SITEMAPS</span>
                <span class="stat-counter">
                  Total de sitemaps indexados: <strong><xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)"/></strong>
                </span>
              </div>
            </section>

            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style="width: 44px;">#</th>
                    <th>Sitemap XML</th>
                    <th style="width: 220px;">Última Modificación</th>
                  </tr>
                </thead>
                <tbody>
                  <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
                    <tr>
                      <td class="col-num"><xsl:value-of select="position()"/></td>
                      <td class="col-loc">
                        <a href="{sitemap:loc}">
                          <xsl:value-of select="sitemap:loc"/>
                        </a>
                      </td>
                      <td class="col-date">
                        <xsl:value-of select="sitemap:lastmod"/>
                      </td>
                    </tr>
                  </xsl:for-each>
                </tbody>
              </table>
            </div>
          </xsl:if>

          <!-- VISTA 2: URLSET (/sitemap-categories.xml, /sitemap-architects.xml, etc.) -->
          <xsl:if test="sitemap:urlset">
            <section class="toolbar">
              <div class="toolbar-stats">
                <span class="stat-tag">TIPO: LISTA DE ENLACES (ES)</span>
                <span class="stat-counter">
                  Mostrando <strong id="visible-count"><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></strong> de <strong id="total-count"><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></strong> URLs
                </span>
              </div>
              <div class="search-box">
                <input type="search" id="sitemap-filter" class="search-input" placeholder="⌕ Filtrar URLs en tiempo real..." aria-label="Filtrar URLs"/>
              </div>
            </section>

            <div class="table-wrapper">
              <table id="urls-table">
                <thead>
                  <tr>
                    <th style="width: 44px;">#</th>
                    <th>URL Canónica (ES)</th>
                    <th style="width: 80px;">Idioma</th>
                    <th style="width: 95px;">Prioridad</th>
                    <th style="width: 110px;">Frecuencia</th>
                    <th style="width: 150px;">Modificación</th>
                  </tr>
                </thead>
                <tbody id="urls-tbody">
                  <xsl:for-each select="sitemap:urlset/sitemap:url">
                    <tr class="url-row">
                      <td class="col-num"><xsl:value-of select="position()"/></td>
                      <td class="col-loc">
                        <a href="{sitemap:loc}">
                          <xsl:value-of select="sitemap:loc"/>
                        </a>
                      </td>
                      <td class="col-lang">
                        <span class="badge-lang badge-lang--es">ES</span>
                      </td>
                      <td class="col-priority">
                        <span class="badge-priority">
                          <xsl:value-of select="sitemap:priority"/>
                        </span>
                      </td>
                      <td class="col-freq">
                        <xsl:value-of select="sitemap:changefreq"/>
                      </td>
                      <td class="col-date">
                        <xsl:value-of select="sitemap:lastmod"/>
                      </td>
                    </tr>
                  </xsl:for-each>
                </tbody>
              </table>
            </div>

            <!-- SCRIPT DE FILTRADO INTERACTIVO -->
            <script type="text/javascript">
              <![CDATA[
              document.addEventListener('DOMContentLoaded', function() {
                var searchInput = document.getElementById('sitemap-filter');
                var tableBody = document.getElementById('urls-tbody');
                var visibleCountElem = document.getElementById('visible-count');
                var totalCountElem = document.getElementById('total-count');

                if (!searchInput || !tableBody) return;

                var rows = tableBody.getElementsByTagName('tr');
                var total = rows.length;

                searchInput.addEventListener('input', function() {
                  var query = (searchInput.value || '').toLowerCase().trim();
                  var visible = 0;

                  for (var i = 0; i < rows.length; i++) {
                    var row = rows[i];
                    var text = (row.textContent || row.innerText || '').toLowerCase();
                    if (!query || text.indexOf(query) !== -1) {
                      row.style.display = '';
                      visible++;
                    } else {
                      row.style.display = 'none';
                    }
                  }

                  if (visibleCountElem) {
                    visibleCountElem.textContent = visible;
                  }
                });
              });
              ]]>
            </script>
          </xsl:if>

          <!-- PIE DE PÁGINA -->
          <footer class="footer">
            <span class="footer-project-by"><span class="brand-nolli">nolli.</span> es un proyecto de <a href="https://signes.studio" target="_blank" rel="noopener noreferrer" class="brand-signes"><strong class="brand-signes-bold">SIGNES</strong><span class="brand-signes-thin">.STUDIO</span></a></span>
            <span class="footer-note">Protocolo Sitemaps XML 0.9 · Transformación XSLT</span>
          </footer>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
