import json
import csv

# 1. Cargar el archivo JSON original
json_filename = 'obras_arquitectura_viva.json'
csv_filename = 'obras_arquitectura_viva_procesado.csv'

try:
    with open(json_filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
except FileNotFoundError:
    print(f"Error: No se encuentra el archivo {json_filename}")
    exit()

# Definir las columnas exactas solicitadas
fieldnames = [
    'nombre_obra',
    'arquitecto',
    'año_construccion',
    'latitud',
    'longitud',
    'importancia',
    'id',
    'añadido_por',
    'categoria',
    'visitable',
    'foto_url',
    'enlace_url',
    'estado_acceso'
]

rows_to_write = []

# 2. Recorrer cada obra y transformar los datos
for index, item in enumerate(data, start=1):
    # Generar el ID con formato AVXXX (ej. AV001, AV002...)
    av_id = f"AV{index:03d}"
    
    # Nombre de la obra (title)
    nombre_obra = item.get('title', '')
    
    # Arquitectos (viene como una lista de strings en 'author')
    autores = item.get('author', [])
    if autores:
        arquitecto_str = ", ".join(autores)
    else:
        arquitecto_str = "Sin arquitecto"
        
    # Año de construcción (viene en 'date')
    ano_construccion = item.get('date', '') or ''
    
    # Coordenadas (vienen juntas en una cadena tipo "lat,lng" en 'coords')
    coords = item.get('coords', '')
    latitud = ''
    longitud = ''
    if coords and ',' in coords:
        partes = coords.split(',')
        latitud = partes[0].strip()
        longitud = partes[1].strip()
        
    # URL de la foto (construida a partir del campo 'img' o ruta relativa)
    img_path = item.get('img', '')
    if img_path:
        foto_url = f"https://arquitecturaviva.com/assets/img/{img_path}" if not img_path.startswith("http") else img_path
    else:
        foto_url = ""
        
    # Enlace de referencia (usando el slug para apuntar a la web oficial)
    slug = item.get('slug', '')
    enlace_url = f"https://arquitecturaviva.com/obras/{slug}" if slug else "https://arquitecturaviva.com/"

    row = {
        'nombre_obra': nombre_obra,
        'arquitecto': arquitecto_str,
        'año_construccion': ano_construccion,
        'latitud': latitud,
        'longitud': longitud,
        'importancia': 1,              # Fijo en 1
        'id': av_id,                   # Formato AV001, AV002...
        'añadido_por': 'AV',           # Fijo en AV
        'categoria': 'Arquitectura',   # Categoría genérica por defecto
        'visitable': 'true',           # Valor booleano estándar para CSV/Supabase
        'foto_url': foto_url,
        'enlace_url': enlace_url,
        'estado_acceso': 'Desconocido'
    }
    
    rows_to_write.append(row)

# 3. Guardar el resultado en un archivo CSV limpio
with open(csv_filename, 'w', newline='', encoding='utf-8') as csv_file:
    writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows_to_write)

print(f"¡Conversión completada con éxito! Archivo guardado como '{csv_filename}'.")