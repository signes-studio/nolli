# Arquitectura de Almacenamiento de Fotos y Análisis Gráfico — Nolli

## 1. Contexto y Restricción Crítica de Negocio
Hace pocos días, el proyecto Supabase de Nolli fue suspendido por superar en un **259% la cuota de egress** permitida.
Alojamiento de imágenes en Supabase Storage convertiría cada visualización de foto comunitaria o de análisis en tráfico de red saliente (*egress*) facturable contra la cuota mensual de Supabase, poniendo en riesgo crítico la continuidad del servicio.

**Directiva innegociable**: El 100% de las imágenes subidas por los usuarios (fotos de visitas, croquis de análisis, diagramas arquitectónicos y detalles constructivos) deben alojarse en infraestructura externa independiente con **cero coste de egress hacia Supabase**.

---

## 2. Evaluación Comparativa de Proveedores

| Criterio | Supabase Storage | Cloudflare Images | ImageKit | Cloudflare R2 + CDN (ELEGIDO) |
| :--- | :--- | :--- | :--- | :--- |
| **Coste Egress (Ancho de Banda)** | Facturable / Límites estrictos | Incluido en suscripción | 20 GB/mes gratis (bloqueo tras cuota) | **0,00 $ / mes (Egress GRATUITO e ilimitado)** |
| **Almacenamiento Gratuito** | 1 GB | Sin capa gratuita (5 $/mes mín.) | 20 GB compartidos con ancho de banda | **10 GB / mes (permanente)** |
| **Operaciones Gratuitas** | Limitadas por API | 100.000 transformaciones | Limitadas | **10.000.000 lecturas/mes (Clase B) + 1.000.000 escrituras/mes (Clase A)** |
| **Protocolo de Subida** | REST API Supabase | REST API Propietaria | SDK Propietario | **S3 API compatible (URLs prefirmadas directas cliente -> bucket)** |
| **Impacto en Servidor Nolli** | Consume cuota de Supabase | Cero impacto | Cero impacto | **CERO consumo de cómputo y CERO consumo de ancho de banda** |

---

## 3. Decisión Final: Cloudflare R2 + CDN

Se selecciona **Cloudflare R2 Object Storage** respaldado por la CDN global de Cloudflare por las siguientes razones:

1. **Cero Egress**: Cloudflare no cobra tarifas de salida de datos (*Zero Egress Fees*), independientemente del volumen de descargas o visitas que reciban las fotos en Nolli.
2. **Generación Dinámica de Miniaturas**: Mediante el proxy de imágenes de alto rendimiento `wsrv.nl` (o Cloudflare Workers Image Resizing sobre el subdominio canónico `photos.nollimap.app`), las miniaturas se transforman al vuelo con WebP/AVIF y se cachean en el edge de Cloudflare.
3. **Subidas Directas con URLs Prefirmadas**: El navegador del usuario sube el binario directamente al bucket de R2 mediante una URL PUT prefirmada (firmada criptográficamente con HMAC-SHA256). Ni Vercel ni Supabase actúan como intermediarios del binario.
4. **Almacenamiento en Base de Datos**: La tabla PostgreSQL `visit_photos` almacena exclusivamente cadenas de texto URL (`photo_url`, `thumbnail_url`), de forma idéntica a cómo la tabla `Buildings` almacena `foto_url`.

---

## 4. Blindaje Preventivo en Base de Datos

Para asegurar a nivel de motor de base de datos que ninguna foto sea almacenada en Supabase Storage, se aplica una restricción de comprobación (*CHECK constraint*) en la tabla `visit_photos`:

```sql
CONSTRAINT chk_no_supabase_storage CHECK (photo_url NOT LIKE '%supabase.co/storage%')
```

---

## 5. Estado de la Integración (Fase 2)

- Las columnas `photo_url` y `thumbnail_url` de `visit_photos` quedan preparadas para recibir URLs HTTPS de Cloudflare R2 / CDN.
- **NO se activa ningún flujo de subida real** hasta que el bucket de R2 esté formalmente provisionado con sus credenciales de servicio en Cloudflare, evitando cualquier riesgo de fallback accidental a almacenamiento local o de Supabase.
