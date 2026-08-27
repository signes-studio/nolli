from supabase import create_client, Client
from fuzzywuzzy import fuzz
from math import radians, sin, cos, sqrt, atan2

# --- CONFIGURACIÓN DE SUPABASE (Tus credenciales oficiales) ---
SUPABASE_URL = "https://ldtfvpjigzvcagtciipn.supabase.co"
SUPABASE_KEY = "sb_secret_ccrnSAENvB15jwgL513xZg_OxFxZBB1" 
NOMBRE_TABLA = "Buildings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def calcular_distancia_metros(lat1, lon1, lat2, lon2):
    """Calcula la distancia en metros entre dos puntos geográficos (Fórmula de Haversine)."""
    R = 6371000  # Radio de la tierra en metros
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c

def generar_informe_duplicados():
    print("Conectando con Supabase para descargar TODOS los registros de la tabla...")
    
    tamanio_lote = 1000
    inicio = 0
    registros = []

    # 1. Paginación completa de la tabla entera (sin filtrar por 'añadido_por')
    while True:
        fin = inicio + tamanio_lote - 1
        
        response = (
            supabase.table(NOMBRE_TABLA)
            .select("id, nombre_obra, arquitecto, latitud, longitud, añadido_por")
            .range(inicio, fin)
            .execute()
        )
        
        lote = response.data
        if not lote:
            break
            
        registros.extend(lote)
        print(f"Descargados registros desde el {inicio} hasta el {fin} (Total acumulado: {len(registros)})")
        
        if len(lote) < tamanio_lote:
            break
            
        inicio += tamanio_lote

    total_inicial = len(registros)
    print(f"\nDescarga completa. Analizando similitudes en un total de {total_inicial} registros...")

    informe_pares = []
    ids_analizados = set()

    for i in range(len(registros)):
        reg_a = registros[i]
        lat_a = reg_a.get("latitud")
        lon_a = reg_a.get("longitud")
        if lat_a is None or lon_a is None:
            continue

        for j in range(i + 1, len(registros)):
            reg_b = registros[j]
            if reg_a["id"] == reg_b["id"]:
                continue

            lat_b = reg_b.get("latitud")
            lon_b = reg_b.get("longitud")
            if lat_b is None or lon_b is None:
                continue

            # Comprobamos proximidad geográfica en un radio de 100 metros
            distancia = calcular_distancia_metros(float(lat_a), float(lon_a), float(lat_b), float(lon_b))
            
            if distancia <= 100:  
                # Normalizamos textos para comparar
                nombre_a = (reg_a.get("nombre_obra") or "").strip().lower()
                nombre_b = (reg_b.get("nombre_obra") or "").strip().lower()
                
                arq_a = (reg_a.get("arquitecto") or "").strip().lower()
                arq_b = (reg_b.get("arquitecto") or "").strip().lower()

                # Evaluamos similitud
                similitud_nombre = fuzz.ratio(nombre_a, nombre_b) if nombre_a and nombre_b else 0
                similitud_arq = fuzz.ratio(arq_a, arq_b) if arq_a and arq_b else 0

                if similitud_nombre >= 80 or similitud_arq >= 80:
                    informe_pares.append({
                        "item_1": reg_a,
                        "item_2": reg_b,
                        "distancia": distancia,
                        "sim_nombre": similitud_nombre,
                        "sim_arq": similitud_arq
                    })

    # 2. Generar e imprimir el informe detallado por consola
    print("\n" + "="*80)
    print(f" INFORME DE SIMILITUDES Y POSIBLES DUPLICADOS (Total encontrados: {len(informe_pares)})")
    print("="*80 + "\n")

    if not informe_pares:
        print("No se han encontrado registros con similitudes geográficas y de contenido en toda la tabla.")
    else:
        for idx, par in enumerate(informe_pares, 1):
            i1 = par["item_1"]
            i2 = par["item_2"]
            print(f"[{idx}] Coincidencia detectada a {par['distancia']:.2f} metros:")
            print(f" • Reg A (ID: {i1['id']} | Origen: {i1.get('añadido_por')}):")
                {i1.get('nombre_obra')} — Arquitecto: {i1.get('arquitecto')}
            print(f" • Reg B (ID: {i2['id']} | Origen: {i2.get('añadido_por')}):")
                {i2.get('nombre_obra')} — Arquitecto: {i2.get('arquitecto')}
            print(f" → Similitud Nombre: {par['sim_nombre']}% | Similitud Arquitecto: {par['sim_arq']}%")
            print("-" * 80)

    print("\n[INFORME FINALIZADO]: Ningún registro ha sido borrado; este script es solo de lectura.")

if __name__ == "__main__":
    generar_informe_duplicados()
    input("\nPulsa [ENTER] para salir...")