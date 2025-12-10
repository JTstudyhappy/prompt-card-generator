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

  // 核心辅助函数：带重试的更新操作
  // updateFn: 一个函数，接收当前数据，返回修改后的数据
  async function updateWithRetry(key, updateFn, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        // 1. 获取当前数据和 ETag (Metadata)
        // 注意：Netlify Blobs 的 getWithMetadata 返回 { data, etag }
        const { data, etag } = await store.getWithMetadata(key, { type: "json" });
        
        if (!data) {
            throw new Error("Card not found");
        }

        // 2. 应用修改逻辑
        const newData = updateFn(data);

        // 3. 尝试带 ETag 写入
        await store.setJSON(key, newData, { onlyIfMatch: etag });
        
        // 成功则直接返回
        return newData;
      } catch (err) {
        // 4. 检查是否是并发冲突 (412 Precondition Failed 或类似错误)
        // Netlify Blobs 在 ETag 不匹配时会抛出错误
        const isConflict = err.status === 412 || (err.message && (err.message.includes("etag") || err.message.includes("condition")));
        
        if (isConflict) {
          // 如果是冲突，且还有重试机会，则 continue 继续下一次循环
          if (i < maxRetries - 1) {
            // 可以稍微等待一下，避开高峰（指数退避），这里简单处理
            await new Promise(r => setTimeout(r, Math.random() * 50)); 
            continue;
          }
        }
        // 其他错误或重试耗尽，抛出
        throw err;
      }
    }
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
        const key = `${PREFIX}${card.id}.json`;
        
        // 检查文件是否存在，如果存在则需要合并
        const exists = await store.getMetadata(key);
        
        if (exists) {
            // 如果是编辑现有卡片，使用重试逻辑进行合并
            await updateWithRetry(key, (currentData) => {
                return {
                    ...currentData,     // 保留原有数据（如 likes, createdAt）
                    ...card,            // 覆盖用户编辑的字段（title, template 等）
                    likes: currentData.likes || 0, // 强制保留服务器端的点赞数
                    createdAt: currentData.createdAt || card.createdAt // 保持创建时间不变
                };
            });
        } else {
            // 如果是纯新增，直接写入
            await store.setJSON(key, card);
        }
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      else if (action === "like") {
        if (!id) {
          return new Response(JSON.stringify({ error: "Missing card ID for like" }), { status: 400 });
        }
        const key = `${PREFIX}${id}.json`;
        
        // 使用重试逻辑处理点赞
        await updateWithRetry(key, (currentData) => {
             return {
                 ...currentData,
                 likes: (currentData.likes || 0) + 1
             };
         });
         
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
