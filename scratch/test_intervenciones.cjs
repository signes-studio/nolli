const assert = require('assert');
const { cleanArchitectName, parseArchitectsAndInterventions, slugify } = require('../api/_lib/slugs.js');

console.log('🧪 Iniciando pruebas de la regla de intervenciones de arquitectos...');

// Caso 1: Ejemplo exacto del usuario
{
  const input = 'Enrique Viedma, Vetges tú (2008)';
  const res = parseArchitectsAndInterventions(input);
  console.log('Caso 1: Input =', input);
  console.log('  Arquitectos limpios:', res.arquitectos);
  console.log('  Intervenciones:', res.intervenciones);

  assert.deepStrictEqual(res.arquitectos, ['Enrique Viedma', 'Vetges tú'], 'Autores deben ser Enrique Viedma y Vetges tú (sin 2008)');
  assert.strictEqual(res.intervenciones.length, 1, 'Debe haber exactamente 1 intervención');
  assert.strictEqual(res.intervenciones[0].arquitecto, 'Vetges tú');
  assert.strictEqual(res.intervenciones[0].año, '2008');
  assert.strictEqual(res.intervenciones[0].texto, 'Intervención en 2008 por Vetges tú');
  assert.strictEqual(slugify(res.arquitectos[1]), 'vetges-tu', 'El slug debe ser vetges-tu sin -2008');
  console.log('  ✅ Caso 1 superado');
}

// Caso 2: Solo un arquitecto con intervención
{
  const input = 'Vetges tú (2008)';
  const res = parseArchitectsAndInterventions(input);
  assert.deepStrictEqual(res.arquitectos, ['Vetges tú']);
  assert.strictEqual(res.intervenciones.length, 1);
  assert.strictEqual(res.intervenciones[0].arquitecto, 'Vetges tú');
  assert.strictEqual(res.intervenciones[0].año, '2008');
  console.log('  ✅ Caso 2 superado');
}

// Caso 3: Múltiples intervenciones y separador punto y coma
{
  const input = 'Enrique Viedma; Vetges tú (2008), Carles Dolç (2015)';
  const res = parseArchitectsAndInterventions(input);
  assert.deepStrictEqual(res.arquitectos, ['Enrique Viedma', 'Vetges tú', 'Carles Dolç']);
  assert.strictEqual(res.intervenciones.length, 2);
  assert.strictEqual(res.intervenciones[0].año, '2008');
  assert.strictEqual(res.intervenciones[1].año, '2015');
  console.log('  ✅ Caso 3 superado');
}

// Caso 4: Palabras clave opcionales como (intervención 2008) o rangos como (2008-2010)
{
  const input = 'Arquitecto A, Arquitecto B (intervención 2012), Arquitecto C (2018-2020)';
  const res = parseArchitectsAndInterventions(input);
  assert.deepStrictEqual(res.arquitectos, ['Arquitecto A', 'Arquitecto B', 'Arquitecto C']);
  assert.strictEqual(res.intervenciones.length, 2);
  assert.strictEqual(res.intervenciones[0].año, '2012');
  assert.strictEqual(res.intervenciones[1].año, '2018-2020');
  console.log('  ✅ Caso 4 superado');
}

// Caso 5: Arquitecto tradicional sin intervenciones
{
  const input = 'Ludwig Mies van der Rohe, Lilly Reich';
  const res = parseArchitectsAndInterventions(input);
  assert.deepStrictEqual(res.arquitectos, ['Ludwig Mies van der Rohe', 'Lilly Reich']);
  assert.strictEqual(res.intervenciones.length, 0);
  console.log('  ✅ Caso 5 superado');
}

console.log('\n🎉 ¡Todas las pruebas unitarias pasaron con éxito!');

