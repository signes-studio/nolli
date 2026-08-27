import os
import json
import time
from supabase import create_client, Client
from google import genai
from google.genai import types

# --- CONFIGURACIÓN DE SUPABASE Y GEMINI ---
SUPABASE_URL = "https://ldtfvpjigzvcagtciipn.supabase.co"
SUPABASE_KEY = "sb_secret_ccrnSAENvB15jwgL513xZg_OxFxZBB1" 
NOMBRE_TABLA = "Buildings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
client = genai.Client(api_key="AIzaSyBtP4jYkKb15qhyNdp8-lxU71XjlICUK6U")

CATEGORIAS_VALIDAS = {
    "residencial", "dotacional_equipamiento", "industrial_logistico",
    "religioso_funerario", "comercial_terciario", "espacio_publico_paisaje",
    "infraestructura_urbanismo", "otro"
}

ESTADOS_ACCESO_VALIDOS = {
    "publico", "exterior_visible", "con_reserva", 
    "privado", "cerrado_temporalmente", "no_construido", "desaparecido"
}

def analizar_edificio_con_gemini(nombre_obra, arquitecto):
    prompt = (
        f"Actúa como un experto en arquitectura y urbanismo. "
        f"Analiza la siguiente obra arquitectónica y devuelve un JSON estricto sin formato markdown extra con esta estructura exacta:\n"
        f"{{\n"
        f'  "categoria": "residencial",\n'
        f'  "visitable": true,\n'
        f'  "estado_acceso": "publico"\n'
        f"}}\n\n"
        f"Reglas estrictas:\n"
        f"- 'categoria' debe ser una de: residencial, dotacional_equipamiento, industrial_logistico, religioso_funerario, comercial_terciario, espacio_publico_paisaje, infraestructura_urbanismo, otro.\n"
        f"- 'visitable' debe ser estrictamente booleano (true o false).\n"
        f"- 'estado_acceso' debe ser estrictamente uno de: publico, exterior_visible, con_reserva, privado, cerrado_temporalmente, no_construido, desaparecido.\n\n"
        f"Obra: {nombre_obra}\n"
        f"Arquitecto: {arquitecto if arquitecto else 'Desconocido'}"
    )

    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
            )
        )
        
        usage = response.usage_metadata
        t_in = usage.prompt_token_count if usage else 0
        t_out = usage.candidates_token_count if usage else 0
        
        texto_respuesta = response.text.strip()
        if texto_respuesta.startswith("```"):
            texto_respuesta = texto_respuesta.split("```")[1]
            if texto_respuesta.startswith("json"):
                texto_respuesta = texto_respuesta[4:]
            texto_respuesta = texto_respuesta.strip()

        data = json.loads(texto_respuesta)
        
        # Validaciones de seguridad para los datos devueltos
        cat = data.get("categoria", "").strip().lower()
        if cat not in CATEGORIAS_VALIDAS:
            cat = "otro"
            
        visitable = bool(data.get("visitable", False))
        
        estado = data.get("estado_acceso", "").strip().lower()
        if estado not in ESTADOS_ACCESO_VALIDOS:
            estado = "exterior_visible"
            
        return {"categoria": cat, "visitable": visitable, "estado_acceso": estado}, t_in, t_out
        
    except Exception as e:
        print(f"   [Error en la API de Gemini]: {e}")
        return {"categoria": "otro", "visitable": False, "estado_acceso": "exterior_visible"}, 0, 0

def procesar_100_por_cien():
    print("Iniciando análisis completo (Categoría + Visitable + Estado de Acceso)...")
    
    tamanio_lote = 1000
    inicio = 0
    total_procesados = 0
    acumulado_tokens_in = 0
    acumulado_tokens_out = 0
    tiempo_inicio = time.time()

    try:
        while True:
            fin = inicio + tamanio_lote - 1
            
            response = (
                supabase.table(NOMBRE_TABLA)
                .select("id, nombre_obra, arquitecto")
                .range(inicio, fin)
                .execute()
            )
            
            lote_bruto = response.data
            if not lote_bruto:
                break

            lote_validos = [
                row for row in lote_bruto 
                if row.get("nombre_obra") is not None and str(row.get("nombre_obra")).strip() != ""
            ]

            print(f"\n--- Bloque {inicio}-{fin} | Válidos a procesar: {len(lote_validos)} ---")

            for row in lote_validos:
                row_id = row["id"]
                nombre = row.get("nombre_obra")
                arquitecto = row.get("arquitecto")
                
                datos_nuevos, t_in, t_out = analizar_edificio_con_gemini(nombre, arquitecto)
                
                # Actualizamos las tres columnas en Supabase de golpe
                supabase.table(NOMBRE_TABLA).update(datos_nuevos).eq("id", row_id).execute()
                
                total_procesados += 1
                acumulado_tokens_in += t_in
                acumulado_tokens_out += t_out
                
                print(f"   [OK] ID {row_id} | '{nombre}' -> {datos_nuevos}")

                time.sleep(0.1)

            if len(lote_bruto) < tamanio_lote:
                break

            inicio += tamanio_lote

        tiempo_total = time.time() - tiempo_inicio

        print("\n" + "="*50)
        print(" INFORME FINAL (PROCESAMIENTO COMPLETO)")
        print("="*50)
        print(f"• Total edificios procesados: {total_procesados}")
        print(f"• Tiempo empleado: {tiempo_total:.2f} segundos")
        print(f"• Tokens de entrada: {acumulado_tokens_in}")
        print(f"• Tokens de salida: {acumulado_tokens_out}")
        print("="*50)

    except Exception as e:
        print(f"[ERROR CRÍTICO]: {e}")

if __name__ == "__main__":
    procesar_100_por_cien()
    input("\nPulsa [ENTER] para salir...")