/* =========================================================================
   ICONS.JS — Dibujo de iconos dinámicos (canvas) para las capas de Mapbox
   ========================================================================= */

export function buildIcon(draw, color, size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, color, size);
  return ctx.getImageData(0, 0, size, size);
}

export function drawTargetIcon(ctx, color, s) {
  const c = s / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c, c, s * 0.30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c, s * 0.06); ctx.lineTo(c, s * 0.28);
  ctx.moveTo(c, s * 0.72); ctx.lineTo(c, s * 0.94);
  ctx.moveTo(s * 0.06, c); ctx.lineTo(s * 0.28, c);
  ctx.moveTo(s * 0.72, c); ctx.lineTo(s * 0.94, c);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(c, c, 3.5, 0, Math.PI * 2);
  ctx.fill();
}
