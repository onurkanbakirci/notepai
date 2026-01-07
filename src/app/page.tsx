"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Loader2, Check, X, Send, Sparkles, Plus, Clock, MoreHorizontal, ChevronDown, AtSign, Globe, Image, ArrowUp, Search, Pencil, Trash2, MessageSquare, Bot, Github } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Types for chat history
interface ChatSession {
  id: string;
  title: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  createdAt: number;
  updatedAt: number;
}

// Generate unique ID
const generateId = () => `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Get chat title from first user message or default
const getChatTitle = (messages: Array<{ role: "user" | "assistant"; content: string }>) => {
  const firstUserMessage = messages.find(m => m.role === "user");
  if (firstUserMessage) {
    const title = firstUserMessage.content.slice(0, 40);
    return title.length < firstUserMessage.content.length ? `${title}...` : title;
  }
  return "New Chat";
};

// Format relative time
const formatRelativeTime = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
};

// Group chats by date
const groupChatsByDate = (chats: ChatSession[]) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const lastWeek = today - 7 * 86400000;

  const groups: { [key: string]: ChatSession[] } = {
    "Today": [],
    "Yesterday": [],
    "Last 7 Days": [],
    "Older": [],
  };

  chats.forEach(chat => {
    const chatDate = new Date(chat.updatedAt).setHours(0, 0, 0, 0);
    if (chatDate >= today) {
      groups["Today"].push(chat);
    } else if (chatDate >= yesterday) {
      groups["Yesterday"].push(chat);
    } else if (chatDate >= lastWeek) {
      groups["Last 7 Days"].push(chat);
    } else {
      groups["Older"].push(chat);
    }
  });

  return groups;
};

export default function Home() {
  const [content, setContent] = useState("");
  const [ghostText, setGhostText] = useState("");
  const [isLoadingCompletion, setIsLoadingCompletion] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Quick edit state
  const [quickEditMode, setQuickEditMode] = useState(false);
  const [quickEditPrompt, setQuickEditPrompt] = useState("");
  const [quickEditSelection, setQuickEditSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [quickEditPosition, setQuickEditPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [isLoadingQuickEdit, setIsLoadingQuickEdit] = useState(false);

  // Diff preview state
  const [showDiffPreview, setShowDiffPreview] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [proposedText, setProposedText] = useState("");
  const [diffContext, setDiffContext] = useState<{
    before: string;
    after: string;
  } | null>(null);

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInput, setComposerInput] = useState("");
  const [composerMessages, setComposerMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    changes?: {
      type: "accepted" | "rejected";
      original: string;
      proposed: string;
    };
    contexts?: Array<{
      text: string;
      startLine: number;
      endLine: number;
    }>;
  }>>([]);
  const [isLoadingComposer, setIsLoadingComposer] = useState(false);
  const [composerContexts, setComposerContexts] = useState<Array<{
    id: string;
    text: string;
    startLine: number;
    endLine: number;
  }>>([]);
  const [composerMode, setComposerMode] = useState<"agent" | "plan" | "debug" | "chat">("agent");
  const [allSelected, setAllSelected] = useState(false); // Track if Cmd+A selected all including contexts
  const [pendingChanges, setPendingChanges] = useState<{
    original: string;
    proposed: string;
  } | null>(null); // Track proposed changes from composer
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("opus-4.5");
  const [autoMode, setAutoMode] = useState(false);

  // Chat history state
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]); // Track open tab IDs
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const quickEditInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const composerMessagesRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const historySearchRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAttemptedCompletionRef = useRef(false);
  const requestIdRef = useRef(0);

  // Load chat history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("notepai_chat_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setChatHistory(parsed);
      } catch (e) {
        console.error("Failed to parse chat history:", e);
      }
    }
  }, []);

  // Save chat history to localStorage when it changes
  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem("notepai_chat_history", JSON.stringify(chatHistory));
    }
  }, [chatHistory]);

  // Save current chat when messages change
  useEffect(() => {
    if (composerMessages.length > 0) {
      const now = Date.now();
      
      if (currentChatId) {
        // Update existing chat
        setChatHistory(prev => prev.map(chat => 
          chat.id === currentChatId 
            ? { ...chat, messages: composerMessages, title: getChatTitle(composerMessages), updatedAt: now }
            : chat
        ));
      } else {
        // Create new chat
        const newChat: ChatSession = {
          id: generateId(),
          title: getChatTitle(composerMessages),
          messages: composerMessages,
          createdAt: now,
          updatedAt: now,
        };
        setChatHistory(prev => [newChat, ...prev].slice(0, 5)); // Keep max 5 chats
        setCurrentChatId(newChat.id);
      }
    }
  }, [composerMessages, currentChatId]);

  // Filter and group chats
  const filteredChats = useMemo(() => {
    let chats = chatHistory;
    if (historySearch.trim()) {
      const search = historySearch.toLowerCase();
      chats = chats.filter(chat => 
        chat.title.toLowerCase().includes(search) ||
        chat.messages.some(m => m.content.toLowerCase().includes(search))
      );
    }
    return chats.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [chatHistory, historySearch]);

  const groupedChats = useMemo(() => groupChatsByDate(filteredChats), [filteredChats]);

  // Close history dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
        setEditingChatId(null);
      }
    };
    if (historyOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [historyOpen]);

  // Close menu dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  // Close mode dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isOutsideDropdown = modeDropdownRef.current && !modeDropdownRef.current.contains(target);
      const isOutsideButton = modeButtonRef.current && !modeButtonRef.current.contains(target);
      if (isOutsideDropdown && isOutsideButton) {
        setModeDropdownOpen(false);
      }
    };
    if (modeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [modeDropdownOpen]);

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isOutsideDropdown = modelDropdownRef.current && !modelDropdownRef.current.contains(target);
      const isOutsideButton = modelButtonRef.current && !modelButtonRef.current.contains(target);
      if (isOutsideDropdown && isOutsideButton) {
        setModelDropdownOpen(false);
      }
    };
    if (modelDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [modelDropdownOpen]);

  // Focus search when history opens
  useEffect(() => {
    if (historyOpen) {
      setTimeout(() => historySearchRef.current?.focus(), 50);
    } else {
      setHistorySearch("");
    }
  }, [historyOpen]);

  // Focus edit input when editing
  useEffect(() => {
    if (editingChatId) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editingChatId]);

  // Create new chat
  const handleNewChat = useCallback(() => {
    // Always create a new empty chat session
    const now = Date.now();
    const newChat: ChatSession = {
      id: generateId(),
      title: "New Chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setChatHistory(prev => [newChat, ...prev].slice(0, 5)); // Keep max 5 chats
    setCurrentChatId(newChat.id);
    setOpenTabs(prev => [...prev, newChat.id]); // Add to open tabs
    setComposerMessages([]);
    setComposerInput("");
    setHistoryOpen(false);
    setTimeout(() => composerInputRef.current?.focus(), 100);
  }, []);

  // Load a chat from history
  const handleLoadChat = useCallback((chat: ChatSession) => {
    setComposerMessages(chat.messages);
    setCurrentChatId(chat.id);
    // Add to open tabs if not already there
    setOpenTabs(prev => prev.includes(chat.id) ? prev : [...prev, chat.id]);
    setHistoryOpen(false);
    setTimeout(() => composerInputRef.current?.focus(), 100);
  }, []);

  // Switch to a tab
  const handleSwitchTab = useCallback((chatId: string) => {
    const chat = chatHistory.find(c => c.id === chatId);
    if (chat) {
      setComposerMessages(chat.messages);
      setCurrentChatId(chat.id);
    }
    setTimeout(() => composerInputRef.current?.focus(), 100);
  }, [chatHistory]);

  // Close a tab
  const handleCloseTab = useCallback((chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tabIndex = openTabs.indexOf(chatId);
    const newOpenTabs = openTabs.filter(id => id !== chatId);
    setOpenTabs(newOpenTabs);
    
    // If closing the current tab, switch to another tab
    if (currentChatId === chatId) {
      if (newOpenTabs.length > 0) {
        // Switch to the next tab, or previous if closing the last one
        const nextIndex = Math.min(tabIndex, newOpenTabs.length - 1);
        const nextChatId = newOpenTabs[nextIndex];
        const nextChat = chatHistory.find(c => c.id === nextChatId);
        if (nextChat) {
          setComposerMessages(nextChat.messages);
          setCurrentChatId(nextChat.id);
        }
      } else {
        // No tabs left, close composer and clear state
        setComposerMessages([]);
        setCurrentChatId(null);
        setComposerOpen(false);
        setComposerContexts([]);
        setHistoryOpen(false);
        setMenuOpen(false);
      }
    }
  }, [openTabs, currentChatId, chatHistory]);

  // Delete a chat
  const handleDeleteChat = useCallback((chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatHistory(prev => prev.filter(c => c.id !== chatId));
    setOpenTabs(prev => prev.filter(id => id !== chatId)); // Also remove from open tabs
    if (currentChatId === chatId) {
      setComposerMessages([]);
      setCurrentChatId(null);
    }
  }, [currentChatId]);

  // Start editing a chat title
  const handleStartEdit = useCallback((chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  }, []);

  // Save edited title
  const handleSaveTitle = useCallback(() => {
    if (editingChatId && editingTitle.trim()) {
      setChatHistory(prev => prev.map(chat =>
        chat.id === editingChatId
          ? { ...chat, title: editingTitle.trim() }
          : chat
      ));
    }
    setEditingChatId(null);
    setEditingTitle("");
  }, [editingChatId, editingTitle]);

  // Get current chat title for display
  const currentChatTitle = useMemo(() => {
    if (currentChatId) {
      const chat = chatHistory.find(c => c.id === currentChatId);
      return chat?.title || "New Chat";
    }
    return "New Chat";
  }, [currentChatId, chatHistory]);

  // Close current chat
  const handleCloseChat = useCallback(() => {
    setComposerOpen(false);
    setComposerContexts([]);
    setHistoryOpen(false);
    setMenuOpen(false);
  }, []);

  // Clear all chats from history
  const handleClearAllChats = useCallback(() => {
    setChatHistory([]);
    setOpenTabs([]); // Clear all tabs
    setComposerMessages([]);
    setCurrentChatId(null);
    localStorage.removeItem("notepai_chat_history");
    setMenuOpen(false);
  }, []);

  // Close other chats (keep only current)
  const handleCloseOtherChats = useCallback(() => {
    if (currentChatId) {
      setChatHistory(prev => prev.filter(c => c.id === currentChatId));
      setOpenTabs([currentChatId]); // Keep only the current tab open
    }
    setMenuOpen(false);
  }, [currentChatId]);

  // Export transcript
  const handleExportTranscript = useCallback(() => {
    if (composerMessages.length === 0) {
      setMenuOpen(false);
      return;
    }
    
    const transcript = composerMessages
      .map(m => `${m.role === "user" ? "You" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    
    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${currentChatTitle.slice(0, 20)}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }, [composerMessages, currentChatTitle]);

  // Copy chat ID
  const handleCopyRequestId = useCallback(() => {
    if (currentChatId) {
      navigator.clipboard.writeText(currentChatId);
    }
    setMenuOpen(false);
  }, [currentChatId]);

  // Check if cursor is at the end of content
  const isCursorAtEnd = useCallback(() => {
    return cursorPosition >= content.length;
  }, [cursorPosition, content.length]);

  // Fetch autocomplete suggestion (only once per pause)
  const fetchCompletion = useCallback(async (text: string, position: number, requestId: number) => {
    // Skip if already attempted for this pause
    if (hasAttemptedCompletionRef.current) return;

    // Need at least 5 characters
    if (!text.trim() || text.trim().length < 5) {
      return;
    }

    // Mark that we've attempted completion for this pause
    hasAttemptedCompletionRef.current = true;
    setIsLoadingCompletion(true);

    try {
      const response = await fetch("/api/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.substring(0, position)
        }),
      });

      if (!response.ok) throw new Error("Autocomplete failed");
      const data = await response.json();

      // Only set ghost text if this is still the latest request
      if (requestId === requestIdRef.current && data.completion && data.completion.trim()) {
        // Add space before completion if needed
        const needsSpace = text.length > 0 && 
          /\S$/.test(text) && // text ends with non-whitespace
          /^[^\s.,!?;:'"\-\n]/.test(data.completion); // completion starts with a word character
        
        setGhostText((needsSpace ? ' ' : '') + data.completion);
      }
    } catch (error) {
      console.error("Autocomplete error:", error);
    } finally {
      setIsLoadingCompletion(false);
    }
  }, []);

  // Handle text change with debounced autocomplete
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const newPosition = e.target.selectionStart;

    setContent(newContent);
    setCursorPosition(newPosition);

    // Clear ghost text and reset attempt flag when user types
    setGhostText("");
    hasAttemptedCompletionRef.current = false;

    // Increment request ID to invalidate any pending requests
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    // Clear any pending timeout
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }

    // Only auto-trigger autocomplete if cursor is at the END of the content
    const isAtEnd = newPosition >= newContent.length;

    if (newContent.trim().length >= 5 && isAtEnd) {
      completionTimeoutRef.current = setTimeout(() => {
        fetchCompletion(newContent, newPosition, currentRequestId);
      }, 150);
    }
  }, [fetchCompletion]);

  // Accept the proposed changes (for quick edit)
  const acceptChanges = useCallback(() => {
    if (!diffContext || !proposedText) return;

    const newContent = diffContext.before + proposedText + diffContext.after;
    setContent(newContent);

    // Reset diff state
    setShowDiffPreview(false);
    setOriginalText("");
    setProposedText("");
    setDiffContext(null);
    setQuickEditSelection(null);

    // Focus textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = diffContext.before.length + proposedText.length;
        textareaRef.current.selectionStart = newPosition;
        textareaRef.current.selectionEnd = newPosition;
        textareaRef.current.focus();
      }
    }, 0);
  }, [diffContext, proposedText]);

  // Reject the proposed changes (for quick edit)
  const rejectChanges = useCallback(() => {
    setShowDiffPreview(false);
    setOriginalText("");
    setProposedText("");
    setDiffContext(null);
    setQuickEditSelection(null);

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  // Accept pending composer changes
  const acceptPendingChanges = useCallback(() => {
    if (!pendingChanges) return;
    setContent(pendingChanges.proposed);
    // Add to message history with changes info
    setComposerMessages(prev => [...prev, { 
      role: "assistant", 
      content: `Changes applied`,
      changes: {
        type: "accepted",
        original: pendingChanges.original,
        proposed: pendingChanges.proposed,
      }
    }]);
    setPendingChanges(null);
  }, [pendingChanges]);

  // Reject pending composer changes
  const rejectPendingChanges = useCallback(() => {
    if (!pendingChanges) return;
    // Add to message history with changes info
    setComposerMessages(prev => [...prev, { 
      role: "assistant", 
      content: `Changes rejected`,
      changes: {
        type: "rejected",
        original: pendingChanges.original,
        proposed: pendingChanges.proposed,
      }
    }]);
    setPendingChanges(null);
  }, [pendingChanges]);

  // Handle composer submit
  const handleComposerSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!composerInput.trim() || isLoadingComposer) return;

    const userMessage = composerInput.trim();
    const contextToSend = composerContexts.length > 0 
      ? composerContexts.map(ctx => ctx.text).join('\n\n---\n\n') 
      : null;
    
    // Store contexts for the message before clearing
    const attachedContexts = composerContexts.length > 0 
      ? composerContexts.map(ctx => ({ text: ctx.text, startLine: ctx.startLine, endLine: ctx.endLine }))
      : undefined;
    
    setComposerInput("");
    setComposerContexts([]); // Clear contexts from input
    setComposerMessages(prev => [...prev, { role: "user", content: userMessage, contexts: attachedContexts }]);
    setIsLoadingComposer(true);

    try {
      const response = await fetch("/api/composer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          noteContent: content,
          history: composerMessages,
          selectedContext: contextToSend,
          mode: composerMode, // Pass the current mode
        }),
      });

      if (!response.ok) throw new Error("Composer request failed");
      const data = await response.json();

      setComposerMessages(prev => [...prev, { role: "assistant", content: data.response }]);

      // Only show pending changes in Agent mode (don't auto-apply)
      if (composerMode === "agent" && data.newContent !== undefined && data.newContent !== content) {
        setPendingChanges({
          original: content,
          proposed: data.newContent,
        });
      }
    } catch (error) {
      console.error("Composer error:", error);
      setComposerMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setIsLoadingComposer(false);
    }
  };

  // Scroll to bottom of composer messages
  useEffect(() => {
    if (composerMessagesRef.current) {
      composerMessagesRef.current.scrollTop = composerMessagesRef.current.scrollHeight;
    }
  }, [composerMessages]);

  // Focus composer input when opened and ensure at least one tab exists
  useEffect(() => {
    if (composerOpen) {
      // If no tabs are open, create a new one
      if (openTabs.length === 0) {
        const now = Date.now();
        const newChat: ChatSession = {
          id: generateId(),
          title: "New Chat",
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        setChatHistory(prev => [newChat, ...prev].slice(0, 5)); // Keep max 5 chats
        setCurrentChatId(newChat.id);
        setOpenTabs([newChat.id]);
        setComposerMessages([]);
      }
      setTimeout(() => {
        composerInputRef.current?.focus();
      }, 100);
    }
  }, [composerOpen, openTabs.length]);

  // Calculate position for quick edit popup based on selection
  const getSelectionPosition = useCallback(() => {
    if (!textareaRef.current) return null;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    
    // Create a temporary element to measure text position
    const div = document.createElement('div');
    const style = window.getComputedStyle(textarea);
    
    // Copy textarea styles to the div
    div.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
      width: ${textarea.clientWidth}px;
      font-family: ${style.fontFamily};
      font-size: ${style.fontSize};
      line-height: ${style.lineHeight};
      padding: ${style.padding};
      border: ${style.border};
      box-sizing: border-box;
    `;
    
    // Get text before cursor
    const textBeforeCursor = content.substring(0, start);
    
    // Create span to measure position
    const span = document.createElement('span');
    span.textContent = textBeforeCursor || '.';
    div.appendChild(span);
    
    const marker = document.createElement('span');
    marker.textContent = '|';
    div.appendChild(marker);
    
    document.body.appendChild(div);
    
    const textareaRect = textarea.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const divRect = div.getBoundingClientRect();
    
    // Calculate position relative to viewport
    const relativeTop = markerRect.top - divRect.top;
    const relativeLeft = markerRect.left - divRect.left;
    
    const top = textareaRect.top + relativeTop - textarea.scrollTop;
    const left = textareaRect.left + relativeLeft;
    
    document.body.removeChild(div);
    
    return { top, left };
  }, [content]);

  // Handle keydown for Tab, Cmd+K, Cmd+I, and diff Accept/Reject
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab key handling - only works when cursor is at end
    if (e.key === "Tab") {
      // Only handle Tab if cursor is at end
      if (!isCursorAtEnd()) return;

      e.preventDefault();

      // If ghost text exists, accept it (space is already included in ghostText if needed)
      if (ghostText) {
        const newContent = content + ghostText;
        setContent(newContent);
        setCursorPosition(newContent.length);
        setGhostText("");

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = newContent.length;
            textareaRef.current.selectionEnd = newContent.length;
          }
        }, 0);
        return;
      }

      // If no ghost text, trigger fetch manually
      if (content.trim().length >= 5 && !isLoadingCompletion) {
        hasAttemptedCompletionRef.current = false;
        requestIdRef.current += 1;
        fetchCompletion(content, cursorPosition, requestIdRef.current);
      }
      return;
    }

    // Cmd+K or Ctrl+K for quick edit
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      const start = textareaRef.current?.selectionStart ?? 0;
      const end = textareaRef.current?.selectionEnd ?? 0;

      // Calculate position before setting state
      const position = getSelectionPosition();
      
      setQuickEditSelection({ start, end });
      setQuickEditPosition(position);
      setQuickEditMode(true);
      setGhostText("");

      setTimeout(() => {
        quickEditInputRef.current?.focus();
      }, 50);
      return;
    }

    // Escape to cancel
    if (e.key === "Escape") {
      if (composerOpen) {
        setComposerOpen(false);
        setComposerContexts([]);
        setHistoryOpen(false);
        setMenuOpen(false);
        textareaRef.current?.focus();
      } else if (showDiffPreview) {
        rejectChanges();
      } else if (quickEditMode) {
        setQuickEditMode(false);
        setQuickEditPrompt("");
        setQuickEditSelection(null);
        setQuickEditPosition(null);
        textareaRef.current?.focus();
      } else if (ghostText) {
        setGhostText("");
      }
    }
  }, [ghostText, content, cursorPosition, quickEditMode, showDiffPreview, composerOpen, rejectChanges, isCursorAtEnd, fetchCompletion, isLoadingCompletion, getSelectionPosition]);

  // Global keyboard handler for diff preview and composer
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd+T to open new tab (only when composer is open)
      if ((e.metaKey || e.ctrlKey) && e.key === "t" && composerOpen) {
        e.preventDefault();
        handleNewChat();
        return;
      }

      // Cmd+W to close current tab (only when composer is open)
      if ((e.metaKey || e.ctrlKey) && e.key === "w" && composerOpen) {
        e.preventDefault();
        if (currentChatId && openTabs.length > 0) {
          // Create a synthetic event for handleCloseTab
          const syntheticEvent = { stopPropagation: () => {} } as React.MouseEvent;
          handleCloseTab(currentChatId, syntheticEvent);
        }
        return;
      }

      // Cmd+I to open composer and/or add context (does not close if already open)
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        
        // Capture selected text as context if textarea has a selection
        if (textareaRef.current) {
          const start = textareaRef.current.selectionStart;
          const end = textareaRef.current.selectionEnd;
          if (start !== end) {
            const selectedText = content.substring(start, end);
            // Calculate line numbers
            const textBeforeStart = content.substring(0, start);
            const textBeforeEnd = content.substring(0, end);
            const startLine = (textBeforeStart.match(/\n/g) || []).length + 1;
            const endLine = (textBeforeEnd.match(/\n/g) || []).length + 1;
            // Add new context to array
            setComposerContexts(prev => [...prev, {
              id: `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              text: selectedText,
              startLine,
              endLine,
            }]);
          }
        }
        
        // Open composer if not already open
        if (!composerOpen) {
          setComposerOpen(true);
          setGhostText("");
        }
        
        // Focus the composer input
        setTimeout(() => {
          composerInputRef.current?.focus();
        }, 100);
        return;
      }

      if (showDiffPreview) {
        // Cmd+Enter to accept
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          acceptChanges();
          return;
        }

        // Cmd+Backspace to reject
        if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
          e.preventDefault();
          rejectChanges();
          return;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          rejectChanges();
        }
      }

      // Handle pending composer changes
      if (pendingChanges) {
        // Cmd+Enter to accept
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          acceptPendingChanges();
          return;
        }

        // Cmd+Backspace to reject
        if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
          e.preventDefault();
          rejectPendingChanges();
          return;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          rejectPendingChanges();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [showDiffPreview, acceptChanges, rejectChanges, content, composerOpen, handleNewChat, currentChatId, openTabs, handleCloseTab, pendingChanges, acceptPendingChanges, rejectPendingChanges]);

  // Handle quick edit submission
  const handleQuickEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditPrompt.trim() || !quickEditSelection || isLoadingQuickEdit) return;

    setIsLoadingQuickEdit(true);

    const selectedText = content.substring(quickEditSelection.start, quickEditSelection.end);
    const beforeText = content.substring(0, quickEditSelection.start);
    const afterText = content.substring(quickEditSelection.end);

    try {
      const response = await fetch("/api/quickedit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: quickEditPrompt,
          selectedText,
          beforeContext: beforeText.slice(-500),
          afterContext: afterText.slice(0, 500),
        }),
      });

      if (!response.ok) throw new Error("Quick edit failed");
      const data = await response.json();

      if (data.result) {
        // Store for diff preview
        setOriginalText(selectedText);
        setProposedText(data.result);
        setDiffContext({ before: beforeText, after: afterText });
        setShowDiffPreview(true);
        setQuickEditMode(false);
        setQuickEditPrompt("");
        setQuickEditPosition(null);
      }
    } catch (error) {
      console.error("Quick edit error:", error);
      setQuickEditMode(false);
      setQuickEditPrompt("");
      setQuickEditSelection(null);
      setQuickEditPosition(null);
    } finally {
      setIsLoadingQuickEdit(false);
    }
  };

  // Track cursor position
  const handleSelect = useCallback(() => {
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart);
    }
  }, []);

  // Auto-focus textarea on page load
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-white flex justify-center py-6">
      {/* GitHub button */}
      <a
        href="https://github.com/onurkanbakirci/notepai"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-4 right-4 z-50 p-2 rounded-lg bg-white/80 backdrop-blur-sm border border-gray-200 shadow-sm hover:bg-gray-100 hover:shadow-md transition-all duration-200 group"
        title="View on GitHub"
      >
        <Github className="w-5 h-5 text-gray-700 group-hover:text-gray-900 transition-colors" />
      </a>

      {/* Loading indicator for autocomplete */}
      {isLoadingCompletion && (
        <div className="fixed top-4 right-16 z-50">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Quick Edit Input Popup - positioned above or below selection based on available space */}
      {quickEditMode && quickEditPosition && (() => {
        const popupHeight = 90; // Approximate height of the popup
        const buffer = 20; // Extra space between popup and selection
        const hasSpaceAbove = quickEditPosition.top > popupHeight + buffer;
        
        return (
          <form
            onSubmit={handleQuickEditSubmit}
            className="fixed z-50 bg-white rounded-lg shadow-2xl border border-border p-3 w-[420px]"
            style={{
              top: hasSpaceAbove 
                ? Math.max(8, quickEditPosition.top - popupHeight - buffer)
                : quickEditPosition.top + 32 + buffer, // 32px is the line height
              left: Math.max(8, Math.min(quickEditPosition.left - 60, window.innerWidth - 440)),
            }}
          >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                ref={quickEditInputRef}
                type="text"
                value={quickEditPrompt}
                onChange={(e) => setQuickEditPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setQuickEditMode(false);
                    setQuickEditPrompt("");
                    setQuickEditSelection(null);
                    setQuickEditPosition(null);
                    textareaRef.current?.focus();
                  }
                }}
                onBlur={(e) => {
                  // Close popup when clicking outside, but not if clicking within the form
                  if (!e.currentTarget.closest('form')?.contains(e.relatedTarget as Node)) {
                    setTimeout(() => {
                      if (!quickEditInputRef.current?.matches(':focus')) {
                        setQuickEditMode(false);
                        setQuickEditPrompt("");
                        setQuickEditSelection(null);
                        setQuickEditPosition(null);
                        textareaRef.current?.focus();
                      }
                    }, 100);
                  }
                }}
                placeholder={quickEditSelection?.start === quickEditSelection?.end
                  ? "What do you want to write?"
                  : "How should I edit this?"}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary/30 font-sans"
                disabled={isLoadingQuickEdit}
                autoFocus
              />
            </div>
            {isLoadingQuickEdit && (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground font-sans">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↵</kbd> submit • <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Esc</kbd> cancel
          </div>
        </form>
        );
      })()}

      {/* Diff Preview Modal (for Quick Edit) */}
      {showDiffPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-2xl border border-border w-full max-w-2xl mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground font-sans">Review Changes</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={rejectChanges}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground bg-white border border-border rounded-md hover:bg-secondary/50 transition-colors font-sans cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Reject
                  <kbd className="ml-1 px-1.5 py-0.5 bg-muted rounded text-xs">⌘⌫</kbd>
                </button>
                <button
                  onClick={acceptChanges}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors font-sans cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Accept
                  <kbd className="ml-1 px-1.5 py-0.5 bg-green-700 rounded text-xs">⌘↵</kbd>
                </button>
              </div>
            </div>

            {/* Diff Content */}
            <div className="max-h-[60vh] overflow-auto">
              {/* Old version */}
              {originalText && (
                <div className="border-b border-border">
                  <div className="px-4 py-2 bg-red-50 border-b border-red-100">
                    <span className="text-xs font-medium text-red-700 font-sans">ORIGINAL</span>
                  </div>
                  <div className="p-4 bg-red-50/50">
                    <pre className="whitespace-pre-wrap font-[var(--font-handwriting)] text-lg text-red-900 leading-relaxed">
                      <span className="bg-red-200/60 decoration-red-400">{originalText}</span>
                    </pre>
                  </div>
                </div>
              )}

              {/* New version */}
              <div>
                <div className="px-4 py-2 bg-green-50 border-b border-green-100">
                  <span className="text-xs font-medium text-green-700 font-sans">
                    {originalText ? "PROPOSED" : "NEW CONTENT"}
                  </span>
                </div>
                <div className="p-4 bg-green-50/50">
                  <pre className="whitespace-pre-wrap font-[var(--font-handwriting)] text-lg text-green-900 leading-relaxed">
                    <span className="bg-green-200/60">{proposedText}</span>
                  </pre>
                </div>
              </div>
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-border bg-secondary/20 text-xs text-muted-foreground font-sans text-center">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">⌘↵</kbd> to accept • <kbd className="px-1.5 py-0.5 bg-muted rounded">⌘⌫</kbd> or <kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd> to reject
            </div>
          </div>
        </div>
      )}

      {/* Composer Sheet - slides from right */}
      <Sheet open={composerOpen} onOpenChange={() => {
        // Prevent closing on outside clicks - only close via Cmd+I toggle or explicit close actions
      }} modal={false}>
        <SheetContent side="right" className="w-[400px] sm:max-w-[400px] flex flex-col p-0 bg-notepad border-l border-[#D4C47A] shadow-xl" hideOverlay hideCloseButton>
          {/* Header */}
          <div className="flex items-center justify-between h-[42px] bg-[#E8D5A3] border-b border-[#D4C47A]">
            {/* Tabs */}
            <div className="flex items-center h-full overflow-x-auto hide-scrollbar">
              {openTabs.map((tabId) => {
                const chat = chatHistory.find(c => c.id === tabId);
                const isActive = currentChatId === tabId;
                const title = chat?.title || "New Chat";
                return (
                  <div
                    key={tabId}
                    onClick={() => handleSwitchTab(tabId)}
                    className={`flex items-center gap-2 px-3 h-full border-r border-[#D4C47A] cursor-pointer transition-colors ${
                      isActive 
                        ? 'bg-notepad' 
                        : 'bg-[#E8D5A3] hover:bg-[#F0E68C]'
                    }`}
                  >
                    <span className={`text-[13px] font-medium truncate max-w-[100px] ${
                      isActive ? 'text-[#2D2A1F]' : 'text-[#6B6349]'
                    }`}>
                      {title}
                    </span>
                    <button 
                      onClick={(e) => handleCloseTab(tabId, e)}
                      className="p-0.5 rounded hover:bg-[#D4C47A] text-[#8B7355] hover:text-[#2D2A1F] transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Right icons with history dropdown */}
            <div className="flex items-center gap-0.5 pr-2 relative">
              <button 
                onClick={() => {
                  handleNewChat();
                  setMenuOpen(false);
                }}
                className="p-1.5 rounded hover:bg-[#F0E68C] text-[#8B7355] hover:text-[#2D2A1F] transition-colors cursor-pointer"
                title="New Chat"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button 
                onClick={() => {
                  setHistoryOpen(!historyOpen);
                  setMenuOpen(false);
                }}
                className={`p-1.5 rounded transition-colors cursor-pointer ${historyOpen ? 'bg-[#F0E68C] text-[#2D2A1F]' : 'hover:bg-[#F0E68C] text-[#8B7355] hover:text-[#2D2A1F]'}`}
                title="History"
              >
                <Clock className="w-4 h-4" />
              </button>
              <button 
                onClick={() => {
                  setMenuOpen(!menuOpen);
                  setHistoryOpen(false);
                }}
                className={`p-1.5 rounded transition-colors cursor-pointer ${menuOpen ? 'bg-[#F0E68C] text-[#2D2A1F]' : 'hover:bg-[#F0E68C] text-[#8B7355] hover:text-[#2D2A1F]'}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {/* Menu Dropdown */}
              {menuOpen && (
                <div 
                  ref={menuRef}
                  className="absolute top-full right-0 mt-1 w-[200px] bg-[#FFF9C4] rounded-lg border border-[#D4C47A] shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  <div className="py-1">
                    <button
                      onClick={handleNewChat}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left"
                    >
                      <span>New Tab</span>
                      <kbd className="text-xs text-[#8B7355] bg-[#E8D5A3] px-1.5 py-0.5 rounded">⌘T</kbd>
                    </button>
                    <button
                      onClick={(e) => {
                        if (currentChatId && openTabs.length > 0) {
                          handleCloseTab(currentChatId, e);
                        }
                        setMenuOpen(false);
                      }}
                      disabled={!currentChatId || openTabs.length === 0}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span>Close Tab</span>
                      <kbd className="text-xs text-[#8B7355] bg-[#E8D5A3] px-1.5 py-0.5 rounded">⌘W</kbd>
                    </button>
                    <button
                      onClick={handleClearAllChats}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left"
                    >
                      <span>Clear All Chats</span>
                    </button>
                    <button
                      onClick={handleCloseOtherChats}
                      disabled={!currentChatId || openTabs.length <= 1}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span>Close Other Tabs</span>
                    </button>
                    
                    <div className="h-px bg-[#E8D5A3] my-1" />
                    
                    <button
                      onClick={handleExportTranscript}
                      disabled={composerMessages.length === 0}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span>Export Transcript</span>
                    </button>
                    <button
                      onClick={handleCopyRequestId}
                      disabled={!currentChatId}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span>Copy Request ID</span>
                    </button>
                    
                    <div className="h-px bg-[#E8D5A3] my-1" />
                    
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left"
                    >
                      <span>Agent Settings</span>
                    </button>
                  </div>
                </div>
              )}

              {/* History Dropdown */}
              {historyOpen && (
                <div 
                  ref={historyRef}
                  className="absolute top-full right-0 mt-1 w-[320px] bg-[#FFF9C4] rounded-lg border border-[#D4C47A] shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  {/* Search */}
                  <div className="p-2 border-b border-[#E8D5A3]">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8B7355]" />
                      <input
                        ref={historySearchRef}
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-white text-[#2D2A1F] placeholder:text-[#A89968] rounded-md border border-[#D4C47A] outline-none focus:border-[#8B7355] transition-colors"
                      />
                    </div>
                  </div>

                  {/* Chat list */}
                  <div className="max-h-[400px] overflow-auto">
                    {filteredChats.length === 0 ? (
                      <div className="p-4 text-center text-sm text-[#8B7355]">
                        {historySearch ? "No chats found" : "No chat history yet"}
                      </div>
                    ) : (
                      Object.entries(groupedChats).map(([group, chats]) => 
                        chats.length > 0 && (
                          <div key={group}>
                            <div className="px-3 py-1.5 text-xs font-medium text-[#8B7355] bg-[#F5EBB5] sticky top-0">
                              {group}
                            </div>
                            {chats.map((chat) => (
                              <div
                                key={chat.id}
                                onClick={() => handleLoadChat(chat)}
                                className={`group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                                  currentChatId === chat.id 
                                    ? 'bg-[#F0E68C]' 
                                    : 'hover:bg-[#F5EBB5]'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-[#8B7355]">💬</span>
                                  {editingChatId === chat.id ? (
                                    <input
                                      ref={editInputRef}
                                      type="text"
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveTitle();
                                        if (e.key === "Escape") {
                                          setEditingChatId(null);
                                          setEditingTitle("");
                                        }
                                      }}
                                      onBlur={handleSaveTitle}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex-1 text-sm bg-white text-[#2D2A1F] border border-[#8B7355] rounded px-1.5 py-0.5 outline-none"
                                    />
                                  ) : (
                                    <span className="text-sm text-[#2D2A1F] truncate flex-1">{chat.title}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {currentChatId === chat.id && !editingChatId && (
                                    <span className="text-xs text-[#8B7355] mr-1">Current</span>
                                  )}
                                  {!editingChatId && (
                                    <>
                                      <span className="text-xs text-[#A89968] group-hover:hidden">{formatRelativeTime(chat.updatedAt)}</span>
                                      <div className="hidden group-hover:flex items-center gap-0.5">
                                        <button
                                          onClick={(e) => handleStartEdit(chat, e)}
                                          className="p-1 rounded hover:bg-[#E8D5A3] text-[#8B7355] hover:text-[#2D2A1F] transition-colors"
                                          title="Rename"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={(e) => handleDeleteChat(chat.id, e)}
                                          className="p-1 rounded hover:bg-[#E8D5A3] text-[#8B7355] hover:text-[#C41E3A] transition-colors"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div
            ref={composerMessagesRef}
            className="flex-1 overflow-auto px-4 py-4 space-y-3 hide-scrollbar"
          >
            {composerMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <div className="w-16 h-16 rounded-2xl bg-[#F5EBB5] flex items-center justify-center mb-4 border border-[#E8D5A3]">
                  {composerMode === "agent" ? (
                    <span className="text-3xl text-[#8B7355] font-bold">∞</span>
                  ) : (
                    <MessageSquare className="w-7 h-7 text-[#8B7355]" />
                  )}
                </div>
                <p className="text-[#2D2A1F] text-sm font-medium mb-1">
                  {composerMode === "agent" ? "Agent" : "Ask"}
                </p>
                <p className="text-[#6B6349] text-xs text-center max-w-[220px]">
                  {composerMode === "agent" 
                    ? "I can edit your notes, fix grammar, rewrite content, and more"
                    : "Ask me anything! I'll answer questions but won't edit your notes"
                  }
                </p>
                <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-[260px]">
                  {composerMode === "agent" ? (
                    <>
                      {["Fix grammar & spelling", "Summarize my notes", "Make it more concise"].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setComposerInput(suggestion)}
                          className="px-3 py-2 text-xs text-[#6B6349] bg-[#F5EBB5] hover:bg-[#F0E68C] border border-[#E8D5A3] hover:border-[#D4C47A] rounded-lg transition-all text-left cursor-pointer"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      {["What is this note about?", "Help me brainstorm ideas", "Explain this concept"].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setComposerInput(suggestion)}
                          className="px-3 py-2 text-xs text-[#6B6349] bg-[#F5EBB5] hover:bg-[#F0E68C] border border-[#E8D5A3] hover:border-[#D4C47A] rounded-lg transition-all text-left cursor-pointer"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
            {composerMessages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-200`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {msg.role === "assistant" && !msg.changes && (
                  <div className="w-6 h-6 rounded-md bg-[#8B7355] flex items-center justify-center mr-2 mt-0.5 flex-shrink-0 shadow-sm">
                    <Sparkles className="w-3 h-3 text-[#FFF9C4]" />
                  </div>
                )}
                {/* Regular message */}
                {!msg.changes && (
                  <div
                    className={`max-w-[80%] px-3.5 py-2.5 text-[13px] font-sans leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#8B7355] text-[#FFF9C4] rounded-2xl rounded-br-md shadow-md"
                        : "bg-[#F5EBB5] text-[#2D2A1F] rounded-2xl rounded-tl-md border border-[#E8D5A3]"
                    }`}
                  >
                    {/* Show attached contexts for user messages */}
                    {msg.contexts && msg.contexts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {msg.contexts.map((ctx, ctxIndex) => (
                          <div 
                            key={ctxIndex}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#6B5A47] rounded text-[11px]"
                          >
                            <span className="text-[#D4C47A] font-mono font-semibold">{`{}`}</span>
                            <span className="text-[#E8D5A3]">
                              {ctx.text.slice(0, 5).replace(/\n/g, ' ')}{ctx.text.length > 5 ? '...' : ''}
                            </span>
                            <span className="text-[#A89968]">
                              (line {ctx.startLine === ctx.endLine ? ctx.startLine : `${ctx.startLine}-${ctx.endLine}`})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                )}
                {/* Changes message with diff UI */}
                {msg.changes && (
                  <div className="w-full bg-[#F5EBB5] rounded-lg border border-[#D4C47A] overflow-hidden">
                    {/* Collapsible header */}
                    <details className="group" open>
                      <summary className="flex items-center gap-2 px-3 py-2 bg-[#E8D5A3] cursor-pointer select-none hover:bg-[#DDD0A0] transition-colors">
                        <ChevronDown className="w-4 h-4 text-[#8B7355] group-open:rotate-0 -rotate-90 transition-transform" />
                        <span className="text-xs font-medium text-[#5C4D3C]">1 File</span>
                        <span className={`ml-auto text-xs font-medium ${msg.changes.type === "accepted" ? "text-[#22863a]" : "text-[#cf222e]"}`}>
                          {msg.changes.type === "accepted" ? "✓ Applied" : "✗ Rejected"}
                        </span>
                      </summary>
                      {/* Diff content */}
                      <div className="max-h-[150px] overflow-auto">
                        {/* Added lines (green) */}
                        <div className="bg-[#dafbe1]">
                          <pre className="px-3 py-2 text-xs font-mono text-[#116329] whitespace-pre-wrap overflow-x-auto">
                            {msg.changes.proposed.split('\n').slice(0, 8).map((line, i) => (
                              <div key={i} className="flex">
                                <span className="select-none text-[#116329]/60 w-6 shrink-0">+</span>
                                <span>{line || ' '}</span>
                              </div>
                            ))}
                            {msg.changes.proposed.split('\n').length > 8 && (
                              <div className="text-[#116329]/60 italic">... {msg.changes.proposed.split('\n').length - 8} more lines</div>
                            )}
                          </pre>
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            ))}
            {isLoadingComposer && (
              <div className="flex items-center gap-2 px-3 py-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="w-4 h-4 border-2 border-[#8B7355] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-[#8B7355] font-medium">Thinking...</span>
              </div>
            )}
            
            {/* Pending Changes Preview */}
            {pendingChanges && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 bg-[#F5EBB5] rounded-lg border border-[#D4C47A] overflow-hidden">
                {/* Header with file count and actions */}
                <div className="flex items-center justify-between px-3 py-2 bg-[#E8D5A3] border-b border-[#D4C47A]">
                  <div className="flex items-center gap-2">
                    <span className="text-[#5C4D3C] text-xs font-medium">1 File Changed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={rejectPendingChanges}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#8B7355] hover:text-[#5C4D3C] hover:bg-[#D4C47A]/50 rounded transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                    <button
                      onClick={acceptPendingChanges}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-[#22863a] hover:bg-[#2ea043] rounded transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Accept
                    </button>
                  </div>
                </div>
                
                {/* Diff Preview */}
                <div className="max-h-[200px] overflow-auto">
                  {/* Removed lines */}
                  {pendingChanges.original && pendingChanges.original !== pendingChanges.proposed && (
                    <div className="bg-[#ffebe9] border-b border-[#ffcecb]">
                      <pre className="px-3 py-2 text-xs font-mono text-[#cf222e] whitespace-pre-wrap overflow-x-auto">
                        {pendingChanges.original.split('\n').slice(0, 10).map((line, i) => (
                          <div key={i} className="flex">
                            <span className="select-none text-[#cf222e]/60 w-6 shrink-0">-</span>
                            <span>{line || ' '}</span>
                          </div>
                        ))}
                        {pendingChanges.original.split('\n').length > 10 && (
                          <div className="text-[#cf222e]/60 italic">... {pendingChanges.original.split('\n').length - 10} more lines</div>
                        )}
                      </pre>
                    </div>
                  )}
                  {/* Added lines */}
                  <div className="bg-[#dafbe1]">
                    <pre className="px-3 py-2 text-xs font-mono text-[#116329] whitespace-pre-wrap overflow-x-auto">
                      {pendingChanges.proposed.split('\n').slice(0, 10).map((line, i) => (
                        <div key={i} className="flex">
                          <span className="select-none text-[#116329]/60 w-6 shrink-0">+</span>
                          <span>{line || ' '}</span>
                        </div>
                      ))}
                      {pendingChanges.proposed.split('\n').length > 10 && (
                        <div className="text-[#116329]/60 italic">... {pendingChanges.proposed.split('\n').length - 10} more lines</div>
                      )}
                    </pre>
                  </div>
                </div>
                
                {/* Footer hint */}
                <div className="px-3 py-1.5 bg-[#E8D5A3]/50 border-t border-[#D4C47A] text-[10px] text-[#8B7355]">
                  <kbd className="px-1 py-0.5 bg-white/50 rounded text-[9px]">⌘↵</kbd> accept • <kbd className="px-1 py-0.5 bg-white/50 rounded text-[9px]">⌘⌫</kbd> reject
                </div>
              </div>
            )}
          </div>

          {/* Input Area at Bottom */}
          <div className="p-3 border-t border-[#E8D5A3] bg-[#F5EBB5] relative">
            {/* Input container with border */}
            <div className="bg-white rounded-xl border border-[#D4C47A] shadow-sm focus-within:border-[#8B7355] focus-within:ring-1 focus-within:ring-[#8B7355]/20 transition-all">
              {/* Inline badges and input container */}
              <div 
                className="flex flex-wrap items-start gap-1.5 px-2.5 pt-2 pb-2 min-h-[44px] cursor-text"
                onClick={() => composerInputRef.current?.focus()}
              >
                {/* Context Chips - inline */}
                {composerContexts.map((ctx) => (
                  <div 
                    key={ctx.id}
                    className={`group inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors cursor-pointer shrink-0 ${
                      allSelected 
                        ? 'bg-[#8B7355] border-[#8B7355] ring-2 ring-[#8B7355]/30' 
                        : 'bg-[#E8DDB5] hover:bg-[#DDD0A0] border-[#D4C47A]/50'
                    }`}
                  >
                    {/* Icon - curly braces style */}
                    <span className={`text-[10px] font-mono font-semibold ${allSelected ? 'text-[#FFF9C4]' : 'text-[#8B7355]'}`}>{`{}`}</span>
                    {/* First 5 chars of selected text */}
                    <span className={`text-xs font-sans font-medium ${allSelected ? 'text-[#FFF9C4]' : 'text-[#5C4D3C]'}`}>
                      {ctx.text.slice(0, 5).replace(/\n/g, ' ')}{ctx.text.length > 5 ? '...' : ''}
                    </span>
                    {/* Line range */}
                    <span className={`text-xs font-sans ${allSelected ? 'text-[#E8D5A3]' : 'text-[#8B7355]'}`}>
                      (line {ctx.startLine === ctx.endLine 
                        ? ctx.startLine 
                        : `${ctx.startLine}-${ctx.endLine}`})
                    </span>
                    {/* Close button - hidden until hover */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setComposerContexts(prev => prev.filter(c => c.id !== ctx.id));
                      }}
                      className="p-0.5 text-[#8B7355] hover:text-[#5C4D3C] hover:bg-[#D4C47A]/50 rounded transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                
                {/* Inline input */}
                <textarea
                  ref={composerInputRef}
                  value={composerInput}
                  onChange={(e) => {
                    setComposerInput(e.target.value);
                    setAllSelected(false); // Reset selection state on input change
                    // Auto-resize textarea
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onClick={() => setAllSelected(false)}
                  onKeyDown={(e) => {
                    // Cmd+A or Ctrl+A → select all including contexts
                    if ((e.metaKey || e.ctrlKey) && e.key === "a" && composerContexts.length > 0) {
                      e.preventDefault();
                      const target = e.target as HTMLTextAreaElement;
                      target.select();
                      setAllSelected(true);
                      return;
                    }
                    
                    // Backspace or Delete when all is selected → clear everything
                    if (allSelected && (e.key === "Backspace" || e.key === "Delete")) {
                      e.preventDefault();
                      setComposerInput("");
                      setComposerContexts([]);
                      setAllSelected(false);
                      // Reset textarea height
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = '20px';
                      return;
                    }
                    
                    // Any other key resets allSelected state
                    if (allSelected && e.key !== "Meta" && e.key !== "Control" && e.key !== "Shift") {
                      setAllSelected(false);
                    }
                    
                    // Cmd+Enter or Ctrl+Enter → new line
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      const target = e.target as HTMLTextAreaElement;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const newValue = composerInput.substring(0, start) + "\n" + composerInput.substring(end);
                      setComposerInput(newValue);
                      // Set cursor position after the newline and resize
                      setTimeout(() => {
                        target.selectionStart = target.selectionEnd = start + 1;
                        target.style.height = 'auto';
                        target.style.height = `${target.scrollHeight}px`;
                      }, 0);
                      return;
                    }
                    // Enter alone → submit
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleComposerSubmit();
                    }
                  }}
                  placeholder={composerContexts.length > 0 ? "" : "Ask anything..."}
                  rows={1}
                  className="flex-1 min-w-[100px] text-sm bg-transparent text-[#2D2A1F] placeholder:text-[#A89968] outline-none font-sans resize-none leading-5"
                  disabled={isLoadingComposer}
                  style={{ height: '20px', minHeight: '20px', maxHeight: '200px', overflow: 'auto' }}
                />
              </div>
              
              {/* Bottom toolbar row */}
              <div className="flex items-center justify-between px-2 py-1 border-t border-[#E8D5A3]/50">
                {/* Left side controls */}
                <div className="flex items-center gap-1.5 relative">
                  {/* Mode selector dropdown button with dropdown */}
                  <div className="relative">
                    <button 
                      ref={modeButtonRef}
                      onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-[#5C4D3C] bg-[#E8DDB5] hover:bg-[#DDD0A0] rounded-md transition-colors cursor-pointer border border-[#D4C47A]/50"
                    >
                      <span className="text-[#8B7355] font-semibold text-sm">
                        {composerMode === "agent" ? "∞" : composerMode === "plan" ? "☰" : composerMode === "debug" ? "⚙" : "💬"}
                      </span>
                      <span>{composerMode === "agent" ? "Agent" : composerMode === "plan" ? "Plan" : composerMode === "debug" ? "Debug" : "Ask"}</span>
                      <ChevronDown className="w-3 h-3 text-[#8B7355]" />
                    </button>
                    
                    {/* Mode dropdown - positioned above button */}
                    {modeDropdownOpen && (
                      <div 
                        ref={modeDropdownRef}
                        className="absolute bottom-full left-0 mb-1 w-[180px] bg-white rounded-lg shadow-xl border border-[#E8D5A3] overflow-visible z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
                      >
                        <div className="py-0.5">
                          {[
                            { id: "agent", icon: "∞", name: "Agent", shortcut: "⌃⌥⌘I", canEdit: true, desc: "Autonomous AI that can edit your notes, fix grammar, and make changes" },
                            { id: "plan", icon: "☰", name: "Plan", canEdit: true, desc: "Create detailed plans for accomplishing tasks" },
                            { id: "debug", icon: "⚙", name: "Debug", canEdit: false, desc: "Analyze and fix issues in your content" },
                            { id: "chat", icon: null, name: "Ask", canEdit: false, desc: "Ask questions without modifying your notes" },
                          ].map((mode) => (
                            <div key={mode.id} className="relative group">
                              <button
                                onClick={() => {
                                  setComposerMode(mode.id as "agent" | "plan" | "debug" | "chat");
                                  setModeDropdownOpen(false);
                                }}
                                className="w-full flex items-center justify-between px-2.5 py-1 text-left transition-colors hover:bg-[#F5EBB5] cursor-pointer"
                              >
                                <div className="flex items-center gap-1">
                                  {mode.icon ? (
                                    <span className="text-[#6B6349] text-[11px] w-3 text-center">{mode.icon}</span>
                                  ) : (
                                    <MessageSquare className="w-3 h-3 text-[#6B6349]" />
                                  )}
                                  <span className="text-xs text-[#2D2A1F]">{mode.name}</span>
                                  {mode.shortcut && <span className="text-[9px] text-[#A89968]">{mode.shortcut}</span>}
                                </div>
                                <div className="flex items-center gap-0.5">
                                  {mode.canEdit && composerMode === mode.id && <Pencil className="w-2.5 h-2.5 text-[#8B7355]" />}
                                  {composerMode === mode.id && <Check className="w-3 h-3 text-[#8B7355]" />}
                                </div>
                              </button>
                              {/* Hover tooltip - left side */}
                              <div className="absolute right-full top-0 mr-2 w-[180px] p-2.5 bg-white rounded-lg shadow-xl border border-[#E8D5A3] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none">
                                <p className="text-[11px] text-[#6B6349] leading-relaxed">{mode.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Model selector */}
                  <div className="relative">
                    <button 
                      ref={modelButtonRef}
                      onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                      className="inline-flex items-center gap-0.5 px-1.5 text-xs text-[#8B7355] hover:text-[#5C4D3C] transition-colors cursor-pointer leading-none"
                    >
                      <span className="translate-y-[-1px]">{autoMode ? "Auto" : selectedModel === "opus-4.5" ? "Opus 4.5" : selectedModel === "sonnet-4.5" ? "Sonnet 4.5" : selectedModel === "gpt-5.2" ? "GPT-5.2" : selectedModel === "gemini-3-flash" ? "Gemini 3 Flash" : "Opus 4.5"}</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    
                    {/* Model dropdown */}
                    {modelDropdownOpen && (
                      <div 
                        ref={modelDropdownRef}
                        className="absolute bottom-full left-0 mb-1 w-[180px] bg-white rounded-lg shadow-xl border border-[#E8D5A3] overflow-visible z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
                      >
                        {/* Auto toggle with description */}
                        <div className="relative group">
                          <div className="px-2.5 py-1 flex items-center justify-between border-b border-[#E8D5A3]/50">
                            <span className="text-xs text-[#2D2A1F]">Auto</span>
                            <button
                              onClick={() => setAutoMode(!autoMode)}
                              className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${autoMode ? 'bg-[#8B7355]' : 'bg-[#D4C47A]/50'}`}
                            >
                              <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${autoMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                          </div>
                          {/* Hover tooltip for Auto */}
                          <div className="absolute right-full top-0 mr-2 w-[160px] p-2.5 bg-white rounded-lg shadow-xl border border-[#E8D5A3] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none">
                            <p className="text-[11px] text-[#6B6349] leading-relaxed">Balanced quality and speed, recommended for most tasks</p>
                          </div>
                        </div>
                        
                        {/* Model options - hidden when Auto is enabled */}
                        {!autoMode && (
                          <div className="py-0.5">
                            {[
                              { id: "opus-4.5", name: "Opus 4.5", desc: "Most capable model for complex reasoning and writing tasks" },
                              { id: "sonnet-4.5", name: "Sonnet 4.5", desc: "Balanced performance for everyday tasks" },
                              { id: "gpt-5.2", name: "GPT-5.2", desc: "OpenAI's latest and most advanced model" },
                              { id: "gemini-3-flash", name: "Gemini 3 Flash", desc: "Fast responses with good quality" },
                            ].map((model) => (
                              <div key={model.id} className="relative group">
                                <button
                                  onClick={() => {
                                    setSelectedModel(model.id);
                                    setModelDropdownOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-2.5 py-1 text-left transition-colors hover:bg-[#F5EBB5] cursor-pointer"
                                >
                                  <span className="text-xs text-[#2D2A1F]">{model.name}</span>
                                  {selectedModel === model.id && (
                                    <Check className="w-3.5 h-3.5 text-[#8B7355]" />
                                  )}
                                </button>
                                {/* Hover tooltip - left side */}
                                <div className="absolute right-full top-0 mr-2 w-[160px] p-2.5 bg-white rounded-lg shadow-xl border border-[#E8D5A3] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none">
                                  <p className="text-[11px] text-[#6B6349] leading-relaxed">{model.desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Speed indicator */}
                  <span className="text-xs text-[#A89968]">1x</span>
                </div>
                
                {/* Right side icons */}
                <div className="flex items-center gap-0">
                  <button className="p-1 text-[#8B7355] hover:text-[#2D2A1F] hover:bg-[#F5EBB5] rounded transition-colors cursor-pointer">
                    <AtSign className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1 text-[#8B7355] hover:text-[#2D2A1F] hover:bg-[#F5EBB5] rounded transition-colors cursor-pointer">
                    <Globe className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1 text-[#8B7355] hover:text-[#2D2A1F] hover:bg-[#F5EBB5] rounded transition-colors cursor-pointer">
                    <Image className="w-3.5 h-3.5" />
                  </button>
                  
                  {/* Send button - circular */}
                  <button 
                    type="button"
                    onClick={handleComposerSubmit}
                    disabled={isLoadingComposer || !composerInput.trim()}
                    className="ml-1 p-1 rounded-full bg-[#8B7355] hover:bg-[#7A6448] text-[#FFF9C4] disabled:opacity-30 disabled:hover:bg-[#8B7355] transition-all cursor-pointer shadow-sm disabled:shadow-none"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
            
          </div>
        </SheetContent>
      </Sheet>

      {/* Centered notepad */}
      <main className={`w-full max-w-4xl min-h-screen bg-notepad notepad-lines shadow-xl relative transition-all duration-300 ${composerOpen ? "mr-[400px]" : ""}`}>
        {/* Editor container with ghost text overlay */}
        <div className="relative w-full min-h-screen">
          {/* Selection highlight layer - show when quick edit is open with selection */}
          {quickEditMode && quickEditSelection && quickEditSelection.start !== quickEditSelection.end && (
            <div
              className="absolute inset-0 p-8 pt-10 pointer-events-none font-[var(--font-handwriting)] text-xl leading-8 whitespace-pre-wrap break-words overflow-hidden z-5"
              style={{ lineHeight: "32px" }}
              aria-hidden="true"
            >
              <span className="invisible">{content.substring(0, quickEditSelection.start)}</span>
              <span className="bg-yellow-300/50 text-transparent">{content.substring(quickEditSelection.start, quickEditSelection.end)}</span>
              <span className="invisible">{content.substring(quickEditSelection.end)}</span>
            </div>
          )}

          {/* Ghost text layer - only show when cursor is at end */}
          {isCursorAtEnd() && ghostText && (
            <div
              className="absolute inset-0 p-8 pt-10 pointer-events-none font-[var(--font-handwriting)] text-xl leading-8 whitespace-pre-wrap break-words overflow-hidden"
              style={{ lineHeight: "32px" }}
              aria-hidden="true"
            >
              <span className="invisible">{content}</span>
              <span className="text-muted-foreground/40">{ghostText}</span>
            </div>
          )}

          {/* Main textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onClick={handleSelect}
            placeholder=""
            spellCheck={false}
            disabled={showDiffPreview}
            className="relative z-10 w-full min-h-screen p-8 pt-10 bg-transparent resize-none outline-none hide-scrollbar font-[var(--font-handwriting)] text-xl leading-8 text-foreground placeholder:text-muted-foreground/50 disabled:opacity-50"
            style={{
              lineHeight: "32px",
              caretColor: "#8B7355",
            }}
          />
        </div>

        {/* Keyboard shortcuts hint */}
        {!showDiffPreview && !quickEditMode && !composerOpen && (
          <div className="fixed bottom-12 right-6 text-sm text-muted-foreground/70 font-sans flex flex-col items-end gap-2.5">
            <div className="flex items-center gap-3">
              <span>autocomplete</span>
              <kbd className="px-2.5 py-1 bg-white/80 border border-border/60 rounded-md shadow-sm text-xs font-medium">Tab</kbd>
            </div>
            <div className="flex items-center gap-3">
              <span>quick edit</span>
              <div className="flex gap-1">
                <kbd className="px-2.5 py-1 bg-white/80 border border-border/60 rounded-md shadow-sm text-xs font-medium">Cmd</kbd>
                <kbd className="px-2.5 py-1 bg-white/80 border border-border/60 rounded-md shadow-sm text-xs font-medium">K</kbd>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span>composer</span>
              <div className="flex gap-1">
                <kbd className="px-2.5 py-1 bg-white/80 border border-border/60 rounded-md shadow-sm text-xs font-medium">Cmd</kbd>
                <kbd className="px-2.5 py-1 bg-white/80 border border-border/60 rounded-md shadow-sm text-xs font-medium">I</kbd>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 py-2 bg-white border-t border-gray-200 text-center text-xs text-gray-500 font-sans z-40">
        Built by{" "}
        <a
          href="https://github.com/onurkanbakirci"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-900 font-medium hover:underline cursor-pointer"
        >
          onurkanbakirci
        </a>
      </footer>
    </div>
  );
}
