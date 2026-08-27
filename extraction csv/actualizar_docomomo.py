import os
import re
import time
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client

# --- CONFIGURACIÓN DE SUPABASE ---
SUPABASE_URL = "https://ldtfvpjigzvcagtciipn.supabase.co"
SUPABASE_KEY = "sb_secret_ccrnSAENvB15jwgL513xZg_OxFxZBB1" 
NOMBRE_TABLA = "Buildings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def extraer_datos_docomomo(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            return None, None

        soup = BeautifulSoup(response.text, 'html.parser')

        # 1. Extraer Arquitecto
        arquitecto = None
        header_div = soup.find('div', class_='header-edificio')
        if header_div:
            p_tag = header_div.find('p')
            if p_tag and p_tag.find('a'):
                arquitecto = p_tag.find('a').get_text(strip=True)

        # 2. Extraer Año de Construcción
        anio = None
        if header_div:
            paragraphs = header_div.find_all('p')
            if len(paragraphs) > 1:
                texto_fecha = paragraphs[1].get_text(strip=True)
                match = re.search(r'\b(19\d{2}|20\d{2})\b', texto_fecha)
                if match:
                    anio = match.group(1)

        return arquitecto, anio

    except Exception:
        return None, None

def sincronizar_tabla():
    print("Conectando con Supabase y procesando registros por lotes...")
    
    tamanio_lote = 1000
    inicio = 0
    total_actualizados = 0

    try:
        while True:
            # Paginamos de 1000 en 1000 para saltarnos el límite de Supabase
            fin = inicio + tamanio_lote - 1
            
            response = (
                supabase.table(NOMBRE_TABLA)
                .select("id, enlace_url, arquitecto, año_construccion, añadido_por")
                .eq("añadido_por", "DOCOMOMO")
                .not_.is_("enlace_url", "null")
                .range(inicio, fin)
                .execute()
            )
            
            lote_registros = response.data
            
            # Si el lote viene vacío, ya hemos terminado de recorrer toda la tabla
            if not lote_registros:
                break

            # Filtramos los que tengan valores NULL en arquitecto o año_construccion dentro de este lote
            registros_pendientes = [
                row for row in lote_registros 
                if row.get("arquitecto") is None or row.get("año_construccion") is None
            ]
            
            print(f"\n--- Analizando rango de filas {inicio} a {fin} (Pendientes en este lote: {len(registros_pendientes)}) ---")

            for row in registros_pendientes:
                row_id = row["id"]
                url = row["enlace_url"]
                
                arquitecto_web, anio_web = extraer_datos_docomomo(url)
                
                datos_a_actualizar = {}
                if row.get("arquitecto") is None and arquitecto_web:
                    datos_a_actualizar["arquitecto"] = arquitecto_web
                    
                if row.get("año_construccion") is None and anio_web:
                    datos_a_actualizar["año_construccion"] = anio_web

                if datos_a_actualizar:
                    supabase.table(NOMBRE_TABLA).update(datos_a_actualizar).eq("id", row_id).execute()
                    total_actualizados += 1
                    print(f"   [ID {row_id}] Actualizado -> Arquitecto: {arquitecto_web} | Año: {anio_web}")
                
                # Pausa breve para no saturar
                time.sleep(0.2)

            # Si el lote devuelto es menor que el tamaño máximo, significa que era la última página
            if len(lote_registros) < tamanio_lote:
                break

            inicio += tamanio_lote

        print(f"\n¡Proceso finalizado con éxito! Total de registros actualizados: {total_actualizados}")

    except Exception as e:
        print(f"[ERROR CRÍTICO]: {e}")

if __name__ == "__main__":
    sincronizar_tabla()