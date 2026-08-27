import os
import re
from supabase import create_client, Client
from google import genai
from google.genai import types

# --- CONFIGURACIÓN DE SUPABASE Y GEMINI ---
SUPABASE_URL = "https://ldtfvpjigzvcagtciipn.supabase.co"
SUPABASE_KEY = "sb_secret_ccrnSAENvB15jwgL513xZg_OxFxZBB1" 
NOMBRE_TABLA = "Buildings"

# Inicializar clientes
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
client = genai.Client(api_key="AIzaSyBtP4jYkKb15qhyNdp8-lxU71XjlICUK6U")

def buscar_ano_con_gemini(nombre_obra, arquitecto):
    """Usa Gemini para averiguar el año de construcción de un edificio dado su nombre y arquitecto."""
    prompt = (
        f"Actúa como un experto en historia de la arquitectura. "
        f"Necesito conocer exclusivamente el año de construcción o finalización de la siguiente obra arquitectónica:\n"
        f"- Nombre de la obra: {nombre_obra}\n"
        f"- Arquitecto: {arquitecto if arquitecto else 'Desconocido'}\n\n"
        f"Responde únicamente con el año en formato de 4 dígitos (ejemplo: 1995 o 2004). "
        f"Si no estás seguro o no encuentras información fiable, responde exactamente 'DESCONOCIDO'."
    )

    try:
        response = client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
        )
        
        texto_respuesta = response.text.strip()
        
        # Buscamos un año válido de 4 dígitos en la respuesta de Gemini
        match = re.search(r'\b(18\d{2}|19\d{2}|20\d{2})\b', texto_respuesta)
        if match:
            return match.group(1)
            
    except Exception as e:
        print(f"   [Error en la API de Gemini]: {e}")
        
    return None

def rellenar_anos_faltantes():
    print("Conectando con Supabase para buscar obras sin año de construcción...")
    
    tamanio_lote = 1000
    inicio = 0
    total_actualizados = 0

    try:
        while True:
            fin = inicio + tamanio_lote - 1
            
            # Descargamos registros donde año_construccion es NULL
            response = (
                supabase.table(NOMBRE_TABLA)
                .select("id, nombre_obra, arquitecto, año_construccion")
                .is_("año_construccion", "null")
                .range(inicio, fin)
                .execute()
            )
            
            lote_bruto = response.data
            
            if not lote_bruto:
                break

            # Filtramos estrictamente en Python para ignorar filas con nombre_obra nulo, vacío o espacios en blanco
            lote_registros = [
                row for row in lote_bruto 
                if row.get("nombre_obra") is not None and str(row.get("nombre_obra")).strip() != ""
            ]

            print(f"\n--- Analizando bloque de filas {inicio} a {fin} (Válidos con nombre en este lote: {len(lote_registros)}) ---")

            for row in lote_registros:
                row_id = row["id"]
                nombre = row.get("nombre_obra")
                arquitecto = row.get("arquitecto")
                
                print(f"Consultando a Gemini para: '{nombre}' ({arquitecto})...")
                
                # Consultamos a Gemini
                anio_encontrado = buscar_ano_con_gemini(nombre, arquitecto)
                
                if anio_encontrado:
                    supabase.table(NOMBRE_TABLA).update({"año_construccion": anio_encontrado}).eq("id", row_id).execute()
                    total_actualizados += 1
                    print(f"   [ÉXITO] ID {row_id} actualizado con el año: {anio_encontrado}")
                else:
                    print(f"   [AVISO] Gemini no pudo determinar el año para esta obra.")

            if len(lote_bruto) < tamanio_lote:
                break

            inicio += tamanio_lote

        print(f"\n¡Proceso finalizado con éxito! Total de años rellenados por Gemini: {total_actualizados}")

    except Exception as e:
        print(f"[ERROR CRÍTICO]: {e}")

if __name__ == "__main__":
    rellenar_anos_faltantes()
    input("\nPulsa [ENTER] para salir de la ventana...")