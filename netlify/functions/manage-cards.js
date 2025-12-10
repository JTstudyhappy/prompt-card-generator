import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const store = getStore("app-data");
  const PREFIX = "cards/";

  // 辅助函数：列出所有卡片
  async function listAllCards() {
    const { blobs } = await store.list({ prefix: PREFIX });
    const cards = [];
    // 并行读取所有卡片数据
    await Promise.all(
      blobs.map(async (blob) => {
        try {
          const cardData = await store.get(blob.key, { type: "json" });
          if (cardData) {
            cards.push(cardData);
          }
        } catch (e) {
          console.error(`Failed to read card ${blob.key}:`, e);
        }
      })
    );
    return cards;
  }

  // 处理 GET 请求：获取所有数据
  if (req.method === "GET") {
    try {
      const cards = await listAllCards();
      // 不再需要 ETag，因为我们不再整体覆盖
      return new Response(JSON.stringify({ data: cards }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  } 
  
  // 处理 POST 请求：保存（新增/修改）或删除数据
  else if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action, card, id } = body;

      if (action === "delete") {
        if (!id) {
          return new Response(JSON.stringify({ error: "Missing card ID for delete" }), { status: 400 });
        }
        const key = `${PREFIX}${id}.json`;
        await store.delete(key);
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      } 
      
      else if (action === "save") {
        if (!card || !card.id) {
          return new Response(JSON.stringify({ error: "Invalid card data" }), { status: 400 });
        }
        // 使用卡片 ID 作为文件名，确保唯一性
        const key = `${PREFIX}${card.id}.json`;
        
        // 写入单个文件，原子操作，互不影响
        await store.setJSON(key, card);
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      else if (action === "like") {
        if (!id) {
          return new Response(JSON.stringify({ error: "Missing card ID for like" }), { status: 400 });
        }
        const key = `${PREFIX}${id}.json`;
        
        // 点赞需要先读后写
        const currentCard = await store.get(key, { type: "json" });
        if (currentCard) {
            currentCard.likes = (currentCard.likes || 0) + 1;
            await store.setJSON(key, currentCard);
        }
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
};
