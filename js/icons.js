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

export function drawVisitedBadge(ctx, c, s, positionLeft = false) {
  const offsetX = positionLeft ? -s * 0.21 : s * 0.21;
  const badgeX = c + offsetX;
  const badgeY = c - s * 0.21;
  const badgeR = s * 0.11;

  ctx.save();
  // Halo arquitectónico nítido de contraste (cero sombra borrosa)
  ctx.fillStyle = 'rgba(248, 241, 223, 0.95)';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR + 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Fondo circular verde esmeralda / bosque editorial
  ctx.fillStyle = 'rgb(22, 101, 52)';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Borde técnico fino blanco puro
  ctx.lineWidth = 1.0;
  ctx.strokeStyle = 'rgb(255, 255, 255)';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.stroke();

  // Trazo técnico ortogonal de visado "✓"
  ctx.beginPath();
  ctx.moveTo(badgeX - badgeR * 0.42, badgeY);
  ctx.lineTo(badgeX - badgeR * 0.08, badgeY + badgeR * 0.38);
  ctx.lineTo(badgeX + badgeR * 0.46, badgeY - badgeR * 0.32);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgb(255, 255, 255)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

export function drawFavoriteBadge(ctx, c, s, positionLeft = false) {
  const offsetX = positionLeft ? -s * 0.21 : s * 0.21;
  const badgeX = c + offsetX;
  const badgeY = c - s * 0.21;
  const badgeR = s * 0.11;

  ctx.save();
  // Halo arquitectónico nítido de contraste
  ctx.fillStyle = 'rgba(248, 241, 223, 0.95)';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR + 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Fondo circular en Vermillón Nolli
  ctx.fillStyle = 'rgb(234, 86, 13)';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Borde técnico fino blanco puro
  ctx.lineWidth = 1.0;
  ctx.strokeStyle = 'rgb(255, 255, 255)';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.stroke();

  // Icono geométrico interior de corazón técnico
  const hR = badgeR * 0.52;
  const topY = badgeY - hR * 0.2;
  const botY = badgeY + hR * 0.75;
  const leftX = badgeX - hR;
  const rightX = badgeX + hR;

  ctx.beginPath();
  ctx.moveTo(badgeX, topY + hR * 0.3);
  ctx.bezierCurveTo(badgeX - hR * 0.5, topY - hR * 0.7, leftX, topY - hR * 0.1, leftX, topY + hR * 0.25);
  ctx.bezierCurveTo(leftX, topY + hR * 0.65, badgeX - hR * 0.3, botY - hR * 0.15, badgeX, botY);
  ctx.bezierCurveTo(badgeX + hR * 0.3, botY - hR * 0.15, rightX, topY + hR * 0.65, rightX, topY + hR * 0.25);
  ctx.bezierCurveTo(rightX, topY - hR * 0.1, badgeX + hR * 0.5, topY - hR * 0.7, badgeX, topY + hR * 0.3);
  ctx.closePath();
  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.fill();

  ctx.restore();
}

export function drawPendingBadge(ctx, c, s) {
  const badgeX = c + s * 0.20;
  const badgeY = c - s * 0.20;
  const badgeR = s * 0.12;

  ctx.save();
  ctx.fillStyle = 'rgba(248, 241, 223, 0.95)';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR + 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Fondo circular ámbar
  ctx.fillStyle = 'rgb(246, 166, 0)';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // Borde nítido negro
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgb(20, 20, 17)';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.stroke();

  // Punto central técnico
  ctx.fillStyle = 'rgb(20, 20, 17)';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBadges(ctx, c, s, isVisited, isFavorite, isPending) {
  if (isVisited && isFavorite) {
    drawVisitedBadge(ctx, c, s, false);
    drawFavoriteBadge(ctx, c, s, true);
  } else if (isVisited) {
    drawVisitedBadge(ctx, c, s, false);
  } else if (isFavorite) {
    drawFavoriteBadge(ctx, c, s, false);
  } else if (isPending) {
    drawPendingBadge(ctx, c, s);
  }
}

export function drawTargetIcon(ctx, color, importance, s, options = {}) {
  const c = s / 2;
  const isVisited = Boolean(options.isVisited || color === '#82c812');
  const isPending = Boolean(options.isPending || color === '#FFCC00');
  const isFavorite = Boolean(options.isFavorite);
  const isLightSelection = color === '#FFFFFF' || color === '#ffffff' || color === '#F5F4F0' || color === '#f5f4f0';
  const isDarkSelection = color === '#141411';
  const isSelected = Boolean(options.isSelected || isLightSelection || isDarkSelection);
  const isDark = Boolean(options.isDark);
  const isFullColor = Boolean(options.isFullColor);

  // Paleta estructural: contorno crema en modo claro y negro en modo oscuro; punto central siempre negro
  const strokeColor = isDark ? '#141411' : '#F8F1DF';
  const dotColor = '#141411';
  const haloColor = isDark ? '#141411' : '#F8F1DF';

  if (importance === 0) {
    // 0: OBRA CUMBRE (CATEGORÍA 1) — Gran diamante patrimonial Neo-Bauhaus (45°), macizo con contorno firme y punto central
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(Math.PI / 4);

    const half = s * 0.22;
    const strokeWidth = 1.8;
    const pip = half * 0.28;

    // Halo perimetral de contraste
    ctx.fillStyle = haloColor;
    ctx.fillRect(-half - strokeWidth * 0.5 - 1.2, -half - strokeWidth * 0.5 - 1.2, (half + strokeWidth * 0.5 + 1.2) * 2, (half + strokeWidth * 0.5 + 1.2) * 2);

    if (isSelected) {
      // Estado seleccionado: inversión de alto contraste
      ctx.fillStyle = isDark ? '#FFFFFF' : '#141411';
      ctx.fillRect(-half, -half, half * 2, half * 2);
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(-half, -half, half * 2, half * 2);

      ctx.fillStyle = isDark ? '#141411' : '#F8F1DF';
      ctx.fillRect(-pip, -pip, pip * 2, pip * 2);
    } else {
      // 1. Cuerpo macizo en color de categoría
      ctx.fillStyle = color;
      ctx.fillRect(-half, -half, half * 2, half * 2);

      // 2. Contorno macizo
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(-half, -half, half * 2, half * 2);

      // 3. Pequeño punto en el centro (siempre negro)
      ctx.fillStyle = dotColor;
      ctx.fillRect(-pip, -pip, pip * 2, pip * 2);
    }

    ctx.restore();

    drawBadges(ctx, c, s, isVisited, isFavorite, isPending);
  } else if (importance === 1) {
    // 1: IMPRESCINDIBLE (CATEGORÍA 2) — Círculo macizo con pequeño punto central y contorno macizo
    const r = s * 0.16;
    const strokeWidth = 1.8;
    const pipR = Math.max(2.0, r * 0.28);

    // Halo perimetral de contraste nítido
    ctx.fillStyle = haloColor;
    ctx.beginPath();
    ctx.arc(c, c, r + strokeWidth * 0.5 + 1.2, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
      ctx.fillStyle = isDark ? '#FFFFFF' : '#141411';
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isDark ? '#141411' : '#F8F1DF';
      ctx.beginPath();
      ctx.arc(c, c, pipR, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 1. Círculo macizo en color de categoría pleno
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      // 2. Contorno macizo (crema en modo claro, negro en modo oscuro)
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();

      // 3. Pequeño punto en el centro
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(c, c, pipR, 0, Math.PI * 2);
      ctx.fill();
    }

    drawBadges(ctx, c, s, isVisited, isFavorite, isPending);
  } else if (importance === 2) {
    // 2: RECOMENDADA — Círculo macizo solo con contorno (sin punto central)
    const r = s * 0.12;
    const strokeWidth = 1.5;

    // Halo perimetral de contraste nítido
    ctx.fillStyle = haloColor;
    ctx.beginPath();
    ctx.arc(c, c, r + strokeWidth * 0.5 + 1.0, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
      ctx.fillStyle = isDark ? '#FFFFFF' : '#141411';
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // 1. Círculo macizo en color de categoría
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      // 2. Contorno macizo (crema en modo claro, negro en modo oscuro)
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawBadges(ctx, c, s, isVisited, isFavorite, isPending);
  } else {
    // 3: DOCUMENTADA — Círculo macizo solo con contorno (sin punto central)
    const r = s * 0.085;
    const strokeWidth = 1.3;

    // Halo perimetral de contraste nítido
    ctx.fillStyle = haloColor;
    ctx.beginPath();
    ctx.arc(c, c, r + strokeWidth * 0.5 + 0.9, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
      ctx.fillStyle = isDark ? '#FFFFFF' : '#141411';
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // 1. Círculo macizo en color de categoría
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();

      // 2. Contorno macizo (crema en modo claro, negro en modo oscuro)
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawBadges(ctx, c, s, isVisited, isFavorite, isPending);
  }
}

/**
 * Dibuja iconos cuadrados limpios para obras/etiquetas privadas
 */
export function drawPrivateSquareIcon(ctx, color, importance, s, options = {}) {
  const c = s / 2;
  const isVisited = Boolean(options.isVisited || color === '#82c812');
  const isPending = Boolean(options.isPending || color === '#FFCC00');
  const isFavorite = Boolean(options.isFavorite);
  const isDark = Boolean(options.isDark);
  const strokeColor = isDark ? '#141411' : '#F8F1DF';
  const dotColor = '#141411';
  const haloColor = isDark ? '#141411' : '#F8F1DF';

  ctx.save();

  if (importance === 0) {
    ctx.translate(c, c);
    ctx.rotate(Math.PI / 4);
    const half = s * 0.22;
    const strokeWidth = 1.8;
    const pip = half * 0.28;

    ctx.fillStyle = haloColor;
    ctx.fillRect(-half - strokeWidth * 0.5 - 1.2, -half - strokeWidth * 0.5 - 1.2, (half + strokeWidth * 0.5 + 1.2) * 2, (half + strokeWidth * 0.5 + 1.2) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(-half, -half, half * 2, half * 2);

    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(-half, -half, half * 2, half * 2);

    ctx.fillStyle = dotColor;
    ctx.fillRect(-pip, -pip, pip * 2, pip * 2);
  } else if (importance === 1) {
    const half = s * 0.16;
    const strokeWidth = 1.8;
    const pip = half * 0.28;

    ctx.fillStyle = haloColor;
    ctx.fillRect(c - half - strokeWidth * 0.5 - 1.2, c - half - strokeWidth * 0.5 - 1.2, (half + strokeWidth * 0.5 + 1.2) * 2, (half + strokeWidth * 0.5 + 1.2) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);

    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);

    ctx.fillStyle = dotColor;
    ctx.fillRect(c - pip, c - pip, pip * 2, pip * 2);
  } else if (importance === 2) {
    const half = s * 0.12;
    const strokeWidth = 1.5;
    const pip = half * 0.28;

    ctx.fillStyle = haloColor;
    ctx.fillRect(c - half - strokeWidth * 0.5 - 1.0, c - half - strokeWidth * 0.5 - 1.0, (half + strokeWidth * 0.5 + 1.0) * 2, (half + strokeWidth * 0.5 + 1.0) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);

    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);
  } else {
    const half = s * 0.085;
    const strokeWidth = 1.3;

    ctx.fillStyle = haloColor;
    ctx.fillRect(c - half - strokeWidth * 0.5 - 0.9, c - half - strokeWidth * 0.5 - 0.9, (half + strokeWidth * 0.5 + 0.9) * 2, (half + strokeWidth * 0.5 + 0.9) * 2);

    ctx.fillStyle = color;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);

    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(c - half, c - half, half * 2, half * 2);
  }

  ctx.restore();

  drawBadges(ctx, c, s, isVisited, isFavorite, isPending);
}

/**
 * Dibuja iconos de lupa para resultados de búsqueda
 */
export function drawSearchLupaIcon(ctx, color, importance, s, options = {}) {
  const c = s / 2;
  const isDark = Boolean(options.isDark);
  const isLight = typeof color === 'string' && (color === 'white' || color.includes('255, 255, 255') || color.toLowerCase() === String.fromCharCode(35) + 'ffffff' || color.toLowerCase() === String.fromCharCode(35) + 'f8f1df' || color.toLowerCase() === String.fromCharCode(35) + 'f5f4f0');
  const isDarkSelection = typeof color === 'string' && (color === 'black' || color.includes('20, 20, 17') || color.toLowerCase() === String.fromCharCode(35) + '141411' || color.toLowerCase() === String.fromCharCode(35) + '000000');
  const strokeColor = (isDark || isDarkSelection) ? 'rgb(20, 20, 17)' : 'rgb(248, 241, 223)';
  const haloColor = (isDark || isDarkSelection) ? 'rgb(20, 20, 17)' : 'rgba(248, 241, 223, 0.95)';
  const bodyColor = isLight ? 'rgb(255, 255, 255)' : (isDarkSelection ? 'rgb(20, 20, 17)' : color);

  let lensRadius, handleLen, handleWidth, ringWidth;

  if (importance === 0) {
    lensRadius = s * 0.18;
    handleLen = s * 0.12;
    handleWidth = 2.4;
    ringWidth = 1.6;
  } else if (importance === 1) {
    lensRadius = s * 0.15;
    handleLen = s * 0.10;
    handleWidth = 2.0;
    ringWidth = 1.3;
  } else if (importance === 2) {
    lensRadius = s * 0.12;
    handleLen = s * 0.08;
    handleWidth = 1.6;
    ringWidth = 1.1;
  } else {
    lensRadius = s * 0.09;
    handleLen = s * 0.06;
    handleWidth = 1.3;
    ringWidth = 0.9;
  }

  // Centro visual calibrado para que el conjunto (lente + mango a 45°) quede perfectamente centrado en c
  const angle = Math.PI / 4;
  const offset = handleLen * 0.28;
  const lensX = c - Math.cos(angle) * offset;
  const lensY = c - Math.sin(angle) * offset;

  const startX = lensX + Math.cos(angle) * (lensRadius * 0.88);
  const startY = lensY + Math.sin(angle) * (lensRadius * 0.88);
  const endX = startX + Math.cos(angle) * handleLen;
  const endY = startY + Math.sin(angle) * handleLen;

  ctx.save();

  // 1. Halo técnico perimetral continuo
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = haloColor;
  ctx.lineWidth = handleWidth + 2.4;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(lensX, lensY, lensRadius + ringWidth + 1.2, 0, Math.PI * 2);
  ctx.fillStyle = haloColor;
  ctx.fill();

  // 2. Mango técnico ortogonal
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = handleWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 3. Lente circular en color de categoría
  ctx.beginPath();
  ctx.arc(lensX, lensY, lensRadius, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();

  // 4. Borde nítido de la lente
  ctx.lineWidth = ringWidth;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();

  // 5. Retícula interior técnica según jerarquía arquitectónica
  if (importance === 0) {
    const innerR = lensRadius * 0.42;
    ctx.beginPath();
    ctx.arc(lensX, lensY, innerR, 0, Math.PI * 2);
    ctx.fillStyle = haloColor;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(lensX, lensY, innerR * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(20, 20, 17)';
    ctx.fill();
  } else if (importance === 1) {
    const innerR = lensRadius * 0.38;
    ctx.beginPath();
    ctx.arc(lensX, lensY, innerR, 0, Math.PI * 2);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
  } else if (importance === 2) {
    ctx.beginPath();
    ctx.arc(lensX, lensY, lensRadius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(20, 20, 17)';
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Dibuja iconos de brújula / compass para itinerarios de la pestaña Explora
 */
export function drawExploreCompassIcon(ctx, color, importance, s, options = {}) {
  const c = s / 2;
  const isDark = Boolean(options.isDark);
  const isLight = typeof color === 'string' && (color === 'white' || color.includes('255, 255, 255') || color.toLowerCase() === String.fromCharCode(35) + 'ffffff' || color.toLowerCase() === String.fromCharCode(35) + 'f8f1df' || color.toLowerCase() === String.fromCharCode(35) + 'f5f4f0');
  const isDarkSelection = typeof color === 'string' && (color === 'black' || color.includes('20, 20, 17') || color.toLowerCase() === String.fromCharCode(35) + '141411' || color.toLowerCase() === String.fromCharCode(35) + '000000');
  const strokeColor = (isDark || isDarkSelection) ? 'rgb(20, 20, 17)' : 'rgb(248, 241, 223)';
  const haloColor = (isDark || isDarkSelection) ? 'rgb(20, 20, 17)' : 'rgba(248, 241, 223, 0.95)';
  const bodyColor = isLight ? 'rgb(255, 255, 255)' : (isDarkSelection ? 'rgb(20, 20, 17)' : color);
  const vermilionNolli = 'rgb(234, 86, 13)';

  let outerRadius, ringWidth, tickLen, tickWidth;

  if (importance === 0) {
    outerRadius = s * 0.22;
    ringWidth = 1.4;
    tickLen = s * 0.08;
    tickWidth = 2.2;
  } else if (importance === 1) {
    outerRadius = s * 0.18;
    ringWidth = 1.2;
    tickLen = s * 0.07;
    tickWidth = 1.9;
  } else if (importance === 2) {
    outerRadius = s * 0.14;
    ringWidth = 1.0;
    tickLen = s * 0.06;
    tickWidth = 1.6;
  } else {
    outerRadius = s * 0.10;
    ringWidth = 0.8;
    tickLen = s * 0.05;
    tickWidth = 1.3;
  }

  ctx.save();

  // 1. Halo perimetral de contraste (esfera + espiga Norte)
  ctx.beginPath();
  ctx.arc(c, c, outerRadius + ringWidth + 1.2, 0, Math.PI * 2);
  ctx.fillStyle = haloColor;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(c, c - outerRadius + 1);
  ctx.lineTo(c, c - outerRadius - tickLen);
  ctx.strokeStyle = haloColor;
  ctx.lineWidth = tickWidth + 2.2;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 2. Esfera / cuadrante en color de categoría
  ctx.beginPath();
  ctx.arc(c, c, outerRadius, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();

  // 3. Contorno nítido de la esfera
  ctx.lineWidth = ringWidth;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();

  // 4. Línea perpendicular en el contorno mirando al Norte (Vermillón Nolli)
  ctx.beginPath();
  ctx.moveTo(c, c - outerRadius + 0.5);
  ctx.lineTo(c, c - outerRadius - tickLen);
  ctx.strokeStyle = vermilionNolli;
  ctx.lineWidth = tickWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 5. Letra de dirección "N" centrada en el interior del círculo
  const fontSize = Math.max(7, Math.round(outerRadius * 1.15));
  ctx.font = `700 ${fontSize}px 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (isLight) {
    ctx.fillStyle = 'rgb(20, 20, 17)';
  } else if (isDarkSelection) {
    ctx.fillStyle = 'rgb(248, 241, 223)';
  } else {
    ctx.fillStyle = 'rgb(255, 255, 255)';
  }

  const textOffsetY = fontSize * 0.04;
  ctx.fillText('N', c, c + textOffsetY);

  ctx.restore();
}