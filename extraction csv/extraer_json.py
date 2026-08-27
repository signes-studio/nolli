import json
import csv
import random
import string

def generar_id_aleatorio():
    letras = ''.join(random.choices(string.ascii_uppercase, k=6))
    numeros = ''.join(random.choices(string.digits, k=6))
    combinado = list(letras + numeros)
    random.shuffle(combinado)
    return ''.join(combinado)

def convertir_geojson_a_csv_limpio(ruta_geojson, ruta_csv):
    with open(ruta_geojson, 'r', encoding='utf-8') as f:
        data = json.load(f)

    columnas = [
        "nombre_obra",
        "arquitecto",
        "año_construccion",
        "latitud",
        "longitud",
        "importancia",
        "id",
        "añadido_por",
        "categoria",
        "visitable",
        "foto_url",
        "enlace_url",
        "estado_acceso"
    ]

    filas_procesadas = 0
    filas_descartadas = 0

    with open(ruta_csv, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=columnas)
        writer.writeheader()

        for feature in data.get("features", []):
            props = feature.get("properties", {})
            geometry = feature.get("geometry", {})
            
            nombre_obra = props.get("name") or props.get("alt_name")
            arquitecto = props.get("architect") or props.get("artist_name")
            año_construccion = props.get("start_date")
            
            if not nombre_obra and not arquitecto:
                filas_descartadas += 1
                continue

            # Extracción robusta de coordenadas puras (float)
            latitud = None
            longitud = None
            coords = geometry.get("coordinates", [])
            geom_type = geometry.get("type")
            
            try:
                if geom_type == "Point" and len(coords) >= 2:
                    # En formato Point suele ser [longitud, latitud]
                    longitud = float(coords[0])
                    latitud = float(coords[1])
                elif geom_type in ["Polygon", "MultiPolygon"] and len(coords) > 0:
                    # Cogemos el primer punto del primer anillo del polígono
                    primer_punto = coords[0][0]
                    longitud = float(primer_punto[0])
                    latitud = float(primer_punto[1])
            except (ValueError, TypeError, IndexError):
                pass

            if latitud is None or longitud is None:
                filas_descartadas += 1
                continue

            fila = {
                "nombre_obra": nombre_obra,
                "arquitecto": arquitecto,
                "año_construccion": año_construccion,
                "latitud": latitud,       # Número puro (ej: 40.4168)
                "longitud": longitud,     # Número puro (ej: -3.7038)
                "importancia": 3,
                "id": generar_id_aleatorio(),
                "añadido_por": "OpenStreetMap",
                "categoria": "",
                "visitable": True,
                "foto_url": props.get("wikimedia_commons") or "",
                "enlace_url": "",
                "estado_acceso": "exterior_visible"
            }
            
            writer.writerow(fila)
            filas_procesadas += 1

    print(f"¡CSV corregido generado con éxito!")
    print(f" - Registros limpios: {filas_procesadas}")
    print(f" - Descartados: {filas_descartadas}")

# Ejecuta el nuevo script para sobreescribir el CSV con el formato correcto
convertir_geojson_a_csv_limpio("madrid.geojson", "madrid_importable.csv")