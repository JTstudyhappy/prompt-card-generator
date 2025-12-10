import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const url = new URL(req.url);
  // 从路径中提取文件名，假设路径是 /images/filename.jpg
  // 或者从 query 参数获取 ?name=filename.jpg
  const filename = url.searchParams.get("name") || url.pathname.split("/").pop();

  if (!filename) {
    return new Response("Filename not provided", { status: 400 });
  }

  try {
    const store = getStore("images");
    const blob = await store.get(filename, { type: "stream" });

    if (!blob) {
      return new Response("Image not found", { status: 404 });
    }

    // 简单判断 Content-Type
    let contentType = "application/octet-stream";
    if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) contentType = "image/jpeg";
    else if (filename.endsWith(".png")) contentType = "image/png";
    else if (filename.endsWith(".gif")) contentType = "image/gif";
    else if (filename.endsWith(".webp")) contentType = "image/webp";

    return new Response(blob, {
      headers: { "Content-Type": contentType }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
