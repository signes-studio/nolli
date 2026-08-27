import re
from supabase import create_client, Client

# --- CONFIGURACIÓN DE SUPABASE (Tus credenciales oficiales) ---
SUPABASE_URL = "https://ldtfvpjigzvcagtciipn.supabase.co"
SUPABASE_KEY = "sb_secret_ccrnSAENvB15jwgL513xZg_OxFxZBB1" 
NOMBRE_TABLA = "Buildings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def limpiar_anos_construccion():
    print("Conectando con Supabase para procesar los años de construcción por lotes...")
    
    tamanio_lote = 1000
    inicio = 0
    total_actualizados = 0

    try:
        while True:
            fin = inicio + tamanio_lote - 1
            
            # Descargamos un lote de registros que tengan el campo año_construccion relleno
            response = (
                supabase.table(NOMBRE_TABLA)
                .select("id, año_construccion")
                .not_.is_("año_construccion", "null")
                .range(inicio, fin)
                .execute()
            )
            
            lote_registros = response.data
            
            if not lote_registros:
                break

            print(f"\n--- Analizando bloque de filas {inicio} a {fin} (Total en lote: {len(lote_registros)}) ---")

            for row in lote_registros:
                row_id = row["id"]
                anio_original = str(row["año_construccion"]).strip()
                
                # Buscamos todos los números de 4 cifras (años de 4 dígitos) en el texto
                # Esto detecta formatos como "2004 - 2007", "1998/2001", "2010-2012", etc.
                anios_encontrados = re.findall(r'\b(1\d{3}|20\d{2})\b', anio_original)
                
                if anios_encontrados:
                    # Nos quedamos siempre con el último año encontrado en la cadena
                    ultimo_anio = anios_encontrados[-1]
                    
                    # Si el año actual de la base de datos es distinto al último año detectado, actualizamos
                    if anio_original != ultimo_anio:
                        supabase.table(NOMBRE_TABLA).update({"año_construccion": ultimo_anio}).eq("id", row_id).execute()
                        total_actualizados += 1
                        print(f"   [ID {row_id}] Actualizado -> '{anio_original}' corregido a '{ultimo_anio}'")

            if len(lote_registros) < tamanio_lote:
                break

            inicio += tamanio_lote

        print(f"\n¡Proceso finalizado con éxito! Total de registros actualizados: {total_actualizados}")

    except Exception as e:
        print(f"[ERROR CRÍTICO]: {e}")

if __name__ == "__main__":
    limpiar_anos_construccion()
    input("\nPulsa [ENTER] para salir de la ventana...")