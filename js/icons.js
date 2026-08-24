/* =========================================================================
   ICONS.JS — Dibujo de iconos dinámicos (canvas) para las capas de Mapbox
   ========================================================================= */

export function buildIcon(draw, color, importance, size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, color, importance, size);
  return ctx.getImageData(0, 0, size, size);
}

export function drawTargetIcon(ctx, color, importance, s) {
  const c = s / 2;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (importance === 1) {
    ctx.beginPath();
    ctx.arc(c, c, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(c, c, s * 0.10, 0, Math.PI * 2);
    ctx.fill();
  } else if (importance === 2) {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c, s * 0.24); ctx.lineTo(c, s * 0.76);
    ctx.moveTo(s * 0.24, c); ctx.lineTo(s * 0.76, c);
    ctx.stroke();
  }
}
