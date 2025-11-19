interface Env {
  bgkv: KVNamespace;
}

// 获取指定群组的聊天历史
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const groupId = url.searchParams.get("groupId");

    if (!groupId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "groupId is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const key = `chat_history:${groupId}`;
    const stored = await env.bgkv.get(key);
    const messages = stored ? JSON.parse(stored) : [];

    return new Response(
      JSON.stringify({
        success: true,
        messages,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error fetching chat history:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to fetch chat history",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

// 保存指定群组的聊天历史
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { groupId, messages } = body || {};

    if (!groupId || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "groupId and messages are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const key = `chat_history:${groupId}`;
    await env.bgkv.put(key, JSON.stringify(messages));

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error saving chat history:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to save chat history",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

