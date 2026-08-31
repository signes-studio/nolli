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

export function buildEmojiIcon(emoji, isDark = false, size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const center = size / 2;

  // Fondo circular tipo insignia editorial Bauhaus
  ctx.beginPath();
  ctx.arc(center, center, size * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = isDark ? '#1C1C1A' : '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = isDark ? '#FFFFFF' : '#141411';
  ctx.stroke();

  // Emoji centrado
  ctx.font = `${Math.round(size * 0.44)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji || '📍', center, center + 1);

  return ctx.getImageData(0, 0, size, size);
}

export function drawTargetIcon(ctx, color, importance, s) {
  const c = s / 2;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const isLightSelection = color === '#FFFFFF' || color === '#ffffff' || color === '#F5F4F0' || color === '#f5f4f0';
  const isDarkSelection = color === '#141411';
  
  if (importance === 0) {
    ctx.save();
    ctx.translate(c, c);
    
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.38);  // Vértice superior
    ctx.lineTo(s * 0.32, s * 0.28); // Vértice inferior derecho
    ctx.lineTo(-s * 0.32, s * 0.28); // Vértice inferior izquierdo
    ctx.closePath();

    if (isLightSelection) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#141411';
      ctx.stroke();
      ctx.fillStyle = '#141411';
      ctx.beginPath();
      ctx.arc(0, s * 0.08, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else if (isDarkSelection) {
      ctx.fillStyle = '#141411';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#F8F1DF';
      ctx.stroke();
      ctx.fillStyle = '#F8F1DF';
      ctx.beginPath();
      ctx.arc(0, s * 0.08, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#F8F1DF';
      ctx.stroke();
      ctx.fillStyle = '#F8F1DF';
      ctx.beginPath();
      ctx.arc(0, s * 0.08, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  } else if (importance === 1) {
    if (isLightSelection) {
      ctx.fillStyle = '#141411';
      ctx.beginPath();
      ctx.arc(c, c, s * 0.38, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(c, c, s * 0.34, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#141411';
      ctx.beginPath();
      ctx.arc(c, c, s * 0.10, 0, Math.PI * 2);
      ctx.fill();
    } else if (isDarkSelection) {
      ctx.fillStyle = '#F8F1DF';
      ctx.beginPath();
      ctx.arc(c, c, s * 0.38, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#141411';
      ctx.beginPath();
      ctx.arc(c, c, s * 0.34, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#F8F1DF';
      ctx.beginPath();
      ctx.arc(c, c, s * 0.10, 0, Math.PI * 2);
      ctx.fill();
    } else {
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
    }
  } else if (importance === 2) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = 3;
    ctx.globalAlpha = isLightSelection ? 1.0 : 0.7;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(c, s * 0.28); ctx.lineTo(c, s * 0.72);
    ctx.moveTo(s * 0.28, c); ctx.lineTo(s * 0.72, c);
    ctx.stroke();
  }
}

/**
 * Dibuja iconos cuadrados para obras guardadas privadas en el perfil,
 * manteniendo el color distintivo de su categoría arquitectónica.
 */
export function drawPrivateSquareIcon(ctx, color, importance, s) {
  const c = s / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  if (importance === 0) {
    // Obra maestra privada: Rombo/cuadrado rotado 45°
    ctx.translate(c, c);
    ctx.rotate(Math.PI / 4);
    const half = s * 0.28;

    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(-half - 3, -half - 3, (half + 3) * 2, (half + 3) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(-half, -half, half * 2, half * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#141411';
    ctx.strokeRect(-half, -half, half * 2, half * 2);

    ctx.fillStyle = '#141411';
    ctx.fillRect(-half * 0.35, -half * 0.35, half * 0.7, half * 0.7);
  } else if (importance === 1) {
    // Nivel 1 privado: Cuadrado con halo de contraste y centro técnico
    const half = s * 0.30;
    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(c - half - 3, c - half - 3, (half + 3) * 2, (half + 3) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#141411';
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);

    ctx.fillStyle = '#141411';
    const inner = half * 0.35;
    ctx.fillRect(c - inner, c - inner, inner * 2, inner * 2);
  } else if (importance === 2) {
    // Nivel 2 privado: Cuadrado compacto de categoría
    const half = s * 0.24;
    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(c - half - 2, c - half - 2, (half + 2) * 2, (half + 2) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#141411';
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);
  } else {
    // Nivel 3 privado: Pequeño cuadrado de categoría
    const half = s * 0.18;
    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(c - half - 2, c - half - 2, (half + 2) * 2, (half + 2) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#141411';
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);
  }

  ctx.restore();
}