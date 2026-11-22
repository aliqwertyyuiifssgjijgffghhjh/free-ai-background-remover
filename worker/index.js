const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: cors });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "free-ai-background-remover",
        inference: env.IMAGES ? "cloudflare-images" : "browser-fallback",
        serverRemovalReady: Boolean(env.IMAGES),
      });
    }

    if (url.pathname !== "/api/remove") return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!env.IMAGES) return json({
      error: "Server image processing is not configured. Browser fallback is available.",
      code: "IMAGES_BINDING_MISSING",
    }, 503);

    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
      return json({ error: "Upload a PNG, JPG, or WebP image." }, 415);
    }

    const maxBytes = 15 * 1024 * 1024;
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > maxBytes) return json({ error: "Image is larger than 15 MB." }, 413);

    try {
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) return json({ error: "The uploaded image is empty." }, 400);
      if (bytes.byteLength > maxBytes) return json({ error: "Image is larger than 15 MB." }, 413);

      const transformed = await env.IMAGES.input(bytes)
        .transform({ segment: "foreground" })
        .output({ format: "image/png" });
      const response = transformed.response();
      if (!response.ok || !response.body) {
        return json({ error: "Cloudflare could not process this image. Try browser mode." }, 502);
      }

      const headers = new Headers(cors);
      headers.set("Content-Type", "image/png");
      headers.set("Content-Disposition", 'inline; filename="background-removed.png"');
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: 200, headers });
    } catch (error) {
      console.error("Cloudflare Images segmentation failed:", error);
      return json({
        error: "Server background removal failed. The browser AI fallback can still try this image.",
        code: "SEGMENTATION_FAILED",
      }, 502);
    }
  },
};
