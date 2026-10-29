import React, { useState, useEffect, useRef } from "react";
import { ChatbotAPI } from "../api/chatbot";

export default function ChatAssistantPage() {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [isHandedOff, setIsHandedOff] = useState(false);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, pendingAction]);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const list = await ChatbotAPI.listConversations();
      setConversations(list || []);
    } catch (err) {
      console.error("Failed to load conversations", err);
    }
  };

  const handleSelectConversation = async (convId) => {
    try {
      setIsLoading(true);
      setError(null);
      const detail = await ChatbotAPI.getConversation(convId);
      setActiveConversationId(detail.id);
      setMessages(detail.messages || []);
      setPendingAction(detail.pending_action || null);
      setIsHandedOff(detail.is_handed_off || false);
    } catch (err) {
      setError("Failed to load conversation history.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartNewChat = () => {
    setActiveConversationId(null);
    setMessages([
      {
        id: "intro",
        role: "assistant",
        content:
          "Hello! I am your DCMS Dental Care Assistant. I can help you check doctor availability, book or manage appointments, guide you to the right dental specialist, or answer clinic questions. How can I assist you today?",
        created_at: new Date().toISOString(),
      },
    ]);
    setPendingAction(null);
    setIsHandedOff(false);
    setError(null);
  };

  useEffect(() => {
    if (!activeConversationId && messages.length === 0) {
      handleStartNewChat();
    }
  }, []);

  const handleSend = async (customText = null, confirmedAction = null) => {
    const textToSend = customText !== null ? customText : inputMessage.trim();
    if (!textToSend && confirmedAction === null) return;

    setError(null);
    const userMsg = {
      id: "temp-" + Date.now(),
      role: "user",
      content: textToSend || (confirmedAction ? "Yes, please confirm and proceed." : "No, cancel this action."),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputMessage("");
    setIsLoading(true);

    try {
      const res = await ChatbotAPI.sendMessage(
        userMsg.content,
        activeConversationId,
        confirmedAction
      );

      if (!activeConversationId) {
        setActiveConversationId(res.conversation_id);
        loadConversations();
      }

      const asstMsg = {
        id: "bot-" + Date.now(),
        role: "assistant",
        content: res.message,
        tool_calls: res.proposed_action,
        created_at: res.created_at || new Date().toISOString(),
      };

      setMessages((prev) => [...prev, asstMsg]);
      setPendingAction(res.proposed_action || null);
      setIsHandedOff(res.is_handed_off || false);
    } catch (err) {
      setError(err.message || "Failed to get response from assistant.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (prompt) => {
    setInputMessage("");
    handleSend(prompt);
  };

  const handleConfirmAction = (confirm) => {
    handleSend(confirm ? "Yes, please confirm and proceed." : "No, please cancel this action.", confirm);
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: "1.875rem", fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>
            AI Dental Assistant
          </h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem", fontSize: "0.95rem" }}>
            Real-time appointment scheduling, triage suggestions, and clinical guidance.
          </p>
        </div>
        <button
          onClick={handleStartNewChat}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "0.875rem",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          + New consultation
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "1.5rem", minHeight: "650px" }}>
        {/* Sidebar: Conversation Sessions */}
        <div
          style={{
            backgroundColor: "var(--bg-section)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            maxHeight: "700px",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
            Consultation history
          </div>
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {conversations.length === 0 ? (
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic", padding: "0.5rem 0" }}>
                No previous conversations yet.
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  style={{
                    textAlign: "left",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px solid",
                    borderColor: activeConversationId === conv.id ? "var(--accent)" : "transparent",
                    backgroundColor: activeConversationId === conv.id ? "var(--bg-page)" : "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {conv.title || "Dental Consultation"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </div>
                </button>
              ))
            )}
          </div>

          <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--success)", marginRight: "6px" }} />
            Powered by Claude 3.5 Sonnet
          </div>
        </div>

        {/* Main Chat Thread */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "flex",
            flexDirection: "column",
            height: "700px",
            position: "relative",
          }}
        >
          {/* Handed-off state notice */}
          {isHandedOff && (
            <div
              style={{
                backgroundColor: "var(--warning-bg)",
                borderBottom: "1px solid var(--border)",
                padding: "0.75rem 1.25rem",
                fontSize: "0.875rem",
                color: "var(--warning)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span>ℹ️</span>
              <div>
                <strong>Handed off to clinic desk:</strong> This inquiry requires direct front-desk assistance. Please contact our reception at <strong>+1 (555) 019-2834</strong> or visit the clinic in person.
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "75%",
                      padding: "0.85rem 1.15rem",
                      borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                      backgroundColor: isUser ? "var(--accent)" : "var(--bg-section)",
                      color: isUser ? "#FFFFFF" : "var(--text-primary)",
                      fontSize: "0.925rem",
                      lineHeight: "1.45",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.content}
                  </div>
                  <span
                    style={{
                      fontSize: "0.725rem",
                      color: "var(--text-secondary)",
                      marginTop: "0.25rem",
                      padding: "0 0.25rem",
                    }}
                  >
                    {isUser ? "You" : "Assistant"} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}

            {/* Proposed Action Card (Two-step confirmation) */}
            {pendingAction && (
              <div
                style={{
                  backgroundColor: "var(--bg-section)",
                  border: "1.5px solid var(--accent)",
                  borderRadius: "8px",
                  padding: "1rem 1.25rem",
                  maxWidth: "80%",
                  margin: "0.5rem 0",
                  alignSelf: "flex-start",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "1.1rem" }}>📋</span>
                  <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>
                    Action confirmation required
                  </strong>
                </div>
                <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                  {pendingAction.summary || "Please confirm if you would like to execute this schedule modification."}
                </p>

                {pendingAction.params && (
                  <div
                    style={{
                      backgroundColor: "var(--bg-page)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.825rem",
                      color: "var(--text-primary)",
                      marginBottom: "1rem",
                    }}
                  >
                    {pendingAction.params.date && <div><strong>Date:</strong> {pendingAction.params.date}</div>}
                    {pendingAction.params.time_slot && <div><strong>Time:</strong> {pendingAction.params.time_slot}</div>}
                    {pendingAction.params.new_date && <div><strong>New date:</strong> {pendingAction.params.new_date}</div>}
                    {pendingAction.params.new_time_slot && <div><strong>New time:</strong> {pendingAction.params.new_time_slot}</div>}
                    {pendingAction.params.reason && <div><strong>Reason:</strong> {pendingAction.params.reason}</div>}
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    onClick={() => handleConfirmAction(true)}
                    disabled={isLoading}
                    style={{
                      padding: "0.45rem 1rem",
                      backgroundColor: "var(--accent)",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Confirm & proceed
                  </button>
                  <button
                    onClick={() => handleConfirmAction(false)}
                    disabled={isLoading}
                    style={{
                      padding: "0.45rem 1rem",
                      backgroundColor: "transparent",
                      color: "var(--danger)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Typing Indicator */}
            {isLoading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: "var(--bg-section)",
                  padding: "0.6rem 1rem",
                  borderRadius: "12px 12px 12px 2px",
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>Dental assistant is typing</span>
                <span className="dot-pulse">...</span>
              </div>
            )}

            {error && (
              <div
                style={{
                  backgroundColor: "var(--danger-bg)",
                  color: "var(--danger)",
                  padding: "0.65rem 1rem",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  alignSelf: "flex-start",
                }}
              >
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Pills */}
          <div
            style={{
              padding: "0.5rem 1.25rem",
              borderTop: "1px solid var(--border)",
              backgroundColor: "var(--bg-page)",
              display: "flex",
              gap: "0.5rem",
              overflowX: "auto",
              whiteSpace: "nowrap",
            }}
          >
            {[
              "Check doctor availability for tomorrow",
              "I have severe throbbing pain in my molar",
              "What are clinic hours and location?",
              "Book a dental checkup next Wednesday",
            ].map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickPrompt(prompt)}
                disabled={isLoading}
                style={{
                  padding: "0.35rem 0.75rem",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid var(--border)",
                  borderRadius: "16px",
                  fontSize: "0.775rem",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  transition: "border-color 0.2s, color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div
            style={{
              padding: "0.75rem 1.25rem",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              backgroundColor: "#FFFFFF",
              borderBottomLeftRadius: "8px",
              borderBottomRightRadius: "8px",
            }}
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about appointments, specialists, symptoms, or clinic details..."
              disabled={isLoading}
              style={{
                flex: 1,
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                fontSize: "0.925rem",
                outline: "none",
                backgroundColor: "var(--bg-page)",
                color: "var(--text-primary)",
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !inputMessage.trim()}
              style={{
                padding: "0.75rem 1.25rem",
                backgroundColor: inputMessage.trim() ? "var(--accent)" : "var(--bg-section)",
                color: inputMessage.trim() ? "#FFFFFF" : "var(--text-secondary)",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.9rem",
                fontWeight: 500,
                cursor: inputMessage.trim() ? "pointer" : "default",
                transition: "background-color 0.2s",
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
