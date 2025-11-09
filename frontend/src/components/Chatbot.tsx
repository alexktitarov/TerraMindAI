import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Bot, User, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  visualization?: 'chart' | 'map' | null;
}

export const Chatbot = () => {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm Terra, your AI assistant for climate education. How can I help you today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Hide chatbot on course detail pages (where quizzes are shown)
  const isCourseDetailPage = location.pathname.startsWith('/courses/') && location.pathname !== '/courses/create';

  // Auto-scroll to bottom when new messages are added or content changes
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isLoading]);

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please log in to use the chatbot.",
        variant: "destructive",
      });
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: getCurrentTime(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageText = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    // Create a placeholder for the assistant's response
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: getCurrentTime(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      await api.chatStream(
        messageText,
        // onChunk - called for each content chunk
        (chunk: string) => {
          // Update the message in real-time
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + chunk }
                : msg
            )
          );
        },
        // onVisualization - called when visualization is detected
        (visualizationType: 'chart' | 'map' | null) => {
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, visualization: visualizationType }
                : msg
            )
          );
        },
        // onComplete - called when stream is complete
        (fullResponse: string) => {
          setIsLoading(false);
          // Final update with complete response
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: fullResponse || msg.content }
                : msg
            )
          );
        },
        // onError - called on error
        (error: string) => {
          setIsLoading(false);
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: `Error: ${error}` }
                : msg
            )
          );
          toast({
            title: "Chat Error",
            description: error,
            variant: "destructive",
          });
        }
      );
    } catch (error: any) {
      console.error('Chat error:', error);
      setIsLoading(false);
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: `Error: ${error.message || 'Failed to get response'}` }
            : msg
        )
      );
      toast({
        title: "Chat Error",
        description: error.message || "Failed to get response from chatbot",
        variant: "destructive",
      });
    }
  };

  const handleClearChat = async () => {
    try {
      await api.clearChat();
      setMessages([
        {
          id: "1",
          role: "assistant",
          content: "Hello! I'm Terra, your AI assistant for climate education. How can I help you today?",
          timestamp: getCurrentTime(),
        },
      ]);
      toast({
        title: "Conversation Cleared",
        description: "Chat history has been cleared.",
      });
    } catch (error: any) {
      console.error('Clear chat error:', error);
      toast({
        title: "Error",
        description: "Failed to clear conversation history.",
        variant: "destructive",
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Don't render chatbot on course detail pages (where quizzes are shown)
  if (isCourseDetailPage) {
    return null;
  }

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90"
          size="icon"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="sr-only">Open chat</span>
        </Button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 w-96 h-[600px] shadow-2xl z-50 flex flex-col border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Terra</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearChat}
                className="h-8 w-8"
                title="Clear conversation"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
            <div 
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
              style={{ 
                scrollBehavior: 'smooth',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                        {isLoading && message.id === messages[messages.length - 1]?.id && message.role === "assistant" && message.content && (
                          <span className="inline-block w-2 h-4 bg-foreground/40 ml-1 animate-pulse" />
                        )}
                        {isLoading && message.id === messages[messages.length - 1]?.id && message.role === "assistant" && !message.content && (
                          <span className="text-xs opacity-70 italic">Thinking...</span>
                        )}
                      </p>
                      {message.visualization && (
                        <div className="mt-2 text-xs italic opacity-70">
                          📊 Visualization: {message.visualization === 'chart' ? 'Chart' : 'Map'}
                        </div>
                      )}
                      <span className="text-xs opacity-70 mt-1 block">
                        {message.timestamp}
                      </span>
                    </div>
                    {message.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Type your message..."
                  className="flex-1"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading}
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};


