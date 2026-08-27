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
    "residencial",
    "dotacional_equipamiento",
    "industrial_logistico",
    "religioso_funerario",
    "comercial_terciario",
    "espacio_publico_paisaje",
    "infraestructura_urbanismo",
    "otro"
}

def categorizar_con_gemini(nombre_obra, arquitecto):
    prompt = (
        f"Actúa como un experto en arquitectura y urbanismo. "
        f"Clasifica la siguiente obra dentro de una y solo una de estas categorías exactas:\n"
        f"- residencial\n"
        f"- dotacional_equipamiento\n"
        f"- industrial_logistico\n"
        f"- religioso_funerario\n"
        f"- comercial_terciario\n"
        f"- espacio_publico_paisaje\n"
        f"- infraestructura_urbanismo\n"
        f"- otro\n\n"
        f"Obra: {nombre_obra}\n"
        f"Arquitecto: {arquitecto if arquitecto else 'Desconocido'}\n\n"
        f"Devuelve únicamente un JSON estricto sin formato markdown extra: {{\"categoria\": \"nombre_categoria\"}}"
    )

    try:
        response = client.models.generate_content(
            model='gemini-3.5-flash-lite',  # Modelo optimizado y sin bloqueos estrictos de RPD
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
        cat = data.get("categoria", "").strip().lower()
        
        if cat not in CATEGORIAS_VALIDAS:
            cat = "otro"
            
        return cat, t_in, t_out
        
    except Exception as e:
        print(f"   [Error en la API de Gemini]: {e}")
        return "otro", 0, 0

def clasificar_100_por_cien():
    print("Conectando con Supabase para procesar el 100% de los edificios con Gemini 2 Flash Lite...")
    
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
                .select("id, nombre_obra, arquitecto, categoria")
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

            print(f"\n--- Bloque de registros {inicio}-{fin} | Válidos a procesar en este lote: {len(lote_validos)} ---")

            for row in lote_validos:
                row_id = row["id"]
                nombre = row.get("nombre_obra")
                arquitecto = row.get("arquitecto")
                
                categoria_asignada, t_in, t_out = categorizar_con_gemini(nombre, arquitecto)
                
                supabase.table(NOMBRE_TABLA).update({"categoria": categoria_asignada}).eq("id", row_id).execute()
                
                total_procesados += 1
                acumulado_tokens_in += t_in
                acumulado_tokens_out += t_out
                
                print(f"   [OK] ID {row_id} | '{nombre}' -> {categoria_asignada} (In: {t_in} | Out: {t_out})")

                time.sleep(0.1)

            if len(lote_bruto) < tamanio_lote:
                break

            inicio += tamanio_lote

        tiempo_total = time.time() - tiempo_inicio

        print("\n" + "="*50)
        print(" INFORME FINAL (GEMINI 2 FLASH LITE)")
        print("="*50)
        print(f"• Total edificios procesados y actualizados: {total_procesados}")
        print(f"• Tiempo empleado: {tiempo_total:.2f} segundos")
        print(f"• Tokens de entrada totales: {acumulado_tokens_in}")
        print(f"• Tokens de salida totales: {acumulado_tokens_out}")
        print("="*50)

    except Exception as e:
        print(f"[ERROR CRÍTICO]: {e}")

if __name__ == "__main__":
    clasificar_100_por_cien()
    input("\nPulsa [ENTER] para salir de la ventana...")