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
            <xsl:when test="sitemap:sitemapindex">Índice de Sitemaps XML · Nolli</xsl:when>
            <xsl:otherwise>Sitemap XML · Nolli</xsl:otherwise>
          </xsl:choose>
        </title>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin=""/>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=League+Spartan:wght@700;800;900&amp;display=swap" rel="stylesheet"/>
        <style>
          *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            border-radius: 0 !important;
          }

          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #F4F1EA;
            color: #141411;
            line-height: 1.5;
            padding: 24px 16px 48px;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }

          .container {
            max-width: 1180px;
            margin: 0 auto;
          }

          /* CABECERA EDITORIAL NEO-BAUHAUS */
          .header {
            background-color: #FFFFFF;
            border: 2px solid #141411;
            padding: 24px 28px;
            margin-bottom: 24px;
            box-shadow: 4px 4px 0 #141411;
          }

          .header-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid #141411;
            margin-bottom: 16px;
          }

          .brand-logo {
            font-family: 'League Spartan', -apple-system, BlinkMacSystemFont, sans-serif;
            font-weight: 900;
            font-size: 32px;
            line-height: 1;
            letter-spacing: -0.03em;
            text-transform: uppercase;
            color: #141411;
            text-decoration: none;
            display: inline-flex;
            align-items: baseline;
          }

          .brand-logo .dot {
            color: #E95C0C;
          }

          .header-nav {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
          }

          .nav-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background-color: #F4F1EA;
            color: #141411;
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 13px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            text-decoration: none;
            padding: 8px 14px;
            border: 2px solid #141411;
            transition: all 0.15s ease;
          }

          .nav-btn:hover {
            background-color: #141411;
            color: #F4F1EA;
          }

          .nav-btn--accent {
            background-color: #E95C0C;
            color: #FFFFFF;
            border-color: #141411;
          }

          .nav-btn--accent:hover {
            background-color: #141411;
            color: #FFFFFF;
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
            color: #141411;
          }

          .header-desc {
            font-size: 14px;
            color: #555550;
            max-width: 820px;
          }

          /* PANEL DE CONTROL / RESUMEN Y FILTRO */
          .toolbar {
            background-color: #FFFFFF;
            border: 2px solid #141411;
            padding: 16px 20px;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            box-shadow: 3px 3px 0 #141411;
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
            font-size: 12px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            padding: 4px 8px;
            background-color: #141411;
            color: #F4F1EA;
            border: 1px solid #141411;
          }

          .stat-counter {
            font-size: 14px;
            font-weight: 600;
            color: #141411;
          }

          .stat-counter strong {
            color: #E95C0C;
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
            padding: 10px 14px;
            font-family: 'Inter', sans-serif;
            font-size: 13px;
            color: #141411;
            background-color: #F4F1EA;
            border: 2px solid #141411;
            outline: none;
            transition: border-color 0.15s ease, background-color 0.15s ease;
          }

          .search-input:focus {
            border-color: #E95C0C;
            background-color: #FFFFFF;
          }

          .search-input::placeholder {
            color: #7A6B58;
            font-size: 12px;
          }

          /* TABLAS DE SITEMAP */
          .table-wrapper {
            background-color: #FFFFFF;
            border: 2px solid #141411;
            overflow-x: auto;
            box-shadow: 4px 4px 0 #141411;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 13px;
          }

          thead {
            background-color: #141411;
            color: #F4F1EA;
          }

          th {
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 12px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            padding: 12px 14px;
            border-bottom: 2px solid #141411;
            white-space: nowrap;
          }

          td {
            padding: 10px 14px;
            border-bottom: 1px solid #DDD7CD;
            vertical-align: middle;
          }

          tbody tr:nth-child(even) {
            background-color: #FAF8F3;
          }

          tbody tr:hover {
            background-color: #F2EFE8;
          }

          .col-num {
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 12px;
            color: #7A6B58;
            text-align: center;
            width: 44px;
          }

          .col-loc {
            word-break: break-all;
            font-family: 'Inter', monospace;
            font-size: 13px;
          }

          .col-loc a {
            color: #141411;
            text-decoration: none;
            font-weight: 600;
            border-bottom: 1px dotted #7A6B58;
            transition: color 0.15s ease, border-color 0.15s ease;
          }

          .col-loc a:hover {
            color: #E95C0C;
            border-bottom: 1px solid #E95C0C;
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
            padding: 2px 5px;
            border: 1px solid #141411;
            background-color: #FFFFFF;
            color: #141411;
          }

          .badge-lang--es {
            background-color: #F4F1EA;
          }

          .badge-lang--en {
            background-color: #E8F0FE;
            border-color: #4B6B94;
            color: #4B6B94;
          }

          .badge-lang--ca {
            background-color: #FFF3E0;
            border-color: #D97736;
            color: #D97736;
          }

          .badge-lang--alt {
            background-color: #141411;
            color: #F4F1EA;
            border-color: #141411;
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
            border: 1px solid #141411;
            background-color: #FFFFFF;
            color: #141411;
          }

          .col-freq {
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            font-size: 11px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: #555550;
            white-space: nowrap;
          }

          .col-date {
            font-family: 'Inter', monospace;
            font-size: 12px;
            color: #555550;
            white-space: nowrap;
          }

          /* PIE DE PÁGINA */
          .footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 2px solid #141411;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;
            font-size: 12px;
            color: #555550;
          }

          .footer-brand {
            font-family: 'League Spartan', sans-serif;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #141411;
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
              font-size: 26px;
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
                Este archivo XML ha sido generado según el protocolo estándar de sitemaps (<a href="https://www.sitemaps.org" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">sitemaps.org</a>) para motores de búsqueda (Google, Bing, Yandex). Se visualiza con una hoja de transformación XSLT para facilitar su lectura humana, auditoría SEO e inspección técnica.
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
                <span class="stat-tag">TIPO: LISTA DE ENLACES</span>
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
                    <th>URL</th>
                    <th style="width: 130px;">Idiomas</th>
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
                        <xsl:choose>
                          <xsl:when test="contains(sitemap:loc, '/en/') or substring(sitemap:loc, string-length(sitemap:loc) - 2) = '/en'">
                            <span class="badge-lang badge-lang--en">EN</span>
                          </xsl:when>
                          <xsl:when test="contains(sitemap:loc, '/ca/') or substring(sitemap:loc, string-length(sitemap:loc) - 2) = '/ca'">
                            <span class="badge-lang badge-lang--ca">CA</span>
                          </xsl:when>
                          <xsl:otherwise>
                            <span class="badge-lang badge-lang--es">ES</span>
                          </xsl:otherwise>
                        </xsl:choose>
                        <xsl:if test="xhtml:link">
                          <span class="badge-lang badge-lang--alt" title="Variantes hreflang multilingüe">+ALT</span>
                        </xsl:if>
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
            <span class="footer-brand">nolli. · Guía Colectiva de Arquitectura</span>
            <span class="footer-note">Protocolo Sitemaps XML 0.9 · Transformación XSLT</span>
          </footer>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
