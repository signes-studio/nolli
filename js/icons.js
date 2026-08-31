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
    if (isLightSelection || isDarkSelection) {
      const outerColor = isDarkSelection ? '#F8F1DF' : '#141411';
      const innerColor = isDarkSelection ? '#141411' : '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = outerColor;
      ctx.beginPath();
      ctx.arc(c, c, s * 0.28, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = innerColor;
      ctx.beginPath();
      ctx.arc(c, c, s * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = outerColor;
      ctx.beginPath();
      ctx.arc(c, c, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(c, c, s * 0.28, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c, c, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.lineWidth = isLightSelection || isDarkSelection ? 3 : 2.5;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(c, s * 0.28); ctx.lineTo(c, s * 0.72);
    ctx.moveTo(s * 0.28, c); ctx.lineTo(s * 0.72, c);
    ctx.stroke();
  }
}

/**
 * Dibuja iconos cuadrados limpios para obras/etiquetas privadas,
 * reflejando la jerarquía de tamaño por importancia y color por categoría arquitectónica (Neo-Bauhaus).
 */
export function drawPrivateSquareIcon(ctx, color, importance, s) {
  const c = s / 2;
  ctx.save();

  if (importance === 0) {
    // Obra maestra privada: Rombo/cuadrado girado 45° con marco doble Bauhaus
    ctx.translate(c, c);
    ctx.rotate(Math.PI / 4);
    const half = s * 0.28;

    // Halo perimetral de contraste
    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(-half - 3, -half - 3, (half + 3) * 2, (half + 3) * 2);

    // Relleno cromático de categoría
    ctx.fillStyle = color;
    ctx.fillRect(-half, -half, half * 2, half * 2);

    // Contorno sólido negro
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111111';
    ctx.strokeRect(-half, -half, half * 2, half * 2);

    // Núcleo técnico central
    ctx.fillStyle = '#111111';
    ctx.fillRect(-half * 0.35, -half * 0.35, half * 0.7, half * 0.7);
  } else if (importance === 1) {
    // Importancia 1 (Alta): Cuadrado destacado con centro técnico
    const half = s * 0.30;

    // Halo perimetral
    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(c - half - 2.5, c - half - 2.5, (half + 2.5) * 2, (half + 2.5) * 2);

    // Relleno de categoría
    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);

    // Contorno sólido negro
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#111111';
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);

    // Punto/cuadrado técnico central
    ctx.fillStyle = '#111111';
    const inner = half * 0.35;
    ctx.fillRect(c - inner, c - inner, inner * 2, inner * 2);
  } else if (importance === 2) {
    // Importancia 2 (Media): Cuadrado intermedio
    const half = s * 0.23;

    // Halo perimetral
    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(c - half - 2, c - half - 2, (half + 2) * 2, (half + 2) * 2);

    // Relleno de categoría
    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);

    // Contorno sólido negro
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#111111';
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);
  } else {
    // Importancia 3 (Baja / Discreto): Icono cuadrado compacto
    const half = s * 0.16;

    // Halo perimetral sutil
    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(c - half - 1.5, c - half - 1.5, (half + 1.5) * 2, (half + 1.5) * 2);

    // Relleno de categoría
    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);

    // Contorno sólido negro
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#111111';
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);
  }

  ctx.restore();
}