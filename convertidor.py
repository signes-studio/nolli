import json
import pandas as pd
import random

# 1. Cargar el archivo JSON original
with open('edificios_ctav.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

filas = []

for item in data.get('content', []):
    # Nombre de la obra
    nombre_obra = item.get('nombre', '')
    
    # Arquitectos
    arqs = item.get('arquitectos', [])
    nombres_arqs = []
    for a in arqs:
        nombre = a.get('nombre', '').strip()
        apellidos = a.get('apellidos', '').strip()
        completo = f"{nombre} {apellidos}".strip()
        if completo:
            nombres_arqs.append(completo)
    arquitecto = ", ".join(nombres_arqs) if nombres_arqs else ""
    
    # Año de construcción
    año_construccion = ""
    
    # Coordenadas
    latitud = item.get('geoLatitud', '')
    longitud = item.get('geoLongitud', '')
    
    # Importancia (valores del 1 al 3)
    importancia = random.randint(1, 3)
    
    # ID con prefijo CTAV
    original_id = item.get('id', '')
    id_ctav = f"CTAV{original_id}" if original_id else ""
    
    # Añadido por
    añadido_por = "CTAV"
    
    # Categoría (traducción al español de la tipología)
    categoria = ""
    tipologia = item.get('tipologia')
    if tipologia and tipologia.get('textContentNombre'):
        translations = tipologia['textContentNombre'].get('translations', [])
        for t in translations:
            if t.get('language', {}).get('siglas') == 'es':
                categoria = t.get('translation', '')
                break
                
    # Visitable
    visitable = "false"
    
    # Foto URL con el dominio añadido (comprobando que no esté vacía o sea una URL externa ya completa)
    foto_principal = item.get('fotoPrincipal')
    if foto_principal and foto_principal.get('url'):
        url_parcial = foto_principal.get('url')
        if url_parcial.startswith('http'):
            foto_url = url_parcial  # Por si alguna ya viene completa
        else:
            foto_url = f"https://arquitecturavalencia.es{url_parcial}"
    else:
        foto_url = ""
    
    # Enlace URL de la ficha
    enlace_url = f"https://guiactav.com/obra/{original_id}" if original_id else ''
    
    # Estado de acceso
    estado_acceso = "exterior_visible"
    
    filas.append({
        "nombre_obra": nombre_obra,
        "arquitecto": arquitecto,
        "año_construccion": año_construccion,
        "latitud": latitud,
        "longitud": longitud,
        "importancia": importancia,
        "id": id_ctav,
        "añadido_por": añadido_por,
        "categoria": categoria,
        "visitable": visitable,
        "foto_url": foto_url,
        "enlace_url": enlace_url,
        "estado_acceso": estado_acceso
    })

# 2. Exportar el resultado a CSV
df = pd.DataFrame(filas)
df.to_csv('proyectos_ctav_salida.csv', index=False, encoding='utf-8-sig')

print("¡CSV generado correctamente con las URLs de imagen completas!")