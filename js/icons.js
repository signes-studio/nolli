/* =========================================================================
   ICONS.JS — Dibujo de iconos dinámicos (canvas) con geometría original y color por categoría
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
  
  if (importance === 0) {
    ctx.save();
    ctx.translate(c, c);
    

    ctx.beginPath();
    ctx.moveTo(0, -s * 0.38);  // Vértice superior
    ctx.lineTo(s * 0.32, s * 0.28); // Vértice inferior derecho
    ctx.lineTo(-s * 0.32, s * 0.28); // Vértice inferior izquierdo
    ctx.closePath();
    

    ctx.fillStyle = '#E95C0C';
    ctx.fill();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#F8F1DF';
    ctx.stroke();

    ctx.fillStyle = '#E95C0C';
    ctx.beginPath();
    ctx.arc(0, s * 0.08, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  } else if (importance === 1) {
    ctx.fillStyle = '#F8F1DF';
    ctx.beginPath();
    ctx.arc(c, c, s * 0.38, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#141411';
    ctx.beginPath();
    ctx.arc(c, c, s * 0.10, 0, Math.PI * 2);
    ctx.fill();
  } else if (importance === 2) {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(c, s * 0.28); ctx.lineTo(c, s * 0.72);
    ctx.moveTo(s * 0.28, c); ctx.lineTo(s * 0.72, c);
    ctx.stroke();
  }
}