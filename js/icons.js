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
  ctx.arc(center, center, size * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = isDark ? '#1C1C1A' : '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2.0;
  ctx.strokeStyle = isDark ? '#FFFFFF' : '#141411';
  ctx.stroke();

  // Emoji centrado
  ctx.font = `${Math.round(size * 0.40)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji || '', center, center + 1);

  return ctx.getImageData(0, 0, size, size);
}

export function drawVisitedBadge(ctx, c, s) {
  const badgeX = c + s * 0.20;
  const badgeY = c - s * 0.20;
  const badgeR = s * 0.12;

  ctx.save();
  // Sombra offset técnica de 1px
  ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
  ctx.beginPath();
  ctx.arc(badgeX + 1, badgeY + 1, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Fondo circular verde bosque editorial (#1D5C2B)
  ctx.fillStyle = '#1D5C2B';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Borde nítido blanco sólido (#FFFFFF)
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.stroke();

  // Trazo técnico de visado / comprobación "✓"
  ctx.beginPath();
  ctx.moveTo(badgeX - badgeR * 0.45, badgeY - badgeR * 0.05);
  ctx.lineTo(badgeX - badgeR * 0.08, badgeY + badgeR * 0.35);
  ctx.lineTo(badgeX + badgeR * 0.50, badgeY - badgeR * 0.35);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

export function drawPendingBadge(ctx, c, s) {
  const badgeX = c + s * 0.20;
  const badgeY = c - s * 0.20;
  const badgeR = s * 0.12;

  ctx.save();
  // Sombra offset técnica de 1px
  ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
  ctx.beginPath();
  ctx.arc(badgeX + 1, badgeY + 1, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Fondo circular ámbar (#EFBC02)
  ctx.fillStyle = '#EFBC02';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Borde nítido negro (#141411)
  ctx.lineWidth = 1.4;
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
  const isSelected = Boolean(options.isSelected || isLightSelection || isDarkSelection);
  const isDark = Boolean(options.isDark);
  const isFullColor = Boolean(options.isFullColor);

  // Paleta estructural Neo-Bauhaus: tinta arquitectónica y halo de recorte técnico
  const inkColor = isDark ? '#FFFFFF' : '#141411';
  const haloColor = isDark ? '#141411' : '#F8F1DF';

  if (importance === 0) {
    // 0: OBRA CUMBRE (CATEGORÍA 1) — Gran diamante patrimonial Neo-Bauhaus (45°), protagonista y dominante
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(Math.PI / 4);

    const half = s * 0.22;

    // Halo perimetral ultrafino de contraste
    ctx.fillStyle = haloColor;
    ctx.fillRect(-half - 1.2, -half - 1.2, (half + 1.2) * 2, (half + 1.2) * 2);

    if (isSelected) {
      // Estado seleccionado: inversión de alto contraste
      ctx.fillStyle = inkColor;
      ctx.fillRect(-half, -half, half * 2, half * 2);
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = haloColor;
      ctx.strokeRect(-half, -half, half * 2, half * 2);

      ctx.fillStyle = color;
      const inner = half * 0.45;
      ctx.fillRect(-inner, -inner, inner * 2, inner * 2);
    } else {
      // Cuerpo en color de categoría vivo y protagonista
      ctx.fillStyle = color;
      ctx.fillRect(-half, -half, half * 2, half * 2);

      // Borde técnico negro ultrafino (hairline nítido, no grueso)
      ctx.lineWidth = 0.85;
      ctx.strokeStyle = inkColor;
      ctx.strokeRect(-half, -half, half * 2, half * 2);

      // Núcleo geométrico interior de hito patrimonial (blanco/halo con punto de tinta)
      const inner = half * 0.38;
      ctx.fillStyle = haloColor;
      ctx.fillRect(-inner, -inner, inner * 2, inner * 2);
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = inkColor;
      ctx.strokeRect(-inner, -inner, inner * 2, inner * 2);

      const micro = inner * 0.45;
      ctx.fillStyle = inkColor;
      ctx.fillRect(-micro, -micro, micro * 2, micro * 2);
    }

    ctx.restore();

    if (isVisited) {
      drawVisitedBadge(ctx, c, s);
    } else if (isPending) {
      drawPendingBadge(ctx, c, s);
    }
  } else if (importance === 1) {
    // 1: IMPRESCINDIBLE (CATEGORÍA 2) — Diana técnica circular en color de categoría con borde fino
    const r = s * 0.16;

    // Halo perimetral ultrafino
    ctx.fillStyle = haloColor;
    ctx.beginPath();
    ctx.arc(c, c, r + 1.2, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
      ctx.fillStyle = inkColor;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 1.0;
      ctx.strokeStyle = haloColor;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c, c, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Cuerpo en color de categoría pleno
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      // Borde técnico negro ultrafino
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = inkColor;
      ctx.stroke();

      // Diana concéntrica interior
      const innerR = r * 0.42;
      ctx.fillStyle = haloColor;
      ctx.beginPath();
      ctx.arc(c, c, innerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = inkColor;
      ctx.stroke();

      ctx.fillStyle = inkColor;
      ctx.beginPath();
      ctx.arc(c, c, innerR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isVisited) {
      drawVisitedBadge(ctx, c, s);
    } else if (isPending) {
      drawPendingBadge(ctx, c, s);
    }
  } else if (importance === 2) {
    // 2: RECOMENDADA — Nodo compacto en color de categoría con borde ultrafino
    const r = s * 0.12;

    ctx.fillStyle = haloColor;
    ctx.beginPath();
    ctx.arc(c, c, r + 1.0, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
      ctx.fillStyle = inkColor;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Cuerpo en color de categoría
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      // Borde técnico ultrafino
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = inkColor;
      ctx.stroke();

      // Micro-punto central técnico
      const pipR = r * 0.35;
      ctx.fillStyle = haloColor;
      ctx.beginPath();
      ctx.arc(c, c, pipR, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isVisited) {
      drawVisitedBadge(ctx, c, s);
    } else if (isPending) {
      drawPendingBadge(ctx, c, s);
    }
  } else {
    // 3: DOCUMENTADA — Micro-punto cartográfico en color de categoría con borde ultrafino
    const r = s * 0.08;

    ctx.fillStyle = haloColor;
    ctx.beginPath();
    ctx.arc(c, c, r + 0.9, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
      ctx.fillStyle = inkColor;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Cuerpo sólido en color de categoría
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      // Borde ultrafino
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = inkColor;
      ctx.stroke();
    }

    if (isVisited) {
      drawVisitedBadge(ctx, c, s);
    } else if (isPending) {
      drawPendingBadge(ctx, c, s);
    }
  }
}

/**
 * Dibuja iconos cuadrados limpios para obras/etiquetas privadas
 */
export function drawPrivateSquareIcon(ctx, color, importance, s, options = {}) {
  const c = s / 2;
  const isVisited = Boolean(options.isVisited || color === '#82c812');
  const isPending = Boolean(options.isPending || color === '#FFCC00');
  const isDark = Boolean(options.isDark);
  const inkColor = isDark ? '#FFFFFF' : '#141411';
  const haloColor = isDark ? '#141411' : '#F8F1DF';

  ctx.save();

  if (importance === 0) {
    ctx.translate(c, c);
    ctx.rotate(Math.PI / 4);
    const half = s * 0.22;

    ctx.fillStyle = haloColor;
    ctx.fillRect(-half - 1.2, -half - 1.2, (half + 1.2) * 2, (half + 1.2) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(-half, -half, half * 2, half * 2);

    ctx.lineWidth = 0.85;
    ctx.strokeStyle = inkColor;
    ctx.strokeRect(-half, -half, half * 2, half * 2);

    const inner = half * 0.38;
    ctx.fillStyle = haloColor;
    ctx.fillRect(-inner, -inner, inner * 2, inner * 2);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = inkColor;
    ctx.strokeRect(-inner, -inner, inner * 2, inner * 2);
  } else if (importance === 1) {
    const half = s * 0.16;

    ctx.fillStyle = haloColor;
    ctx.fillRect(c - half - 1.2, c - half - 1.2, (half + 1.2) * 2, (half + 1.2) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = inkColor;
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);

    const inner = half * 0.40;
    ctx.fillStyle = haloColor;
    ctx.fillRect(c - inner, c - inner, inner * 2, inner * 2);
  } else if (importance === 2) {
    const half = s * 0.12;

    ctx.fillStyle = haloColor;
    ctx.fillRect(c - half - 1.0, c - half - 1.0, (half + 1.0) * 2, (half + 1.0) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);

    ctx.lineWidth = 0.75;
    ctx.strokeStyle = inkColor;
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);

    const inner = half * 0.35;
    ctx.fillStyle = haloColor;
    ctx.fillRect(c - inner, c - inner, inner * 2, inner * 2);
  } else {
    const half = s * 0.08;

    ctx.fillStyle = haloColor;
    ctx.fillRect(c - half - 0.9, c - half - 0.9, (half + 0.9) * 2, (half + 0.9) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);

    ctx.lineWidth = 0.7;
    ctx.strokeStyle = inkColor;
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
 * Dibuja iconos de lupa para resultados de búsqueda
 */
export function drawSearchLupaIcon(ctx, color, importance, s) {
  const c = s / 2;
  const isLightSelection = color === '#FFFFFF' || color === '#ffffff' || color === '#F5F4F0' || color === '#f5f4f0';
  const isDarkSelection = color === '#141411';
  const strokeColor = isDarkSelection ? '#F8F1DF' : '#141411';
  const haloColor = isDarkSelection ? '#141411' : '#F8F1DF';

  let lensRadius, handleLen, handleWidth, ringWidth;

  if (importance === 0) {
    lensRadius = s * 0.20;
    handleLen = s * 0.18;
    handleWidth = 3.6;
    ringWidth = 2.4;
  } else if (importance === 1) {
    lensRadius = s * 0.17;
    handleLen = s * 0.15;
    handleWidth = 3.0;
    ringWidth = 2.0;
  } else if (importance === 2) {
    lensRadius = s * 0.14;
    handleLen = s * 0.13;
    handleWidth = 2.4;
    ringWidth = 1.8;
  } else {
    lensRadius = s * 0.11;
    handleLen = s * 0.10;
    handleWidth = 2.0;
    ringWidth = 1.4;
  }

  const lensX = c - s * 0.06;
  const lensY = c - s * 0.06;

  ctx.save();

  const angle = Math.PI / 4;
  const startX = lensX + Math.cos(angle) * (lensRadius * 0.85);
  const startY = lensY + Math.sin(angle) * (lensRadius * 0.85);
  const endX = startX + Math.cos(angle) * handleLen;
  const endY = startY + Math.sin(angle) * handleLen;

  // Sombra del mango
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = handleWidth + 2.0;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Mango
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = isLightSelection ? '#FFFFFF' : color;
  ctx.lineWidth = handleWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Halo perimetral
  ctx.beginPath();
  ctx.arc(lensX, lensY, lensRadius + ringWidth, 0, Math.PI * 2);
  ctx.fillStyle = haloColor;
  ctx.fill();

  // Lente con color de categoría
  ctx.beginPath();
  ctx.arc(lensX, lensY, lensRadius, 0, Math.PI * 2);
  ctx.fillStyle = isLightSelection ? '#FFFFFF' : color;
  ctx.fill();

  // Anillo de contorno
  ctx.beginPath();
  ctx.arc(lensX, lensY, lensRadius, 0, Math.PI * 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = ringWidth;
  ctx.stroke();

  if (importance <= 2) {
    ctx.beginPath();
    ctx.arc(lensX - lensRadius * 0.32, lensY - lensRadius * 0.32, lensRadius * 0.38, Math.PI * 1.05, Math.PI * 1.55);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = Math.max(1.0, ringWidth * 0.65);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  if (importance === 0) {
    ctx.beginPath();
    ctx.arc(lensX, lensY, lensRadius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Dibuja iconos de brújula / compass para itinerarios de la pestaña Explora
 */
export function drawExploreCompassIcon(ctx, color, importance, s) {
  const c = s / 2;
  const isLightSelection = color === '#FFFFFF' || color === '#ffffff' || color === '#F5F4F0' || color === '#f5f4f0';
  const isDarkSelection = color === '#141411';
  const strokeColor = isDarkSelection ? '#F8F1DF' : '#141411';
  const haloColor = isDarkSelection ? '#141411' : '#F8F1DF';

  let outerRadius, ringWidth, needleLen, needleWidth;

  if (importance === 0) {
    outerRadius = s * 0.28;
    ringWidth = 2.2;
    needleLen = s * 0.20;
    needleWidth = 4.8;
  } else if (importance === 1) {
    outerRadius = s * 0.24;
    ringWidth = 2.0;
    needleLen = s * 0.17;
    needleWidth = 4.0;
  } else if (importance === 2) {
    outerRadius = s * 0.20;
    ringWidth = 1.6;
    needleLen = s * 0.14;
    needleWidth = 3.4;
  } else {
    outerRadius = s * 0.16;
    ringWidth = 1.3;
    needleLen = s * 0.11;
    needleWidth = 2.8;
  }

  ctx.save();

  // Halo perimetral
  ctx.beginPath();
  ctx.arc(c, c, outerRadius + ringWidth + 1, 0, Math.PI * 2);
  ctx.fillStyle = haloColor;
  ctx.fill();

  // Cuadrante con color de categoría
  ctx.beginPath();
  ctx.arc(c, c, outerRadius, 0, Math.PI * 2);
  ctx.fillStyle = isLightSelection ? '#FFFFFF' : color;
  ctx.fill();

  // Anillo perimetral
  ctx.beginPath();
  ctx.arc(c, c, outerRadius, 0, Math.PI * 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = ringWidth;
  ctx.stroke();

  // Ticks cardinales
  const tickLen = Math.max(2, outerRadius * 0.20);
  ctx.lineWidth = Math.max(1.0, ringWidth * 0.7);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(c, c - outerRadius + 1);
  ctx.lineTo(c, c - outerRadius + tickLen);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(c, c + outerRadius - 1);
  ctx.lineTo(c, c + outerRadius - tickLen);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(c + outerRadius - 1, c);
  ctx.lineTo(c + outerRadius - tickLen, c);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(c - outerRadius + 1, c);
  ctx.lineTo(c - outerRadius + tickLen, c);
  ctx.stroke();

  // Aguja a 45°
  ctx.translate(c, c);
  ctx.rotate(-Math.PI / 4);

  // Mitad Norte (Blanco)
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

  // Mitad Sur (Negro)
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
  ctx.lineWidth = 1.0;
  ctx.stroke();

  // Pivote central
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.5, needleWidth * 0.4), 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();

  ctx.restore();
}