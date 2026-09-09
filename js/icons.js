/* =========================================================================
   ICONS.JS — Dibujo de iconos dinámicos (canvas) con geometría original y color por categoría
   ========================================================================= */

export function buildIcon(draw, color, importance, size = 64, options = {}) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, color, importance, size, options);
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
  ctx.fillText(emoji || '', center, center + 1);

  return ctx.getImageData(0, 0, size, size);
}

export function drawVisitedBadge(ctx, c, s) {
  const badgeX = c + s * 0.22;
  const badgeY = c - s * 0.22;
  const badgeR = s * 0.13;

  ctx.save();
  // Sombra dura offset técnica de 1px
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.arc(badgeX + 1, badgeY + 1, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Fondo circular verde bosque editorial (#1D5C2B)
  ctx.fillStyle = '#1D5C2B';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Borde nítido blanco sólido (#FFFFFF)
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.stroke();

  // Trazo técnico de visado / comprobación "✓"
  ctx.beginPath();
  ctx.moveTo(badgeX - badgeR * 0.45, badgeY - badgeR * 0.05);
  ctx.lineTo(badgeX - badgeR * 0.08, badgeY + badgeR * 0.35);
  ctx.lineTo(badgeX + badgeR * 0.50, badgeY - badgeR * 0.35);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

export function drawPendingBadge(ctx, c, s) {
  const badgeX = c + s * 0.22;
  const badgeY = c - s * 0.22;
  const badgeR = s * 0.13;

  ctx.save();
  // Sombra dura offset técnica de 1px
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.arc(badgeX + 1, badgeY + 1, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Fondo circular ámbar (#EFBC02)
  ctx.fillStyle = '#EFBC02';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Borde nítido negro (#141411)
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#141411';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.stroke();

  // Punto central técnico
  ctx.fillStyle = '#141411';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawTargetIcon(ctx, color, importance, s, options = {}) {
  const c = s / 2;
  const isVisited = Boolean(options.isVisited || color === '#82c812');
  const isPending = Boolean(options.isPending || color === '#FFCC00');
  const isLightSelection = color === '#FFFFFF' || color === '#ffffff' || color === '#F5F4F0' || color === '#f5f4f0';
  const isDarkSelection = color === '#141411';
  const strokeColor = isDarkSelection ? '#F8F1DF' : '#141411';
  const haloColor = isDarkSelection ? '#141411' : '#F8F1DF';

  if (importance === 0) {
    // 0: OBRA CUMBRE — Diamante / Rombo técnico Neo-Bauhaus (45°), máxima jerarquía
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(Math.PI / 4);

    const half = s * 0.28;

    // 1. Halo perimetral de contraste
    ctx.fillStyle = haloColor;
    ctx.fillRect(-half - 3, -half - 3, (half + 3) * 2, (half + 3) * 2);

    // 2. Relleno cromático de categoría arquitectónica
    ctx.fillStyle = isLightSelection ? '#FFFFFF' : (isDarkSelection ? '#141411' : color);
    ctx.fillRect(-half, -half, half * 2, half * 2);

    // 3. Contorno técnico sólido negro
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(-half, -half, half * 2, half * 2);

    // 4. Núcleo técnico central concéntrico
    ctx.fillStyle = strokeColor;
    const inner = half * 0.35;
    ctx.fillRect(-inner, -inner, inner * 2, inner * 2);

    ctx.restore();

    if (isVisited) {
      drawVisitedBadge(ctx, c, s);
    } else if (isPending) {
      drawPendingBadge(ctx, c, s);
    }
  } else if (importance === 1) {
    // 1: IMPRESCINDIBLE — Disco sólido Neo-Bauhaus con diana técnica central
    const r = s * 0.30;

    // 1. Halo perimetral de contraste
    ctx.fillStyle = haloColor;
    ctx.beginPath();
    ctx.arc(c, c, r + 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 2. Relleno cromático de categoría
    ctx.fillStyle = isLightSelection ? '#FFFFFF' : (isDarkSelection ? '#141411' : color);
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();

    // 3. Contorno técnico sólido negro
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Diana / punto técnico central
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(c, c, r * 0.32, 0, Math.PI * 2);
    ctx.fill();

    if (isVisited) {
      drawVisitedBadge(ctx, c, s);
    } else if (isPending) {
      drawPendingBadge(ctx, c, s);
    }
  } else if (importance === 2) {
    // 2: RECOMENDADA — Anillo técnico de masa reducida (hueco, no satura trama urbana)
    const r = s * 0.24;

    // 1. Fondo hueso/panel interior
    ctx.fillStyle = isDarkSelection ? '#1E1E1B' : '#F8F1DF';
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();

    // 2. Anillo técnico en el color de la categoría
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = isLightSelection ? '#FFFFFF' : (isDarkSelection ? '#F8F1DF' : color);
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Núcleo técnico central compacto en color de categoría (o negro si seleccionado)
    ctx.fillStyle = isLightSelection ? '#141411' : (isDarkSelection ? '#F8F1DF' : color);
    ctx.beginPath();
    ctx.arc(c, c, r * 0.36, 0, Math.PI * 2);
    ctx.fill();

    if (isVisited) {
      drawVisitedBadge(ctx, c, s);
    } else if (isPending) {
      drawPendingBadge(ctx, c, s);
    }
  } else {
    // 3: DOCUMENTADA — Micro-nodo cartográfico preciso (sustituye la cruz '+')
    const r = s * 0.16;

    // 1. Halo perimetral sutil
    ctx.fillStyle = haloColor;
    ctx.beginPath();
    ctx.arc(c, c, r + 1.8, 0, Math.PI * 2);
    ctx.fill();

    // 2. Punto sólido en color de categoría
    ctx.fillStyle = isLightSelection ? '#FFFFFF' : (isDarkSelection ? '#141411' : color);
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();

    // 3. Contorno fino negro
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();

    if (isVisited) {
      drawVisitedBadge(ctx, c, s);
    } else if (isPending) {
      drawPendingBadge(ctx, c, s);
    }
  }
}

/**
 * Dibuja iconos cuadrados limpios para obras/etiquetas privadas,
 * reflejando la jerarquía de tamaño por importancia y color por categoría arquitectónica (Neo-Bauhaus).
 */
export function drawPrivateSquareIcon(ctx, color, importance, s, options = {}) {
  const c = s / 2;
  const isVisited = Boolean(options.isVisited || color === '#82c812');
  const isPending = Boolean(options.isPending || color === '#FFCC00');
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

  if (isVisited) {
    drawVisitedBadge(ctx, c, s);
  } else if (isPending) {
    drawPendingBadge(ctx, c, s);
  }
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