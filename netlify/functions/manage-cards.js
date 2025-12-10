import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const store = getStore("app-data");
  const KEY = "cards.json";

  // 处理 GET 请求：获取数据
  if (req.method === "GET") {
    try {
      const data = await store.get(KEY, { type: "json" });
      // 如果没有数据（第一次运行），返回 null，前端会使用默认数据
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify(null), { status: 200 });
    }
  } 
  
  // 处理 POST 请求：保存数据
  else if (req.method === "POST") {
    try {
      const body = await req.json();
      // 将整个卡片数组存入 Blob
      await store.setJSON(KEY, body);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
};
