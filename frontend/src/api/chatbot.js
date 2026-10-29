import { apiRequest } from "./client";

export const ChatbotAPI = {
  sendMessage: (message, conversationId = null, confirmedAction = null) =>
    apiRequest("/chatbot/message", {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        confirmed_action: confirmedAction,
      }),
    }),

  listConversations: () =>
    apiRequest("/chatbot/conversations", {
      method: "GET",
    }),

  getConversation: (conversationId) =>
    apiRequest(`/chatbot/conversations/${conversationId}`, {
      method: "GET",
    }),
};
