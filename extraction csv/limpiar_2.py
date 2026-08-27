from supabase import create_client, Client
from fuzzywuzzy import fuzz

# --- CONFIGURACIÓN DE SUPABASE (Tus credenciales oficiales) ---
SUPABASE_URL = "https://ldtfvpjigzvcagtciipn.supabase.co"
SUPABASE_KEY = "sb_secret_ccrnSAENvB15jwgL513xZg_OxFxZBB1" 
NOMBRE_TABLA = "Buildings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def unificar_arquitectos_respetando_coautores():
    print("Conectando con Supabase para descargar todos los registros...")
    
    tamanio_lote = 1000
    inicio = 0
    registros = []

    # 1. Descargamos todos los registros necesarios (id y arquitecto)
    while True:
        fin = inicio + tamanio_lote - 1
        response = (
            supabase.table(NOMBRE_TABLA)
            .select("id, arquitecto")
            .not_.is_("arquitecto", "null")
            .range(inicio, fin)
            .execute()
        )
        lote = response.data
        if not lote:
            break
        registros.extend(lote)
        if len(lote) < tamanio_lote:
            break
        inicio += tamanio_lote

    print(f"Total de registros descargados: {len(registros)}")

    # 2. Extraer nombres individuales separando por comas para encontrar el diccionario de equivalencias
    nombres_individuales = set()
    for r in registros:
        arq_str = r.get("arquitecto")
        if not arq_str:
            continue
        # Separamos por comas si hay varios coautores en un mismo registro
        partes = arq_str.split(",")
        for parte in partes:
            nombre_limpio = parte.strip()
            if nombre_limpio and nombre_limpio.lower() not in ["desconocido", ""]:
                nombres_individuales.add(nombre_limpio)

    lista_nombres = sorted(list(nombres_individuales), key=len, reverse=True)
    
    # Creamos un diccionario de mapeo: {'nombre_corto': 'nombre_largo_oficial'}
    diccionario_unificacion = {}
    procesados = set()

    print("\nAnalizando nombres individuales para unificar variantes...")

    for i in range(len(lista_nombres)):
        arq_largo = lista_nombres[i]
        if arq_largo in procesados:
            continue

        for j in range(i + 1, len(lista_nombres)):
            arq_corto = lista_nombres[j]
            if arq_corto in procesados:
                continue

            l1 = arq_largo.lower()
            l2 = arq_corto.lower()

            similitud = fuzz.token_set_ratio(l1, l2)
            es_subcadena = l2 in l1 or l1 in l2

            # Si se parecen mucho o uno está contenido en el otro (ej. "Álvaro Siza" y "Álvaro Siza Vieira")
            if similitud >= 85 or (es_subcadena and len(l2) > 5):
                diccionario_unificacion[arq_corto] = arq_largo
                procesados.add(arq_corto)
                print(f" > Equivalencia detectada: [ '{arq_corto}' ]  ==>  [ '{arq_largo}' ]")

    if not diccionario_unificacion:
        print("\nNo se han encontrado variantes para unificar.")
        return

    print(f"\nRevisando filas en Supabase para actualizar celdas manteniendo coautores...")

    total_actualizados = 0

    # 3. Recorremos fila por fila para reconstruir el string de arquitectos de forma segura
    for r in registros:
        row_id = r["id"]
        arq_original = r.get("arquitecto")
        if not arq_original:
            continue

        # Separamos por comas para tratar cada arquitecto por separado
        partes = [p.strip() for p in arq_original.split(",")]
        cambiado = False
        nuevas_partes = []

        for parte in partes:
            if parte in diccionario_unificacion:
                nuevas_partes.append(diccionario_unificacion[parte])
                cambiado = True
            else:
                nuevas_partes.append(parte)

        # Si al menos un arquitecto de la lista ha sido unificado, actualizamos la celda completa
        if cambiado:
            arq_nuevo = ", ".join(nuevas_partes)
            supabase.table(NOMBRE_TABLA).update({"arquitecto": arq_nuevo}).eq("id", row_id).execute()
            total_actualizados += 1
            print(f"   [Actualizado ID {row_id}] '{arq_original}'  --->  '{arq_nuevo}'")

    print(f"\n¡Proceso finalizado! Se han actualizado {total_actualizados} registros manteniendo intactos los coautores.")

if __name__ == "__main__":
    unificar_arquitectos_respetando_coautores()
    input("\nPulsa [ENTER] para salir de la ventana...")