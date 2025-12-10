import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  // 仅允许 POST 请求
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    // 获取 Blob Store (名为 "images")
    const store = getStore("images");
    
    // 从请求体中获取文件数据
    // 假设前端发送的是 FormData，包含 'file' 字段
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return new Response("No file uploaded", { status: 400 });
    }

    // 生成唯一文件名 (例如: timestamp-filename)
    const filename = `${Date.now()}-${file.name}`;
    
    // 将文件存入 Blob Store
    // file 是一个 File 对象，可以直接作为 body 传入
    await store.set(filename, file);

    // 获取该 Blob 的公开访问 URL (如果站点配置了 Blob 重写，或者我们手动构造)
    // Netlify Blobs 默认不直接暴露 URL，通常需要通过 Function 读取或 Edge Function 重写
    // 这里为了简单，我们返回文件名，前端可以通过另一个 Function 获取图片，或者我们直接返回 Base64 (不推荐)
    // 更标准的做法是：存储后，返回一个可以访问该图片的 URL。
    // 假设我们配置了 netlify.toml 重写规则 /images/* -> /.netlify/functions/get-image?name=:name
    
    return new Response(JSON.stringify({ 
      success: true, 
      filename: filename,
      url: `/images/${filename}` // 预期的访问路径
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
