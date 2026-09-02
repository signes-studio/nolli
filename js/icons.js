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

/**
 * Dibuja iconos de lupa para resultados de búsqueda, con jerarquía visual de tamaño
 * según la importancia (0, 1, 2, 3) y color de la categoría arquitectónica (Neo-Bauhaus).
 */
export function drawSearchLupaIcon(ctx, color, importance, s) {
  const c = s / 2;
  const isLightSelection = color === '#FFFFFF' || color === '#ffffff' || color === '#F5F4F0' || color === '#f5f4f0';
  const isDarkSelection = color === '#141411';
  const strokeColor = isDarkSelection ? '#F8F1DF' : '#141411';
  const haloColor = isDarkSelection ? '#141411' : '#F8F1DF';

  let lensRadius, handleLen, handleWidth, ringWidth;

  if (importance === 0) {
    lensRadius = s * 0.25;
    handleLen = s * 0.22;
    handleWidth = 4.5;
    ringWidth = 3.0;
  } else if (importance === 1) {
    lensRadius = s * 0.21;
    handleLen = s * 0.19;
    handleWidth = 3.8;
    ringWidth = 2.5;
  } else if (importance === 2) {
    lensRadius = s * 0.17;
    handleLen = s * 0.16;
    handleWidth = 3.0;
    ringWidth = 2.2;
  } else {
    lensRadius = s * 0.14;
    handleLen = s * 0.13;
    handleWidth = 2.4;
    ringWidth = 1.8;
  }

  const lensX = c - s * 0.08;
  const lensY = c - s * 0.08;

  ctx.save();

  // 1. Mango de la lupa (en ángulo de 45° hacia abajo-derecha)
  const angle = Math.PI / 4;
  const startX = lensX + Math.cos(angle) * (lensRadius * 0.85);
  const startY = lensY + Math.sin(angle) * (lensRadius * 0.85);
  const endX = startX + Math.cos(angle) * handleLen;
  const endY = startY + Math.sin(angle) * handleLen;

  // Sombra / contorno grueso del mango
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = handleWidth + 2.4;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Color interior del mango
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = isLightSelection ? '#FFFFFF' : color;
  ctx.lineWidth = handleWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 2. Halo de contraste de la lente
  ctx.beginPath();
  ctx.arc(lensX, lensY, lensRadius + ringWidth, 0, Math.PI * 2);
  ctx.fillStyle = haloColor;
  ctx.fill();

  // 3. Relleno de la lente con el color de la categoría
  ctx.beginPath();
  ctx.arc(lensX, lensY, lensRadius, 0, Math.PI * 2);
  ctx.fillStyle = isLightSelection ? '#FFFFFF' : color;
  ctx.fill();

  // 4. Anillo de precisión perimetral
  ctx.beginPath();
  ctx.arc(lensX, lensY, lensRadius, 0, Math.PI * 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = ringWidth;
  ctx.stroke();

  // 5. Detalle de reflejo luminoso en lente (para niveles 0, 1 y 2)
  if (importance <= 2) {
    ctx.beginPath();
    ctx.arc(lensX - lensRadius * 0.32, lensY - lensRadius * 0.32, lensRadius * 0.38, Math.PI * 1.05, Math.PI * 1.55);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = Math.max(1.2, ringWidth * 0.65);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Núcleo central de contraste para Obra Maestra (importancia 0)
  if (importance === 0) {
    ctx.beginPath();
    ctx.arc(lensX, lensY, lensRadius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Dibuja iconos de brújula / compass para itinerarios de la pestaña Explora,
 * con jerarquía visual de tamaño según la importancia (0, 1, 2, 3) y color de categoría arquitectónica.
 */
export function drawExploreCompassIcon(ctx, color, importance, s) {
  const c = s / 2;
  const isLightSelection = color === '#FFFFFF' || color === '#ffffff' || color === '#F5F4F0' || color === '#f5f4f0';
  const isDarkSelection = color === '#141411';
  const strokeColor = isDarkSelection ? '#F8F1DF' : '#141411';
  const haloColor = isDarkSelection ? '#141411' : '#F8F1DF';

  let outerRadius, ringWidth, needleLen, needleWidth;

  if (importance === 0) {
    outerRadius = s * 0.36;
    ringWidth = 2.8;
    needleLen = s * 0.26;
    needleWidth = 6.0;
  } else if (importance === 1) {
    outerRadius = s * 0.31;
    ringWidth = 2.4;
    needleLen = s * 0.22;
    needleWidth = 5.0;
  } else if (importance === 2) {
    outerRadius = s * 0.26;
    ringWidth = 2.0;
    needleLen = s * 0.18;
    needleWidth = 4.2;
  } else {
    outerRadius = s * 0.22;
    ringWidth = 1.6;
    needleLen = s * 0.15;
    needleWidth = 3.5;
  }

  ctx.save();

  // 1. Halo de contraste perimetral
  ctx.beginPath();
  ctx.arc(c, c, outerRadius + ringWidth + 1, 0, Math.PI * 2);
  ctx.fillStyle = haloColor;
  ctx.fill();

  // 2. Fondo del cuadrante de la brújula CON EL COLOR DE LA CATEGORÍA
  ctx.beginPath();
  ctx.arc(c, c, outerRadius, 0, Math.PI * 2);
  ctx.fillStyle = isLightSelection ? '#FFFFFF' : color;
  ctx.fill();

  // 3. Anillo perimetral exterior
  ctx.beginPath();
  ctx.arc(c, c, outerRadius, 0, Math.PI * 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = ringWidth;
  ctx.stroke();

  // 4. Marcas cardinales (ticks N, S, E, O)
  const tickLen = Math.max(2, outerRadius * 0.22);
  ctx.lineWidth = Math.max(1.2, ringWidth * 0.7);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';

  // N
  ctx.beginPath();
  ctx.moveTo(c, c - outerRadius + 1);
  ctx.lineTo(c, c - outerRadius + tickLen);
  ctx.stroke();
  // S
  ctx.beginPath();
  ctx.moveTo(c, c + outerRadius - 1);
  ctx.lineTo(c, c + outerRadius - tickLen);
  ctx.stroke();
  // E
  ctx.beginPath();
  ctx.moveTo(c + outerRadius - 1, c);
  ctx.lineTo(c + outerRadius - tickLen, c);
  ctx.stroke();
  // O
  ctx.beginPath();
  ctx.moveTo(c - outerRadius + 1, c);
  ctx.lineTo(c - outerRadius + tickLen, c);
  ctx.stroke();

  // 5. Aguja de la brújula (rotada a 45° estilo icono Explora / Compass)
  ctx.translate(c, c);
  ctx.rotate(-Math.PI / 4);

  // Mitad Norte (Blanco puro / Alto contraste)
  ctx.beginPath();
  ctx.moveTo(0, -needleLen);
  ctx.lineTo(needleWidth, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = isLightSelection ? '#141411' : '#FFFFFF';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -needleLen);
  ctx.lineTo(-needleWidth, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = isLightSelection ? '#333333' : '#F0EAD6';
  ctx.fill();

  // Mitad Sur (Negro sólido)
  ctx.beginPath();
  ctx.moveTo(0, needleLen);
  ctx.lineTo(needleWidth, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = isLightSelection ? '#666666' : '#141411';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, needleLen);
  ctx.lineTo(-needleWidth, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = isLightSelection ? '#888888' : '#2A2A26';
  ctx.fill();

  // Contorno de la aguja
  ctx.beginPath();
  ctx.moveTo(0, -needleLen);
  ctx.lineTo(needleWidth, 0);
  ctx.lineTo(0, needleLen);
  ctx.lineTo(-needleWidth, 0);
  ctx.closePath();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Pivote central
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.8, needleWidth * 0.4), 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 1.0;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();

  ctx.restore();
}