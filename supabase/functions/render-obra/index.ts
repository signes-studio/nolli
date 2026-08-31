import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") ?? "https://nollimap.app";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

serve(async (req: Request) => {
  const url = new URL(req.url);

  // 1. Extraer ID de la obra desde el path o query params (ej. /render-obra/CTAV2386 o ?id=CTAV2386)
  const pathParts = url.pathname.split("/").filter(Boolean);
  const idFromPath = pathParts[pathParts.length - 1] !== "render-obra" ? pathParts[pathParts.length - 1] : null;
  const obraId = url.searchParams.get("id") || url.searchParams.get("obra") || idFromPath;

  // 2. Descargar el index.html original del frontend
  let html = "";
  try {
    const htmlRes = await fetch(`${FRONTEND_URL}/index.html`);
    if (htmlRes.ok) {
      html = await htmlRes.text();
    }
  } catch (err) {
    console.error("Error al obtener index.html:", err);
  }

  // Fallback si no se puede descargar el HTML base
  if (!html) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>nolli. | atlas de arquitectura</title></head><body><script>window.location.href='${FRONTEND_URL}';</script></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (!obraId) {
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 3. Consultar la tabla Buildings en Supabase
  const { data: obra, error } = await supabase
    .from("Buildings")
    .select("id, nombre_obra, foto_url, arquitecto, año_construccion, place, categoria")
    .eq("id", obraId)
    .maybeSingle();

  if (error || !obra) {
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 4. Preparar metadatos Open Graph y Twitter Cards dinámicos
  const title = `${obra.nombre_obra || "Obra de arquitectura"}${obra.arquitecto ? ` — ${obra.arquitecto}` : ""}`;
  const descParts = [
    obra.año_construccion ? `Año: ${obra.año_construccion}` : "",
    obra.place ? `Ubicación: ${obra.place}` : "",
    obra.categoria ? `Categoría: ${obra.categoria}` : "",
    "Explora y geolocaliza esta obra en el atlas interactivo Nolli.",
  ].filter(Boolean);
  const description = descParts.join(" · ");
  const imageUrl = obra.foto_url || `${FRONTEND_URL}/icon.svg`;
  const canonicalUrl = `${FRONTEND_URL}/obra/${encodeURIComponent(obra.id)}`;

  const metaTags = `
    <!-- Open Graph / Redes Sociales (Inyectado por Supabase Edge Function) -->
    <title>${escapeHtml(title)} | nolli.</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="nolli. | atlas de arquitectura">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta property="og:image:alt" content="${escapeHtml(obra.nombre_obra)}">
    
    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${escapeHtml(canonicalUrl)}">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  `;

  // 5. Inyectar los metadatos dinámicos dentro de <head>
  const modifiedHtml = html.includes("</head>")
    ? html.replace("</head>", `${metaTags}\n</head>`)
    : `${html}\n${metaTags}`;

  // 6. Devolver el HTML enriquecido con cabeceras de caché perimetral
  return new Response(modifiedHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

