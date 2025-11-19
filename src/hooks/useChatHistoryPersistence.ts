import { useEffect, useRef } from "react";
import { request } from "@/utils/request";
import type { AICharacter } from "@/config/aiCharacters";

interface StoredMessage {
  id?: number;
  senderName: string;
  isAI: boolean;
  content: string;
}

interface UseChatHistoryPersistenceOptions {
  group: any;
  messages: any[];
  setMessages: (value: any) => void;
  groupAiCharacters: AICharacter[];
  users: any[];
}

export function useChatHistoryPersistence({
  group,
  messages,
  setMessages,
  groupAiCharacters,
  users,
}: UseChatHistoryPersistenceOptions) {
  const hasLoadedHistory = useRef(false);

  // 从服务端加载当前群组的历史聊天记录
  useEffect(() => {
    const loadHistory = async () => {
      if (!group) return;
      try {
        const response = await request(`/api/history?groupId=${group.id}`);
        const result = await response.json();
        if (!result || !result.success || !Array.isArray(result.messages)) {
          return;
        }

        const serverMessages = (result.messages as StoredMessage[]).map(
          (msg, index) => {
            const senderFromUsers = users.find(
              (u: any) => u.name === msg.senderName
            );
            const senderFromAI = groupAiCharacters.find(
              (c: AICharacter) => c.name === msg.senderName
            );
            const sender =
              senderFromUsers ||
              senderFromAI || {
                id: index + 1,
                name: msg.senderName,
                avatar: null,
              };

            return {
              id: msg.id ?? index + 1,
              sender,
              content: msg.content,
              isAI: msg.isAI,
            };
          }
        );

        setMessages(serverMessages);
      } catch (error) {
        console.error("加载聊天历史记录失败", error);
      } finally {
        hasLoadedHistory.current = true;
      }
    };

    if (group && !hasLoadedHistory.current) {
      loadHistory();
    }
  }, [group, groupAiCharacters, users, setMessages]);

  // 当消息发生变化时，将当前群组的消息持久化到服务端
  useEffect(() => {
    const saveHistory = async () => {
      if (!group || !hasLoadedHistory.current) return;
      try {
        const payload = messages.map((msg: any) => ({
          id: msg.id,
          senderName: msg.sender?.name,
          isAI: msg.isAI,
          content: msg.content,
        }));

        await request("/api/history", {
          method: "POST",
          body: JSON.stringify({
            groupId: group.id,
            messages: payload,
          }),
        });
      } catch (error) {
        console.error("保存聊天历史记录失败", error);
      }
    };

    if (group) {
      saveHistory();
    }
  }, [messages, group]);
}

