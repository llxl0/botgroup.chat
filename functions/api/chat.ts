import OpenAI from "openai";
import { modelConfigs } from "../../src/config/aiCharacters";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function onRequestPost({ env, request }) {
  try {
    const payload = await request.json();
    const {
      message = "",
      custom_prompt = "",
      history = [],
      aiName = "AI",
      index = 0,
      model = "qwen-plus",
    } = payload || {};

    if (!message || typeof message !== "string") {
      return Response.json({ error: "缺少用户消息内容" }, { status: 400 });
    }

    const safeHistory: ChatMessage[] = Array.isArray(history)
      ? history.slice(-10)
      : [];
    const insertIndex =
      typeof index === "number" && Number.isFinite(index) ? index : 0;

    const modelConfig = modelConfigs.find((config) => config.model === model);
    if (!modelConfig) {
      return Response.json({ error: "不支持的模型类型" }, { status: 400 });
    }

    const apiKey = env[modelConfig.apiKey];
    if (!apiKey) {
      return Response.json(
        { error: `${model} 的 API 密钥未配置` },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: modelConfig.baseURL,
    });

    const systemPrompt =
      `${custom_prompt || ""}\n` +
      `注意事项：1）你在群里叫 ${aiName}，认准自己的身份；` +
      `2）输出内容不要添加 “${aiName}：” 这类前缀；` +
      `3）如果用户要求玩游戏（如成语接龙），严格按规则，回复简短；` +
      `4）保持群聊风格，除新闻总结外尽量控制在 50 字以内。`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...safeHistory,
    ];

    const userMessage: ChatMessage = { role: "user", content: message };
    if (insertIndex <= 0 || insertIndex >= messages.length) {
      messages.push(userMessage);
    } else {
      messages.splice(messages.length - insertIndex, 0, userMessage);
    }

    const stream = await openai.chat.completions.create({
      model,
      messages,
      stream: true,
    });

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ content })}\n\n`
                )
              );
            }
          }
          controller.close();
        } catch (err: any) {
          controller.error(err);
          console.error("Streaming error:", err?.message || err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("API Error in chat.ts:", error?.message, error?.stack);
    const errorMessage = error?.message || "服务异常，请稍后再试";
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
