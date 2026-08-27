from supabase import create_client, Client

# --- CONFIGURACIÓN DE SUPABASE ---
SUPABASE_URL = "https://ldtfvpjigzvcagtciipn.supabase.co"
SUPABASE_KEY = "sb_secret_ccrnSAENvB15jwgL513xZg_OxFxZBB1" 
NOMBRE_TABLA = "Buildings"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def diagnostico():
    print("Conectando con Supabase para verificar los datos...")
    
    # 1. Vamos a ver si encuentra CUALQUIER registro con ese origen
    response = (
        supabase.table(NOMBRE_TABLA)
        .select("id, nombre_obra, arquitecto, latitud, longitud, añadido_por")
        .eq("añadido_por", "OpenStreetMap")
        .limit(5)
        .execute()
    )
    
    print(f"\nPrueba de lectura (primeros 5 registros): {response.data}")
    
    if not response.data:
        print("\n[AVISO]: La consulta no ha devuelto ningún registro donde 'añadido_por' sea exactamente 'OpenStreetMap'.")
        print("Vamos a comprobar qué valores hay en la columna 'añadido_por':")
        
        general = supabase.table(NOMBRE_TABLA).select("añadido_por").limit(20).execute()
        valores_unicos = set(row.get("añadido_por") for row in general.data)
        print(f"Valores encontrados en la base de datos para 'añadido_por': {valores_unicos}")
    else:
        print("\n¡Éxito! Sí se han encontrado registros con 'OpenStreetMap'.")

if __name__ == "__main__":
    diagnostico()
    # Esto evita que la ventana se cierre de golpe
    input("\nPulsa [ENTER] para salir...")