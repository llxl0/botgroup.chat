import React, { useState, useRef, useEffect } from "react";
import { Send, Share2, Settings2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { request } from "@/utils/request";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { AICharacter } from "@/config/aiCharacters";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { SharePoster } from "@/pages/chat/components/SharePoster";
import { MembersManagement } from "@/pages/chat/components/MembersManagement";
import Sidebar from "./Sidebar";
import { AdBanner, AdBannerMobile } from "./AdSection";
import { useUserStore } from "@/store/userStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAvatarData } from "@/utils/avatar";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useChatHistoryPersistence } from "@/hooks/useChatHistoryPersistence";

// 仅在聊天消息内应用 KaTeX 样式
const KaTeXStyle = () => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
    .chat-message .katex-html {
      display: none;
    }
    
    .chat-message .katex {
      font: normal 1.1em KaTeX_Main, Times New Roman, serif;
      line-height: 1.2;
      text-indent: 0;
      white-space: nowrap;
      text-rendering: auto;
    }
    
    .chat-message .katex-display {
      display: block;
      margin: 1em 0;
      text-align: center;
    }
    
    @import "katex/dist/katex.min.css";
  `,
    }}
  />
);

const ChatUI = () => {
  const userStore = useUserStore();
  const isMobile = useIsMobile();

  // 从 URL 获取群组索引
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id") ? parseInt(urlParams.get("id")!) : 0;

  // 1. 所有的 useState 声明
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(id);
  const [group, setGroup] = useState<any | null>(null);
  const [groupAiCharacters, setGroupAiCharacters] = useState<AICharacter[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isGroupDiscussionMode, setIsGroupDiscussionMode] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [allNames, setAllNames] = useState<string[]>([]);
  const [showMembers, setShowMembers] = useState(false);

  // 使用 localStorage 来持久化消息，key 包含群组索引以区分不同群组的聊天记录
  const [messages, setMessages, clearMessages] = useLocalStorage<any[]>(
    `chat_messages_group_${id}`,
    []
  );

  const [showAd, setShowAd] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [pendingContent, setPendingContent] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [mutedUsers, setMutedUsers] = useState<string[]>([]);
  const [showPoster, setShowPoster] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // 默认关闭，稍后根据设备类型设置

  // 2. 所有的 useRef 声明
  const currentMessageRef = useRef<number | null>(null);
  const typewriterRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedContentRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const abortController = useRef(new AbortController());
  const isInitialized = useRef(false);

  // 根据设备类型设置侧边栏默认状态
  useEffect(() => {
    if (isMobile !== undefined) {
      setSidebarOpen(!isMobile); // 手机端关闭，PC 端开启
    }
  }, [isMobile]);

  // 初始化数据：群组、角色、用户信息
  useEffect(() => {
    if (isInitialized.current) return;

    const initData = async () => {
      try {
        const response = await request(`/api/init`);
        const { data } = await response.json();

        const currentGroup = data.groups[selectedGroupIndex];
        const characters: AICharacter[] = data.characters;

        setGroups(data.groups);
        setGroup(currentGroup);
        setIsInitializing(false);
        setIsGroupDiscussionMode(currentGroup.isGroupDiscussionMode);

        const groupCharacters = characters
          .filter((character) => currentGroup.members.includes(character.id))
          .filter((character) => character.personality !== "sheduler")
          .sort((a, b) => {
            return (
              currentGroup.members.indexOf(a.id) -
              currentGroup.members.indexOf(b.id)
            );
          });

        setGroupAiCharacters(groupCharacters);

        const names = groupCharacters.map((character) => character.name);
        names.push("user");
        setAllNames(names);

        let avatarUrl: string | null = null;
        let nickname = "";

        if (data.user && data.user != null) {
          const response1 = await request("/api/user/info");
          const userInfo = await response1.json();
          userStore.setUserInfo(userInfo.data);
          avatarUrl = userInfo.data.avatar_url;
          nickname = userInfo.data.nickname;
        } else {
          userStore.setUserInfo({
            id: 0,
            phone: "",
            nickname,
            avatar_url: null,
            status: 0,
          });
        }

        setUsers([
          { id: 1, name: nickname, avatar: avatarUrl },
          ...groupCharacters,
        ]);
      } catch (error) {
        console.error("初始化数据失败", error);
        setIsInitializing(false);
      }
    };

    initData();
    isInitialized.current = true;
  }, [userStore, selectedGroupIndex]);

  // 使用 KV 持久化当前群组的消息
  useChatHistoryPersistence({
    group,
    messages,
    setMessages,
    groupAiCharacters,
    users,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      setShowAd(false);
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
      }
    };
  }, []);

  // 当用户信息更新时刷新 users 列表中的用户信息
  useEffect(() => {
    if (userStore.userInfo && users.length > 0) {
      setUsers((prev) => [
        {
          id: 1,
          name: userStore.userInfo.nickname,
          avatar: userStore.userInfo.avatar_url
            ? userStore.userInfo.avatar_url
            : null,
        },
        ...prev.slice(1),
      ]);
    }
  }, [userStore.userInfo, users.length]);

  const handleRemoveUser = (userId: number) => {
    setUsers(users.filter((user) => user.id !== userId));
  };

  const handleToggleMute = (userId: string) => {
    setMutedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleShareChat = () => {
    setShowPoster(true);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // 加载检查
  if (isInitializing || !group) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-orange-50 via-orange-50/70 to-orange-100 flex items-center justify-center">
        <div className="w-8 h-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
      </div>
    );
  }

  const handleSendMessage = async () => {
    if (isLoading) return;
    if (!inputMessage.trim()) return;

    // 添加用户消息
    const userMessage = {
      id: messages.length + 1,
      sender: users[0],
      content: inputMessage,
      isAI: false,
    };
    setMessages((prev: any[]) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);
    setPendingContent("");
    accumulatedContentRef.current = "";

    // 构建历史消息数组
    let messageHistory = messages.map((msg: any) => ({
      role: "user",
      content:
        msg.sender.name === userStore.userInfo.nickname
          ? "user：" + msg.content
          : msg.sender.name + "：" + msg.content,
      name: msg.sender.name,
    }));

    let selectedGroupAi = groupAiCharacters;

    // 使用 scheduler 选择参与对话的 AI
    if (!isGroupDiscussionMode) {
      const schedulerResponse = await request(`/api/scheduler`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: inputMessage,
          history: messageHistory,
          availableAIs: groupAiCharacters,
        }),
      });
      const schedulerData = await schedulerResponse.json();
      const selectedAIs = schedulerData.selectedAIs;
      selectedGroupAi = selectedAIs.map((ai: string) =>
        groupAiCharacters.find((c) => c.id === ai)
      ) as AICharacter[];
    }

    for (let i = 0; i < selectedGroupAi.length; i++) {
      const character = selectedGroupAi[i];
      if (!character) continue;

      // 禁言检查
      if (mutedUsers.includes(character.id)) {
        continue;
      }

      const aiMessage = {
        id: messages.length + 2 + i,
        sender: {
          id: character.id,
          name: character.name,
          avatar: character.avatar,
        },
        content: "",
        isAI: true,
      };

      setMessages((prev: any[]) => [...prev, aiMessage]);

      let uri = "/api/chat";
      if ((character as any).rag === true) {
        uri = "/rag/query";
      }

      try {
        const response = await request(uri, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: character.model,
            message: inputMessage,
            query: inputMessage,
            personality: character.personality,
            history: messageHistory,
            index: i,
            aiName: character.name,
            rag: (character as any).rag,
            knowledge: (character as any).knowledge,
            custom_prompt:
              character.custom_prompt.replace("#groupName#", group.name) +
              "\n" +
              group.description,
          }),
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("无法获取响应流");
        }

        let buffer = "";
        let completeResponse = "";
        const timeout = 10000;

        while (true) {
          const startTime = Date.now();
          let { done, value } = (await Promise.race([
            reader.read(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("响应超时")),
                timeout - (Date.now() - startTime)
              )
            ),
          ])) as ReadableStreamReadResult<Uint8Array>;

          if (Date.now() - startTime > timeout) {
            reader.cancel();
            if (completeResponse.trim() === "") {
              throw new Error("响应超时");
            }
            done = true;
          }

          if (done) {
            if (completeResponse.trim() === "") {
              completeResponse = "对不起，我还不够智能，服务又断开了。";
              setMessages((prev: any[]) => {
                const newMessages = [...prev];
                const idx = newMessages.findIndex(
                  (msg) => msg.id === aiMessage.id
                );
                if (idx !== -1) {
                  newMessages[idx] = {
                    ...newMessages[idx],
                    content: completeResponse,
                  };
                }
                return newMessages;
              });
            }
            break;
          }

          buffer += decoder.decode(value!, { stream: true });

          let newlineIndex;
          while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  completeResponse += data.content;
                  completeResponse = completeResponse.replace(
                    new RegExp(`^(${allNames.join("|")})：`, "i"),
                    ""
                  );
                  setMessages((prev: any[]) => {
                    const newMessages = [...prev];
                    const idx = newMessages.findIndex(
                      (msg) => msg.id === aiMessage.id
                    );
                    if (idx !== -1) {
                      newMessages[idx] = {
                        ...newMessages[idx],
                        content: completeResponse,
                      };
                    }
                    return newMessages;
                  });
                }
              } catch (e) {
                console.error("解析响应数据失败:", e);
              }
            }
          }
        }

        // 将当前 AI 的回复添加到消息历史中
        messageHistory.push({
          role: "user",
          content: character.name + "：" + completeResponse,
          name: character.name,
        });

        if (i < selectedGroupAi.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error: any) {
        console.error("发送消息失败", error);
        messageHistory.push({
          role: "user",
          content:
            character.name +
            "对不起，我还不够智能，服务又断开了（错误：" +
            error.message +
            "）",
          name: character.name,
        });
        setMessages((prev: any[]) =>
          prev.map((msg) =>
            msg.id === aiMessage.id
              ? {
                  ...msg,
                  content:
                    "对不起，我还不够智能，服务又断开了（错误：" +
                    error.message +
                    "）",
                  isError: true,
                }
              : msg
          )
        );
      }
    }

    setIsLoading(false);
  };

  const handleCancel = () => {
    abortController.current.abort();
  };

  const handleSelectGroup = (index: number) => {
    window.location.href = `?id=${index}`;
  };

  return (
    <>
      <KaTeXStyle />
      <div className="fixed inset-0 bg-gradient-to-br from-orange-50 via-orange-50/70 to-orange-100 flex items-start md:items-center justify-center overflow-hidden">
        <div className="h-full flex bg-white w-full mx-auto relative shadow-xl md:max-w-5xl md:h-[96dvh] md:my-auto md:rounded-lg">
          {/* 左侧 Sidebar */}
          <div
            className={`relative flex-shrink-0 border-r border-gray-200 bg-gray-50/80 backdrop-blur-sm transition-all duration-300 ${
              sidebarOpen ? "w-64" : "w-0 md:w-64"
            }`}
          >
            <div
              className={`h-full flex flex-col ${
                sidebarOpen ? "opacity-100" : "opacity-0 md:opacity-100"
              } transition-opacity duration-200`}
            >
              <Sidebar
                groups={groups}
                selectedGroupIndex={selectedGroupIndex}
                onSelectGroup={handleSelectGroup}
                onToggleSidebar={toggleSidebar}
              />
            </div>
          </div>

          {/* 右侧主内容区域 */}
          <div className="flex-1 flex flex-col h-full">
            {/* 顶部导航 */}
            <header className="flex items-center justify-between px-3 py-2 border-b bg-white/80 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <button
                  className="md:hidden mr-1"
                  onClick={toggleSidebar}
                  aria-label="Toggle sidebar"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-600" />
                </button>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-semibold text-gray-900">
                      {group.name}
                    </h1>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-1 max-w-xs md:max-w-md">
                    {group.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden md:block">
                  <AdBanner show={showAd} closeAd={() => setShowAd(false)} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {users.slice(0, 4).map((user) => {
                      const avatarData = getAvatarData(user.name);
                      return (
                        <TooltipProvider key={user.id}>
                          <Tooltip>
                            <TooltipTrigger>
                              <Avatar className="w-7 h-7 border-2 border-white">
                                {"avatar" in user &&
                                user.avatar &&
                                user.avatar !== null ? (
                                  <AvatarImage src={user.avatar} />
                                ) : (
                                  <AvatarFallback
                                    style={{
                                      backgroundColor:
                                        avatarData.backgroundColor,
                                      color: "white",
                                    }}
                                  >
                                    {avatarData.text}
                                  </AvatarFallback>
                                )}
                              </Avatar>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{user.name}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                    {users.length > 4 && (
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs border-2 border-white">
                        +{users.length - 4}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowMembers(true)}
                  >
                    <Settings2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </header>

            {/* 主聊天区域 */}
            <div className="flex-1 overflow-hidden bg-gray-100">
              <ScrollArea
                className={`h-full ${
                  !showAd ? "px-2 py-1" : ""
                } md:px-2 md:py-1`}
                ref={chatAreaRef}
              >
                <div className="md:hidden">
                  <AdBannerMobile
                    show={showAd}
                    closeAd={() => setShowAd(false)}
                  />
                </div>
                <div className="space-y-4">
                  {messages.map((message: any) => (
                    <div
                      key={message.id}
                      className={`flex items-start gap-2 ${
                        message.sender.name === userStore.userInfo.nickname
                          ? "justify-end"
                          : ""
                      }`}
                    >
                      {message.sender.name !== userStore.userInfo.nickname && (
                        <Avatar>
                          {"avatar" in message.sender && message.sender.avatar ? (
                            <AvatarImage
                              src={message.sender.avatar}
                              className="w-10 h-10"
                            />
                          ) : (
                            <AvatarFallback
                              style={{
                                backgroundColor: getAvatarData(
                                  message.sender.name
                                ).backgroundColor,
                                color: "white",
                              }}
                            >
                              {message.sender.name[0]}
                            </AvatarFallback>
                          )}
                        </Avatar>
                      )}
                      <div
                        className={
                          message.sender.name === userStore.userInfo.nickname
                            ? "text-right"
                            : ""
                        }
                      >
                        <div className="text-sm text-gray-500">
                          {message.sender.name}
                        </div>
                        <div
                          className={`mt-1 p-3 rounded-lg shadow-sm chat-message ${
                            message.sender.name ===
                            userStore.userInfo.nickname
                              ? "bg-blue-500 text-white text-left"
                              : "bg-white"
                          }`}
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            className={`prose dark:prose-invert max-w-none ${
                              message.sender.name ===
                              userStore.userInfo.nickname
                                ? "text-white [&_*]:text-white"
                                : ""
                            }
                            [&_h2]:py-1
                            [&_h2]:m-0
                            [&_h3]:py-1.5
                            [&_h3]:m-0
                            [&_p]:m-0 
                            [&_pre]:bg-gray-900 
                            [&_pre]:p-2
                            [&_pre]:m-0 
                            [&_pre]:rounded-lg
                            [&_pre]:text-gray-100
                            [&_pre]:whitespace-pre-wrap
                            [&_pre]:break-words
                            [&_pre_code]:whitespace-pre-wrap
                            [&_pre_code]:break-words
                            [&_code]:text-sm
                            [&_code]:text-gray-400
                            [&_code:not(:where([class~=\"language-\"]))]:text-pink-500
                            [&_code:not(:where([class~=\"language-\"]))]:bg-transparent
                            [&_a]:text-blue-500
                            [&_a]:no-underline
                            [&_ul]:my-2
                            [&_ol]:my-2
                            [&_li]:my-1
                            [&_blockquote]:border-l-4
                            [&_blockquote]:border-gray-300
                            [&_blockquote]:pl-4
                            [&_blockquote]:my-2
                            [&_blockquote]:italic`}
                          >
                            {message.content}
                          </ReactMarkdown>
                          {message.isAI &&
                            isTyping &&
                            currentMessageRef.current === message.id && (
                              <span className="typing-indicator ml-1">
                                …
                              </span>
                            )}
                        </div>
                      </div>
                      {message.sender.name === userStore.userInfo.nickname && (
                        <Avatar>
                          {"avatar" in message.sender && message.sender.avatar ? (
                            <AvatarImage
                              src={message.sender.avatar}
                              className="w-10 h-10"
                            />
                          ) : (
                            <AvatarFallback
                              style={{
                                backgroundColor: getAvatarData(
                                  message.sender.name
                                ).backgroundColor,
                                color: "white",
                              }}
                            >
                              {message.sender.name[0]}
                            </AvatarFallback>
                          )}
                        </Avatar>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                  <div
                    id="qrcode"
                    className="flex flex-col items-center hidden"
                  >
                    <img
                      src="/img/qr.png"
                      alt="QR Code"
                      className="w-24 h-24"
                    />
                    <p className="text-sm text-gray-500 mt-2 font-medium tracking-tight bg-gray-50 px-3 py-1 rounded-full">
                      扫码体验AI群聊
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </div>

            {/* 底部输入区域 */}
            <div className="bg-white border-t py-3 px-2 md:rounded-b-lg">
              <div className="flex gap-1 pb-[env(safe-area-inset-bottom)]">
                {messages.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleShareChat}
                          className="px-3"
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>分享聊天记录</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <Input
                  placeholder="输入消息..."
                  className="flex-1"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                />
                <Button onClick={handleSendMessage} disabled={isLoading}>
                  {isLoading ? (
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 成员管理对话框 */}
        <MembersManagement
          showMembers={showMembers}
          setShowMembers={setShowMembers}
          users={users}
          mutedUsers={mutedUsers}
          handleToggleMute={handleToggleMute}
          isGroupDiscussionMode={isGroupDiscussionMode}
          onToggleGroupDiscussion={() =>
            setIsGroupDiscussionMode(!isGroupDiscussionMode)
          }
          getAvatarData={getAvatarData}
          onClearMessages={() => {
            clearMessages();
            setShowMembers(false);
          }}
        />
      </div>

      {/* 分享聊天记录海报 */}
      <SharePoster
        isOpen={showPoster}
        onClose={() => setShowPoster(false)}
        chatAreaRef={chatAreaRef}
      />
    </>
  );
};

export default ChatUI;

