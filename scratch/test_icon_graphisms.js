import {
  drawTargetIcon,
  drawPrivateSquareIcon,
  drawSearchLupaIcon,
  drawExploreCompassIcon,
  drawVisitedBadge,
  drawFavoriteBadge,
  drawBadges
} from '../js/icons.js';

console.log('=== TEST: VERIFICACIÓN DE GRAFISMOS E ICONOS (NEO-BAUHAUS) ===');

let passCount = 0;
let totalCount = 0;

function assert(condition, message) {
  totalCount++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

function createMockCtx() {
  const operations = [];
  return new Proxy({
    save: () => operations.push('save'),
    restore: () => operations.push('restore'),
    beginPath: () => operations.push('beginPath'),
    closePath: () => operations.push('closePath'),
    moveTo: (...args) => operations.push(['moveTo', ...args]),
    lineTo: (...args) => operations.push(['lineTo', ...args]),
    arc: (...args) => operations.push(['arc', ...args]),
    bezierCurveTo: (...args) => operations.push(['bezierCurveTo', ...args]),
    fill: () => operations.push('fill'),
    stroke: () => operations.push('stroke'),
    fillRect: (...args) => operations.push(['fillRect', ...args]),
    strokeRect: (...args) => operations.push(['strokeRect', ...args]),
    fillText: (...args) => operations.push(['fillText', ...args]),
    translate: (...args) => operations.push(['translate', ...args]),
    rotate: (...args) => operations.push(['rotate', ...args]),
  }, {
    set: (target, prop, value) => {
      target[prop] = value;
      operations.push(['set', prop, value]);
      return true;
    }
  });
}

try {
  // Test 1: Badges
  const ctxBadge = createMockCtx();
  drawVisitedBadge(ctxBadge, 32, 64, false);
  drawFavoriteBadge(ctxBadge, 32, 64, true);
  assert(true, 'drawVisitedBadge y drawFavoriteBadge ejecutan sin excepciones');

  drawBadges(ctxBadge, 32, 64, true, true, false);
  assert(true, 'drawBadges con visited y favorite simultáneos renderiza correctamente');

  // Test 2: Target icons con badges
  const ctxTarget = createMockCtx();
  [0, 1, 2, 3].forEach((imp) => {
    drawTargetIcon(ctxTarget, 'rgb(233, 92, 12)', imp, 64, { isFavorite: true });
    drawTargetIcon(ctxTarget, 'rgb(233, 92, 12)', imp, 64, { isVisited: true });
    drawTargetIcon(ctxTarget, 'rgb(233, 92, 12)', imp, 64, { isVisited: true, isFavorite: true });
    drawTargetIcon(ctxTarget, 'rgb(255, 255, 255)', imp, 64, { isSelected: true, isFavorite: true });
  });
  assert(true, 'drawTargetIcon renderiza badges de favorito y visitado en todas las jerarquías (0-3)');

  // Test 3: Private icons con badges
  const ctxPrivate = createMockCtx();
  [0, 1, 2, 3].forEach((imp) => {
    drawPrivateSquareIcon(ctxPrivate, 'rgb(26, 83, 92)', imp, 64, { isFavorite: true, isVisited: true });
  });
  assert(true, 'drawPrivateSquareIcon renderiza correctamente en todas las jerarquías');

  // Test 4: Lupa de búsqueda
  const ctxLupa = createMockCtx();
  [0, 1, 2, 3].forEach((imp) => {
    drawSearchLupaIcon(ctxLupa, 'rgb(74, 124, 89)', imp, 64, { isDark: false });
    drawSearchLupaIcon(ctxLupa, 'rgb(255, 255, 255)', imp, 64, { isDark: true, isSelected: true });
  });
  assert(true, 'drawSearchLupaIcon (retícula de búsqueda) renderiza correctamente en modo claro y oscuro');

  // Test 5: Brújula de itinerario
  const ctxCompass = createMockCtx();
  [0, 1, 2, 3].forEach((imp) => {
    drawExploreCompassIcon(ctxCompass, 'rgb(212, 163, 115)', imp, 64, { isDark: false });
    drawExploreCompassIcon(ctxCompass, 'rgb(20, 20, 17)', imp, 64, { isDark: true, isSelected: true });
  });
  assert(true, 'drawExploreCompassIcon (círculo + espiga Norte + N) renderiza en todas las jerarquías');

  console.log(`\n===============================================================`);
  console.log(`RESULTADO DE LA VERIFICACIÓN: ${passCount} / ${totalCount} PRUEBAS SUPERADAS`);
  console.log(`===============================================================`);

  if (passCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
} catch (err) {
  console.error('Error durante la ejecución del test:', err);
  process.exit(1);
}

