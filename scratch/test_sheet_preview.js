import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="../css/legal-components.css">
<link rel="stylesheet" href="../css/utilities.css">
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/map-hud.css">
<link rel="stylesheet" href="../css/panels.css">
<link rel="stylesheet" href="../css/components.css">
<style>
  body { background: #E5E5E5; padding: 20px; font-family: 'Inter', sans-serif; display: flex; gap: 20px; }
  .sheet { position: relative; width: 400px; background: var(--bg-panel); border-radius: 16px; border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.1); overflow: hidden; display: block; }
</style>
</head>
<body>
  <div class="sheet" id="sheet-with-photo">
    <div style="padding: 16px 14px 10px;">
      <div style="font-family: 'League Spartan', sans-serif; font-weight: 800; font-size: 11px; color: var(--accent);">№ FICHA DE OBRA</div>
      <h2 style="font-size: 20px; margin: 4px 0 2px;">Torre de Madrid</h2>
      <div style="font-size: 12px; color: var(--fg-dim);">Julián y José María Otamendi · 1957 · Madrid</div>
    </div>
    <div class="sheet-hero-actions" style="padding: 0 14px 12px;">
      <button class="sheet-hero-btn btn-primary"><span>Cómo llegar</span></button>
      <button class="sheet-hero-btn"><span>Visitar</span></button>
      <button class="sheet-hero-btn"><span>Guardar</span></button>
      <button class="sheet-hero-btn"><span>Compartir</span></button>
    </div>
    <div class="sheet-gallery-wrap">
      <div class="sheet-photo-banner">
        <button type="button" class="photo-thumb sheet-photo-clickable" data-photo-url="test.jpg">
          <img class="sheet-photo" src="https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600" alt="Torre de Madrid">
          <span class="sheet-photo-credit">Foto: Santi</span>
          <span class="photo-zoom-badge">AMPLIAR</span>
        </button>
        <button type="button" class="sheet-photo-add-btn">
          <span>Añadir foto</span>
        </button>
      </div>
      <div id="sheet-community-photos-container" class="sheet-community-photos-strip"></div>
    </div>
  </div>

  <div class="sheet" id="sheet-no-photo">
    <div style="padding: 16px 14px 10px;">
      <div style="font-family: 'League Spartan', sans-serif; font-weight: 800; font-size: 11px; color: var(--accent);">№ FICHA DE OBRA</div>
      <h2 style="font-size: 20px; margin: 4px 0 2px;">Edificio España</h2>
      <div style="font-size: 12px; color: var(--fg-dim);">Julián y José María Otamendi · 1953 · Madrid</div>
    </div>
    <div class="sheet-hero-actions" style="padding: 0 14px 12px;">
      <button class="sheet-hero-btn btn-primary"><span>Cómo llegar</span></button>
      <button class="sheet-hero-btn"><span>Visitar</span></button>
      <button class="sheet-hero-btn"><span>Guardar</span></button>
      <button class="sheet-hero-btn"><span>Compartir</span></button>
    </div>
    <div class="sheet-gallery-wrap">
      <div class="sheet-no-photo-banner">
        <div class="sheet-no-photo-inner">
          <div class="sheet-no-photo-icon-box">📷</div>
          <div class="sheet-no-photo-texts">
            <span class="sheet-no-photo-tag">FOTOGRAFÍA NO DISPONIBLE</span>
            <span class="sheet-no-photo-sub">Documenta esta obra aportando una fotografía</span>
          </div>
        </div>
        <button type="button" class="sheet-no-photo-action-btn">
          <span>Añadir foto</span>
        </button>
      </div>
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync('scratch/test_sheet.html', html);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outPath = 'C:\\Users\\luiss\\.gemini\\antigravity\\brain\\506685e5-6c15-406c-a7e3-5846c38301c6\\sheet_preview.png';
const fileUrl = 'file:///' + path.resolve('scratch/test_sheet.html').replace(/\\/g, '/');
execSync(`"${edge}" --headless --screenshot="${outPath}" --window-size=950,550 "${fileUrl}"`);
console.log('Fixed screenshot taken!');

