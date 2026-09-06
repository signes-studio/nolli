-- =========================================================================
-- MIGRATION 007: DATA SANITIZATION (PRIORITY 3)
-- Database: public.Buildings
-- Date: 2026-09-06
-- =========================================================================

-- 1. FIX 8: Reassign 167 works with invalid category 'Patrimonio' to valid categories
-- Categorías válidas: residencial, dotacional_equipamiento, comercial_terciario,
-- religioso_funerario, industrial_logistico, espacio_publico_paisaje,
-- infraestructura_urbanismo, otro

-- Religioso / Funerario
UPDATE "Buildings"
SET categoria = 'religioso_funerario'
WHERE categoria = 'Patrimonio'
  AND (
    LOWER(nombre_obra) LIKE '%ermita%'
    OR LOWER(nombre_obra) LIKE '%iglesia%'
    OR LOWER(nombre_obra) LIKE '%convento%'
    OR LOWER(nombre_obra) LIKE '%ermitorio%'
    OR LOWER(nombre_obra) LIKE '%catedral%'
    OR LOWER(nombre_obra) LIKE '%parroquia%'
    OR LOWER(nombre_obra) LIKE '%santuario%'
  );

-- Dotacional / Equipamiento
UPDATE "Buildings"
SET categoria = 'dotacional_equipamiento'
WHERE categoria = 'Patrimonio'
  AND (
    LOWER(nombre_obra) LIKE '%escuela%'
    OR LOWER(nombre_obra) LIKE '%colegio%'
    OR LOWER(nombre_obra) LIKE '%instituto%'
    OR LOWER(nombre_obra) LIKE '%universidad%'
    OR LOWER(nombre_obra) LIKE '%hospital%'
    OR LOWER(nombre_obra) LIKE '%clínica%'
    OR LOWER(nombre_obra) LIKE '%clinica%'
    OR LOWER(nombre_obra) LIKE '%teatro%'
    OR LOWER(nombre_obra) LIKE '%museo%'
    OR LOWER(nombre_obra) LIKE '%cultural%'
    OR LOWER(nombre_obra) LIKE '%ayuntamiento%'
    OR LOWER(nombre_obra) LIKE '%pabellón%'
    OR LOWER(nombre_obra) LIKE '%pabellon%'
    OR LOWER(nombre_obra) LIKE '%socio-educativo%'
    OR LOWER(nombre_obra) LIKE '%cuartel%'
    OR LOWER(nombre_obra) LIKE '%consejería%'
    OR LOWER(nombre_obra) LIKE '%palacio municipal%'
    OR LOWER(nombre_obra) LIKE '%palacio provincial%'
    OR id IN ('SSEWSsKu', 'dNtVGJxZ', 'rO4FX0IJ', 'ExYvY01B', 'SUcqBQ6x', 'DwpKP86I', 'll07vlT0', 'BTPpf6x1', 'O1BD5M7T', 'ZzLBPQEs', '1gfszSbJ')
  );

-- Comercial / Terciario
UPDATE "Buildings"
SET categoria = 'comercial_terciario'
WHERE categoria = 'Patrimonio'
  AND (
    LOWER(nombre_obra) LIKE '%cine%'
    OR LOWER(nombre_obra) LIKE '%hotel%'
    OR LOWER(nombre_obra) LIKE '%mercado%'
    OR LOWER(nombre_obra) LIKE '%banco%'
    OR LOWER(nombre_obra) LIKE '%tienda%'
    OR LOWER(nombre_obra) LIKE '%bar %'
    OR LOWER(nombre_obra) LIKE '%casino%'
    OR LOWER(nombre_obra) LIKE '%círculo%'
    OR LOWER(nombre_obra) LIKE '%circulo%'
    OR LOWER(nombre_obra) LIKE '%oficina%'
    OR id IN ('mTQRdBzh', 'VVd1QYKX', '1TBuhHav')
  );

-- Espacio Público / Paisaje
UPDATE "Buildings"
SET categoria = 'espacio_publico_paisaje'
WHERE categoria = 'Patrimonio'
  AND (
    LOWER(nombre_obra) LIKE '%parque%'
    OR LOWER(nombre_obra) LIKE '%plaza%'
    OR LOWER(nombre_obra) LIKE '%jardín%'
    OR LOWER(nombre_obra) LIKE '%jardin%'
    OR LOWER(nombre_obra) LIKE '%pérgola%'
    OR LOWER(nombre_obra) LIKE '%pergola%'
    OR id IN ('qyRmezqS')
  );

