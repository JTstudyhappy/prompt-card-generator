import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const store = getStore("app-data");
  const KEY = "cards.json";

  // 处理 GET 请求：获取数据
  if (req.method === "GET") {
    try {
      // 使用 getWithMetadata 获取数据和 ETag
      const { data, etag } = await store.getWithMetadata(KEY, { type: "json" });
      
      // 如果没有数据（第一次运行），返回 null
      if (!data) {
        return new Response(JSON.stringify({ data: null, etag: null }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ data, etag }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ data: null, etag: null }), { status: 200 });
    }
  } 
  
  // 处理 POST 请求：保存数据
  else if (req.method === "POST") {
    try {
      const { data, etag } = await req.json();
      
      // 选项配置
      const options = {};
      // 如果前端传了 etag，说明是基于某个版本进行的修改，需要开启乐观锁检查
      if (etag) {
        options.onlyIfMatch = etag;
      }

      // 将整个卡片数组存入 Blob
      await store.setJSON(KEY, data, options);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      console.error(err);
      // 如果是 ETag 不匹配导致的错误，Netlify Blobs 会抛出错误
      // 我们需要捕获并返回 409 状态码
      // 注意：具体错误信息可能因 SDK 版本而异，通常包含 "etag" 或 "precondition"
      if (err.message && (err.message.includes("etag") || err.message.includes("condition") || err.status === 412)) {
         return new Response(JSON.stringify({ error: "Conflict: Data has been modified by another user." }), { status: 409 });
      }

      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
};
