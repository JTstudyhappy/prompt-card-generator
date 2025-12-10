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
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const payload = await req.json();
        // payload 结构: { action: 'upsert'|'delete'|'like', card: Object, cardId: String }

        // 1. 读取最新数据
        const { data: currentData, etag: currentEtag } = await store.getWithMetadata(KEY, { type: "json" });
        let cards = Array.isArray(currentData) ? currentData : [];

        // 2. 根据 action 修改数据
        if (payload.action === 'upsert') {
          const newCard = payload.card;
          const index = cards.findIndex(c => c.id === newCard.id);
          if (index !== -1) {
            // 编辑：保留原有 likes 和 createdAt (如果前端没传)
            cards[index] = {
              ...cards[index],
              ...newCard,
              likes: cards[index].likes || 0,
              createdAt: cards[index].createdAt || Date.now()
            };
          } else {
            // 新增
            cards.push({
              ...newCard,
              likes: 0,
              createdAt: Date.now()
            });
          }
        } else if (payload.action === 'delete') {
          cards = cards.filter(c => c.id !== payload.cardId);
        } else if (payload.action === 'like') {
          const index = cards.findIndex(c => c.id === payload.cardId);
          if (index !== -1) {
            cards[index].likes = (cards[index].likes || 0) + 1;
          }
        }

        // 3. 尝试写入 (带上 ETag)
        const options = {};
        if (currentEtag) {
          options.onlyIfMatch = currentEtag;
        }

        await store.setJSON(KEY, cards, options);

        // 4. 成功！返回最新的数据给前端，以便前端更新视图
        return new Response(JSON.stringify({ success: true, data: cards }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        console.error(`Attempt ${attempt + 1} failed:`, err);
        
        // 检查是否是并发冲突 (409/Precondition Failed)
        // Netlify Blobs 在 ETag 不匹配时会抛出特定错误
        const isConflict = err.message && (
          err.message.includes("etag") || 
          err.message.includes("condition") || 
          err.status === 412 || // Precondition Failed
          err.status === 409    // Conflict
        );

        if (isConflict) {
          attempt++;
          // 如果还有重试机会，继续下一次循环
          if (attempt < MAX_RETRIES) {
            continue; 
          }
        }

        // 如果不是冲突错误，或者重试次数用尽，返回错误
        return new Response(JSON.stringify({ error: isConflict ? "Server busy, please try again." : err.message }), { 
          status: isConflict ? 409 : 500 
        });
      }
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
};