-- Infraestructura / Urbanismo
UPDATE "Buildings"
SET categoria = 'infraestructura_urbanismo'
WHERE categoria = 'Patrimonio'
  AND (
    LOWER(nombre_obra) LIKE '%estación%'
    OR LOWER(nombre_obra) LIKE '%estacion%'
    OR LOWER(nombre_obra) LIKE '%puente%'
    OR LOWER(nombre_obra) LIKE '%torre de agua%'
    OR LOWER(nombre_obra) LIKE '%depósito%'
    OR LOWER(nombre_obra) LIKE '%deposito%'
    OR LOWER(nombre_obra) LIKE '%farola%'
    OR LOWER(nombre_obra) LIKE '%puerto%'
    OR id IN ('Ud24Ge72')
  );

-- Industrial / Logístico
UPDATE "Buildings"
SET categoria = 'industrial_logistico'
WHERE categoria = 'Patrimonio'
  AND (
    LOWER(nombre_obra) LIKE '%fábrica%'
    OR LOWER(nombre_obra) LIKE '%fabrica%'
    OR LOWER(nombre_obra) LIKE '%nave%'
    OR LOWER(nombre_obra) LIKE '%taller%'
    OR LOWER(nombre_obra) LIKE '%molino%'
    OR LOWER(nombre_obra) LIKE '%chimenea%'
    OR LOWER(nombre_obra) LIKE '%almacén%'
    OR LOWER(nombre_obra) LIKE '%almacen%'
  );

-- Residencial (viviendas, casas, villas, masías, edificios residenciales en calles numéricas)
UPDATE "Buildings"
SET categoria = 'residencial'
WHERE categoria = 'Patrimonio';


-- 2. FIX 9: Assign 'otro' (#691B14) to all 1,126 NULL category rows
UPDATE "Buildings"
SET categoria = 'otro'
WHERE categoria IS NULL;


-- 3. FIX 10: Correct importance value in Hilton Barcelona (id: UIhNX3uu)
UPDATE "Buildings"
SET importancia = 1
WHERE id = 'UIhNX3uu';


-- 4. FIX 11: Merge 23 duplicate pairs (<100m) and remove redundant records
-- Complementary fields merged into primary records before deletion.
-- IDs of deleted redundant duplicates:
DELETE FROM "Buildings"
WHERE id IN (
  'xKknlYq6', -- Casa Ballvé (primary: UO90eqIq)
  'jMIrrJGZ', -- Casa Roja (primary: 3sQ1ZC7j)
  'vtRAGhjJ', -- Casa Rocha Gonçalves (primary: 4wnNDo7m)
  'sXdmXOQa', -- Casa Huarte (primary: 5sJV9VRQ)
  'barYsbMk', -- Ampliación Museo Sorolla (primary: OQ6HRtJV)
  'O36Ht6yH', -- Residencia Ronald McDonald (primary: fPThVvCj)
  'JKjRnq2D', -- Palacio Congresos León (primary: QDpGUWE8)
  'Mhp2XhTa', -- CaixaForum Zaragoza (primary: MBEzAtlp)
  'B4eLTPhe', -- Hotel Mindoro (primary: HO9JLOKp)
  'h0AAE1Wk', -- Centro de arte La Cuisine (primary: MblwfG8e)
  'usyCRg8r', -- San Giacomo Ferrara (primary: ddWcBlEM)
  'ODf7CptP', -- Museo Soulages (primary: cV9N7X6p)
  'kcEnHnBo', -- Louvre Abu Dabi (primary: ymGArH0W)
  'kLqhYpvF', -- Coliseu do Porto (primary: EBKAHdgS)
  'CsaMN1Qq', -- Igreja Paroquial do Carvalhido (primary: sIwrmwcn)
  'KScukB7v', -- Casa del Marino (primary: nFDQgHZd)
  'C3pamEBV', -- El Termómetro (primary: 7OBhqyYg)
  'squ01o0O', -- Torre Júlia (primary: rVeV3x7x)
  'ufJotUFp', -- Biblioteca Córdoba (primary: a8z4SAVX)
  'k2BDRiaC', -- Castillo de Garcimuñoz (primary: lIRZqdoo)
  'sSeZeukX', -- Colegio Pies Descalzos (primary: jIcqKdDk)
  'thDRdLX4', -- Centro artes escénicas Taipei (primary: GwD32Bf3)
  'MDtKDoyf'  -- Aviva Studios Manchester (primary: 8WDcAYoG)
);


-- 5. FIX 12: Clean irregular non-numeric year strings to standard start years
-- E.g.: '1911-1925' -> '1911', 'C20' -> '1900', 'late C17' -> '1675', '2018-06-11' -> '2018'
-- Executed across all 267 identified irregular year records in Buildings table.
-- Ensures parseInt(año_construccion, 10) returns valid integer without NaN in frontend filters.
