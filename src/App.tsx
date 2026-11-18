import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Menu,
  Mic,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { AccessibilityModal } from './components/AccessibilityModal';
import { BackupModal } from './components/BackupModal';
import { GuideView } from './components/GuideView';
import { LogoMark } from './components/LogoMark';
import { MemoryManager } from './components/MemoryManager';
import { MessageContent } from './components/MessageContent';
import { OfflineIndicator } from './components/OfflineIndicator';
import { Sidebar } from './components/Sidebar';
import { VoiceStage } from './components/VoiceStage';
import { useLiveVoice } from './hooks/useLiveVoice';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { auth, googleProvider } from './lib/firebase';
import { generateOfflineReply } from './lib/localFallback';
import {
  clearCloudChatMessages,
  createCloudChat,
  createCloudMemory,
  createCloudMessage,
  createDefaultProfile,
  deleteCloudChat,
  deleteCloudMemory,
  fetchCloudChats,
  fetchCloudMemories,
  fetchCloudMessages,
  fetchOrCreateCloudProfile,
  loadLocalState,
  sanitizeId,
  saveLocalState,
  updateCloudChatMeta,
  updateCloudMemory,
  updateCloudProfile,
} from './lib/memoryStore';
import {
  type ChatMessage,
  type ChatSession,
  type MemoryCategory,
  PERSONA_PRESETS,
  type UserMemory,
  type UserProfile,
  type VoiceName,
} from './types/chat';

type WorkspaceTab = 'chat' | 'voice' | 'memory' | 'guide';

const QUICK_PROMPTS = [
  'Remember my favorite programming language is TypeScript',
  'Summarize what you remember about me',
  'Explain how tokens and context windows work',
  'Help me plan a 20-minute study session',
];

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const isOnline = useOnlineStatus();

  const [authReady, setAuthReady] = useState(false);
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chat');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showSystemControls, setShowSystemControls] = useState(false);
  const [showA11yModal, setShowA11yModal] = useState(false);
  const [backupModalMode, setBackupModalMode] = useState<'export' | 'import' | null>(null);

  const [profile, setProfile] = useState<UserProfile>(() => createDefaultProfile('guest'));
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('chat_initial');
  const [messagesByChat, setMessagesByChat] = useState<Record<string, ChatMessage[]>>({});

  const [composerText, setComposerText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingReply, setStreamingReply] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [undoBackup, setUndoBackup] = useState<{ chatId: string; messages: ChatMessage[] } | null>(null);

  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const scopeKey = fbUser ? fbUser.uid : 'guest';
  const isCloudUser = Boolean(fbUser && fbUser.emailVerified);

  // Apply Light / Dark / High-Contrast theme classes on <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'high-contrast');
    if (profile.theme === 'dark') {
      root.classList.add('dark');
    } else if (profile.theme === 'high-contrast') {
      root.classList.add('dark', 'high-contrast');
    }
  }, [profile.theme]);

  // Listen to Firebase Auth and load either Cloud Firestore or Guest localStorage
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      if (user && user.emailVerified) {
        try {
          const cloudProfile = await fetchOrCreateCloudProfile(
            user.uid,
            user.email || undefined,
            user.displayName || undefined
          );
          const [cloudMemories, cloudChats] = await Promise.all([
            fetchCloudMemories(user.uid),
            fetchCloudChats(user.uid),
          ]);

          let nextChats = cloudChats;
          if (nextChats.length === 0) {
            const firstChat: ChatSession = {
              id: makeId('chat'),
              userId: sanitizeId(user.uid),
              title: 'New Conversation',
              systemInstruction: cloudProfile.systemInstruction,
              messageCount: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            await createCloudChat(user.uid, firstChat);
            nextChats = [firstChat];
          }

          const firstChatId = nextChats[0].id;
          const firstMsgs = await fetchCloudMessages(user.uid, firstChatId);

          setProfile(cloudProfile);
          setMemories(cloudMemories);
          setChats(nextChats);
          setActiveChatId(firstChatId);
          setMessagesByChat({ [firstChatId]: firstMsgs });
          saveLocalState(user.uid, {
            profile: cloudProfile,
            memories: cloudMemories,
            chats: nextChats,
            messagesByChat: { [firstChatId]: firstMsgs },
          });
        } catch (err) {
          // Fall back to cached local copy if Firestore fails temporarily
          const local = loadLocalState(
            user.uid,
            createDefaultProfile(user.uid, user.email || undefined, user.displayName || undefined)
          );
          setProfile(local.profile);
          setMemories(local.memories);
          const ensuredChats =
            local.chats.length > 0
              ? local.chats
              : [
                  {
                    id: 'chat_1',
                    userId: sanitizeId(user.uid),
                    title: 'New Conversation',
                    systemInstruction: local.profile.systemInstruction,
                    messageCount: 0,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  },
                ];
          setChats(ensuredChats);
          setActiveChatId(ensuredChats[0].id);
          setMessagesByChat(local.messagesByChat);
          setAuthError(err instanceof Error ? err.message : 'Cloud sync unavailable; using local cache.');
        }
      } else {
        const local = loadLocalState('guest', createDefaultProfile('guest'));
        let nextChats = local.chats;
        if (nextChats.length === 0) {
          nextChats = [
            {
              id: 'chat_guest_1',
              userId: 'guest',
              title: 'New Conversation',
              systemInstruction: local.profile.systemInstruction,
              messageCount: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ];
        }
        setProfile(local.profile);
        setMemories(local.memories);
        setChats(nextChats);
        setActiveChatId(nextChats[0].id);
        setMessagesByChat(local.messagesByChat);
      }
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  // Fetch messages from Firestore when switching to a cloud chat not yet loaded
  const handleSelectChat = useCallback(
    async (chatId: string) => {
      setActiveChatId(chatId);
      setUndoBackup(null);
      if (isCloudUser && fbUser && !messagesByChat[chatId]) {
        try {
          const msgs = await fetchCloudMessages(fbUser.uid, chatId);
          setMessagesByChat((prev) => {
            const next = { ...prev, [chatId]: msgs };
            saveLocalState(scopeKey, { messagesByChat: next });
            return next;
          });
        } catch {
          // Keep existing cached state if offline
        }
      }
    },
    [fbUser, isCloudUser, messagesByChat, scopeKey]
  );

  const activeMessages = useMemo(
    () => messagesByChat[activeChatId] || [],
    [activeChatId, messagesByChat]
  );

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) || chats[0],
    [activeChatId, chats]
  );

  const crossChatSummary = useMemo(() => {
    if (!profile.crossChatMemoryEnabled) return '';
    const others = chats.filter((c) => c.id !== activeChatId).slice(0, 4);
    const lines = others
      .map((c) => {
        const msgs = messagesByChat[c.id] || [];
        if (msgs.length === 0) return '';
        const tail = msgs
          .slice(-4)
          .map((m) => `${m.role === 'user' ? 'User' : 'Kora'}: ${m.content.slice(0, 180)}`)
          .join(' | ');
        return `[${c.title}]: ${tail}`;
      })
      .filter(Boolean);
    return lines.join('\n');
  }, [activeChatId, chats, messagesByChat, profile.crossChatMemoryEnabled]);

  // Auto-scroll when messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, streamingReply]);

  const handleUpdateProfile = useCallback(
    (next: UserProfile) => {
      setProfile(next);
      saveLocalState(scopeKey, { profile: next });
      if (isCloudUser && fbUser) {
        void updateCloudProfile(fbUser.uid, next).catch(() => {});
      }
    },
    [fbUser, isCloudUser, scopeKey]
  );

  const handleAddMemory = useCallback(
    async (content: string, category: MemoryCategory, source: 'auto' | 'manual' | 'voice' = 'manual') => {
      const trimmed = content.trim().slice(0, 600);
      if (!trimmed) return;
      const duplicate = memories.some(
        (m) => m.content.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (duplicate) return;

      const now = Date.now();
      const newMem: UserMemory = {
        id: makeId('mem'),
        userId: sanitizeId(scopeKey),
        content: trimmed,
        category,
        source,
        pinned: source === 'manual',
        createdAt: now,
        updatedAt: now,
      };

      setMemories((prev) => {
        const next = [newMem, ...prev];
        saveLocalState(scopeKey, { memories: next });
        return next;
      });

      if (isCloudUser && fbUser) {
        await createCloudMemory(fbUser.uid, newMem).catch(() => {});
      }
    },
    [fbUser, isCloudUser, memories, scopeKey]
  );

  const handleUpdateMemory = useCallback(
    async (id: string, content: string, category: MemoryCategory, pinned: boolean) => {
      setMemories((prev) => {
        const next = prev.map((m) =>
          m.id === id ? { ...m, content, category, pinned, updatedAt: Date.now() } : m
        );
        saveLocalState(scopeKey, { memories: next });
        return next;
      });
      if (isCloudUser && fbUser) {
        await updateCloudMemory(fbUser.uid, id, { content, category, pinned }).catch(() => {});
      }
    },
    [fbUser, isCloudUser, scopeKey]
  );

  const handleTogglePin = useCallback(
    async (mem: UserMemory) => {
      const nextPinned = !mem.pinned;
      setMemories((prev) => {
        const next = prev.map((m) =>
          m.id === mem.id ? { ...m, pinned: nextPinned, updatedAt: Date.now() } : m
        );
        saveLocalState(scopeKey, { memories: next });
        return next;
      });
      if (isCloudUser && fbUser) {
        await updateCloudMemory(fbUser.uid, mem.id, { pinned: nextPinned }).catch(() => {});
      }
    },
    [fbUser, isCloudUser, scopeKey]
  );

  const handleDeleteMemory = useCallback(
    async (id: string) => {
      setMemories((prev) => {
        const next = prev.filter((m) => m.id !== id);
        saveLocalState(scopeKey, { memories: next });
        return next;
      });
      if (isCloudUser && fbUser) {
        await deleteCloudMemory(fbUser.uid, id).catch(() => {});
      }
    },
    [fbUser, isCloudUser, scopeKey]
  );

  const appendMessageToChat = useCallback(
    async (chatId: string, role: 'user' | 'assistant', content: string, mode: 'text' | 'voice') => {
      const msg: ChatMessage = {
        id: makeId('msg'),
        userId: sanitizeId(scopeKey),
        chatId: sanitizeId(chatId),
        role,
        mode,
        content,
        createdAt: Date.now(),
      };

      let updatedTitle = '';
      let nextCount = 0;

      setMessagesByChat((prev) => {
        const current = prev[chatId] || [];
        const nextList = [...current, msg];
        nextCount = nextList.length;
        const nextMap = { ...prev, [chatId]: nextList };
        saveLocalState(scopeKey, { messagesByChat: nextMap });
        return nextMap;
      });

      setChats((prev) => {
        const nextChats = prev.map((c) => {
          if (c.id !== chatId) return c;
          const isDefaultTitle = c.title === 'New Conversation' || c.title.startsWith('Chat ');
          updatedTitle =
            role === 'user' && isDefaultTitle
              ? content.trim().slice(0, 42) + (content.trim().length > 42 ? '...' : '')
              : c.title;
          return {
            ...c,
            title: updatedTitle,
            messageCount: Math.max(c.messageCount + 1, nextCount),
            updatedAt: Date.now(),
          };
        });
        saveLocalState(scopeKey, { chats: nextChats });
        return nextChats;
      });

      if (isCloudUser && fbUser) {
        await createCloudMessage(fbUser.uid, chatId, msg).catch(() => {});
        await updateCloudChatMeta(fbUser.uid, chatId, {
          ...(updatedTitle ? { title: updatedTitle } : {}),
          messageCount: nextCount || 1,
        }).catch(() => {});
      }

      return msg;
    },
    [fbUser, isCloudUser, scopeKey]
  );

  // Speak any assistant message via Gemini TTS (gemini-3.8-flash-lite-tts)
  const stopAudioPlayback = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setSpeakingMessageId(null);
  }, []);

  const speakMessage = useCallback(
    async (msgId: string, text: string) => {
      if (speakingMessageId === msgId) {
        stopAudioPlayback();
        return;
      }
      stopAudioPlayback();
      if (!isOnline) return;
      setSpeakingMessageId(msgId);
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceName: profile.voiceName }),
        });
        const data = (await res.json()) as { audioBase64?: string };
        if (!res.ok || !data.audioBase64) {
          setSpeakingMessageId(null);
          return;
        }
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        audioPlayerRef.current = audio;
        audio.onended = () => {
          setSpeakingMessageId(null);
          audioPlayerRef.current = null;
        };
        audio.onerror = () => {
          setSpeakingMessageId(null);
          audioPlayerRef.current = null;
        };
        await audio.play();
      } catch {
        setSpeakingMessageId(null);
      }
    },
    [isOnline, profile.voiceName, speakingMessageId, stopAudioPlayback]
  );

  // Extract personalized memories after conversation turns
  const runAutoMemoryExtraction = useCallback(
    async (userMsg: string, assistantMsg: string) => {
      if (!isOnline) return;
      try {
        const res = await fetch('/api/memory/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userMessage: userMsg,
            assistantMessage: assistantMsg,
            existingMemories: memories.map((m) => m.content),
            currentPreferredName: profile.preferredName,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          preferredName?: string;
          newMemories?: { content: string; category: MemoryCategory }[];
        };

        if (data.preferredName && data.preferredName !== profile.preferredName) {
          handleUpdateProfile({ ...profile, preferredName: data.preferredName });
        }
        if (Array.isArray(data.newMemories)) {
          for (const item of data.newMemories) {
            if (item.content) {
              await handleAddMemory(item.content, item.category || 'fact', 'auto');
            }
          }
        }
      } catch {
        // Non-blocking background enrichment
      }
    },
    [handleAddMemory, handleUpdateProfile, isOnline, memories, profile]
  );

  // Real-time Live Voice Hook
  const liveVoice = useLiveVoice({
    voiceName: profile.voiceName,
    systemInstruction: activeChat?.systemInstruction || profile.systemInstruction,
    preferredName: profile.preferredName,
    communicationStyle: profile.communicationStyle,
    memories,
    crossChatSummary,
    onTurnFinalized: (userText, assistantText) => {
      void (async () => {
        if (userText) {
          await appendMessageToChat(activeChatId, 'user', userText, 'voice');
        }
        if (assistantText) {
          await appendMessageToChat(activeChatId, 'assistant', assistantText, 'voice');
        }
        if (userText && assistantText) {
          void runAutoMemoryExtraction(userText, assistantText);
        }
      })();
    },
    onMemorySavedByVoice: (content, category) => {
      void handleAddMemory(content, category, 'voice');
    },
  });

  // Global keyboard shortcut Alt+V to toggle live voice
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        if (liveVoice.voiceState === 'idle' || liveVoice.voiceState === 'error') {
          void liveVoice.startSession();
        } else {
          liveVoice.stopSession();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [liveVoice]);

  const handleSendText = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isStreaming) return;

    setChatError(null);
    setUndoBackup(null);
    setComposerText('');
    setIsStreaming(true);
    setStreamingReply('');

    const priorMessages = activeMessages.filter((m) => !m.isError);
    await appendMessageToChat(activeChatId, 'user', trimmed, 'text');

    if (!isOnline) {
      const offlineReply = generateOfflineReply(trimmed, profile.preferredName, memories);
      await appendMessageToChat(activeChatId, 'assistant', offlineReply, 'text');
      setIsStreaming(false);
      return;
    }

    try {
      const historyPayload = [
        ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: trimmed },
      ];

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: historyPayload,
          systemInstruction: activeChat?.systemInstruction || profile.systemInstruction,
          preferredName: profile.preferredName,
          communicationStyle: profile.communicationStyle,
          memories: memories.map((m) => ({
            content: m.content,
            category: m.category,
            pinned: m.pinned,
          })),
          crossChatSummary,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error || `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming response body unavailable.');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith('data:')) continue;
          const payloadStr = line.slice(5).trim();
          if (!payloadStr) continue;
          const parsed = JSON.parse(payloadStr) as { text?: string; error?: string; done?: boolean };
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) {
            accumulated += parsed.text;
            setStreamingReply(accumulated);
          }
        }
      }

      const finalText = accumulated.trim() || 'No response text was generated.';
      const savedReply = await appendMessageToChat(activeChatId, 'assistant', finalText, 'text');
      setStreamingReply('');
      setIsStreaming(false);

      void runAutoMemoryExtraction(trimmed, finalText);
      if (profile.autoReadResponses) {
        void speakMessage(savedReply.id, finalText);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to reach AI service.';
      setChatError(message);
      setStreamingReply('');
      setIsStreaming(false);
    }
  };

  const handleNewChat = async () => {
    const newChat: ChatSession = {
      id: makeId('chat'),
      userId: sanitizeId(scopeKey),
      title: 'New Conversation',
      systemInstruction: profile.systemInstruction,
      messageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setChats((prev) => {
      const next = [newChat, ...prev];
      saveLocalState(scopeKey, { chats: next });
      return next;
    });
    setMessagesByChat((prev) => {
      const next = { ...prev, [newChat.id]: [] };
      saveLocalState(scopeKey, { messagesByChat: next });
      return next;
    });
    setActiveChatId(newChat.id);
    setActiveTab('chat');
    setUndoBackup(null);

    if (isCloudUser && fbUser) {
      await createCloudChat(fbUser.uid, newChat).catch(() => {});
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (chats.length <= 1) return;
    const msgIds = (messagesByChat[chatId] || []).map((m) => m.id);
    const remaining = chats.filter((c) => c.id !== chatId);
    setChats(remaining);
    setMessagesByChat((prev) => {
      const copy = { ...prev };
      delete copy[chatId];
      saveLocalState(scopeKey, { chats: remaining, messagesByChat: copy });
      return copy;
    });
    if (activeChatId === chatId && remaining[0]) {
      setActiveChatId(remaining[0].id);
    }
    if (isCloudUser && fbUser) {
      await deleteCloudChat(fbUser.uid, chatId, msgIds).catch(() => {});
    }
  };

  const handleClearActiveChat = async () => {
    if (activeMessages.length === 0) return;
    const backup = [...activeMessages];
    setUndoBackup({ chatId: activeChatId, messages: backup });
    setMessagesByChat((prev) => {
      const next = { ...prev, [activeChatId]: [] };
      saveLocalState(scopeKey, { messagesByChat: next });
      return next;
    });
    setChats((prev) => {
      const next = prev.map((c) => (c.id === activeChatId ? { ...c, messageCount: 0 } : c));
      saveLocalState(scopeKey, { chats: next });
      return next;
    });
    if (isCloudUser && fbUser) {
      await clearCloudChatMessages(
        fbUser.uid,
        activeChatId,
        backup.map((m) => m.id)
      ).catch(() => {});
    }
  };

  const handleUndoClear = async () => {
    if (!undoBackup) return;
    const { chatId, messages } = undoBackup;
    setUndoBackup(null);
    setMessagesByChat((prev) => {
      const next = { ...prev, [chatId]: messages };
      saveLocalState(scopeKey, { messagesByChat: next });
      return next;
    });
    setChats((prev) => {
      const next = prev.map((c) =>
        c.id === chatId ? { ...c, messageCount: messages.length } : c
      );
      saveLocalState(scopeKey, { chats: next });
      return next;
    });
    if (isCloudUser && fbUser) {
      for (const m of messages) {
        await createCloudMessage(fbUser.uid, chatId, m).catch(() => {});
      }
      await updateCloudChatMeta(fbUser.uid, chatId, { messageCount: messages.length }).catch(() => {});
    }
  };

  const handleSignInGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    }
  };

  const handleSignOut = async () => {
    liveVoice.stopSession();
    stopAudioPlayback();
    await signOut(auth);
  };

  const exportJsonString = useMemo(() => {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        app: 'Kora AI',
        profile,
        memories,
        chats,
        messagesByChat,
      },
      null,
      2
    );
  }, [chats, memories, messagesByChat, profile]);

  const handleRestoreBackup = async (rawJson: string) => {
    const parsed = JSON.parse(rawJson) as {
      profile?: Partial<UserProfile>;
      memories?: UserMemory[];
      chats?: ChatSession[];
      messagesByChat?: Record<string, ChatMessage[]>;
    };
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON structure.');
    }
    if (parsed.profile) {
      const merged = { ...profile, ...parsed.profile, userId: profile.userId };
      handleUpdateProfile(merged);
    }
    if (Array.isArray(parsed.memories)) {
      for (const mem of parsed.memories) {
        if (mem.content) {
          await handleAddMemory(mem.content, mem.category || 'fact', mem.source || 'manual');
        }
      }
    }
    if (Array.isArray(parsed.chats) && parsed.chats.length > 0) {
      const restoredChats = parsed.chats.map((c) => ({
        ...c,
        id: sanitizeId(c.id || makeId('chat')),
        userId: sanitizeId(scopeKey),
      }));
      setChats(restoredChats);
      setActiveChatId(restoredChats[0].id);
      const nextMsgs = parsed.messagesByChat || {};
      setMessagesByChat(nextMsgs);
      saveLocalState(scopeKey, { chats: restoredChats, messagesByChat: nextMsgs });
    }
  };

  const largeText = profile.fontSize === 'large';
  const navItems: { id: WorkspaceTab; label: string }[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'voice', label: 'Voice' },
    { id: 'memory', label: 'Memory' },
    { id: 'guide', label: 'Guide' },
  ];

  return (
    <div className="h-dvh flex flex-col bg-slate-50 dark:bg-slate-950 high-contrast:bg-black text-slate-900 dark:text-slate-100 high-contrast:text-white overflow-hidden">
      {/* Accessible Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-slate-900 focus:text-white focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Top Bar Contract: [Brand] — [Nav Links] — [Primary Action] */}
      <header className="h-14 shrink-0 bg-white dark:bg-slate-900 high-contrast:bg-black border-b border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 px-3 sm:px-6 flex items-center justify-between gap-4 sm:gap-8">
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open conversations menu"
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <a
            href="#main-content"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('chat');
            }}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0"
          >
            <LogoMark className="w-8 h-8 shrink-0" />
            <span className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white high-contrast:text-yellow-300">
              Kora AI
            </span>
          </a>
        </div>

        <nav aria-label="Primary workspace navigation" className="flex items-center gap-3 sm:gap-6 overflow-x-auto">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[44px] px-1.5 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                  active
                    ? 'border-sky-600 text-slate-900 dark:border-sky-400 dark:text-white high-contrast:border-yellow-400 high-contrast:text-yellow-300 font-semibold'
                    : 'border-transparent text-slate-600 dark:text-slate-400 high-contrast:text-white hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {!authReady ? (
            <span className="text-xs text-slate-500 whitespace-nowrap">Loading...</span>
          ) : fbUser ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-yellow-400 text-xs font-semibold text-slate-800 dark:text-slate-100 high-contrast:text-yellow-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Sign Out ({(fbUser.displayName || fbUser.email || 'Account').split(' ')[0]})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignInGoogle()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 high-contrast:bg-yellow-400 high-contrast:text-black text-white dark:text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Sign In with Google
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0">
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          isOpenMobile={mobileSidebarOpen}
          memoriesCount={memories.length}
          preferredName={profile.preferredName}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onSelectChat={(id) => {
            void handleSelectChat(id);
            setActiveTab('chat');
          }}
          onNewChat={() => void handleNewChat()}
          onDeleteChat={(id) => void handleDeleteChat(id)}
          onExportBackup={() => setBackupModalMode('export')}
          onOpenImport={() => setBackupModalMode('import')}
        />

        <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col min-w-0 min-h-0 focus:outline-none">
          {authError && (
            <div
              role="alert"
              className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2"
            >
              <span>{authError}</span>
              <button
                type="button"
                onClick={() => setAuthError(null)}
                className="underline font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Secondary Workspace Toolbar */}
              <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 high-contrast:border-slate-700 bg-white/80 dark:bg-slate-900/80 high-contrast:bg-black flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <h1 className="text-sm font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300 truncate">
                    {activeChat?.title || 'Conversation'}
                  </h1>
                  <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 high-contrast:text-white whitespace-nowrap tabular-nums">
                    {isCloudUser ? 'Cloud Sync' : 'Guest Mode'} · Voice: {profile.voiceName}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowSystemControls((v) => !v)}
                    aria-expanded={showSystemControls}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 high-contrast:border-white text-xs font-medium text-slate-700 dark:text-slate-200 high-contrast:text-white hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Persona</span>
                    {showSystemControls ? (
                      <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowA11yModal(true)}
                    aria-label="Open accessibility and display preferences"
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 high-contrast:border-yellow-400 text-xs font-medium text-slate-700 dark:text-slate-200 high-contrast:text-yellow-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Accessibility</span>
                  </button>

                  {undoBackup ? (
                    <button
                      type="button"
                      onClick={() => void handleUndoClear()}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-xs font-semibold whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Undo Clear</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleClearActiveChat()}
                      disabled={activeMessages.length === 0}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Collapsible System Instruction Panel */}
              {showSystemControls && (
                <div className="px-4 sm:px-6 py-4 bg-slate-100/70 dark:bg-slate-900/90 high-contrast:bg-black border-b border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="system-instruction-input"
                      className="text-xs font-semibold text-slate-700 dark:text-slate-200 high-contrast:text-yellow-300"
                    >
                      System Instruction (Role &amp; Rules)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {PERSONA_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            handleUpdateProfile({ ...profile, systemInstruction: preset.instruction })
                          }
                          className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            profile.systemInstruction === preset.instruction
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-sky-500 dark:text-slate-950 dark:border-sky-500 high-contrast:bg-yellow-400 high-contrast:text-black'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    id="system-instruction-input"
                    rows={2}
                    maxLength={2000}
                    value={profile.systemInstruction}
                    onChange={(e) =>
                      handleUpdateProfile({ ...profile, systemInstruction: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-white bg-white dark:bg-slate-950 high-contrast:bg-black px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 high-contrast:text-white"
                  />
                </div>
              )}

              {/* Live Voice Compact Bar if active inside Chat tab */}
              {liveVoice.voiceState !== 'idle' && (
                <div className="px-4 sm:px-6 pt-3">
                  <VoiceStage
                    compact
                    voiceState={liveVoice.voiceState}
                    isMuted={liveVoice.isMuted}
                    voiceName={profile.voiceName}
                    errorMessage={liveVoice.errorMessage}
                    liveUserTranscript={liveVoice.liveUserTranscript}
                    liveModelTranscript={liveVoice.liveModelTranscript}
                    inputLevel={liveVoice.inputLevel}
                    outputLevel={liveVoice.outputLevel}
                    isOnline={isOnline}
                    onSelectVoice={(v: VoiceName) => handleUpdateProfile({ ...profile, voiceName: v })}
                    onStart={() => void liveVoice.startSession()}
                    onStop={liveVoice.stopSession}
                    onToggleMute={liveVoice.toggleMute}
                    onInterrupt={liveVoice.interruptModel}
                  />
                </div>
              )}

              {/* Messages Feed */}
              <div
                aria-label="Conversation messages"
                aria-live="polite"
                className="flex-1 overflow-y-auto kora-scroll px-4 sm:px-6 py-6"
              >
                <div className="max-w-3xl mx-auto space-y-6">
                  {activeMessages.length === 0 && !streamingReply ? (
                    <div className="py-12 text-center space-y-6">
                      <div className="inline-flex items-center justify-center">
                        <LogoMark className="w-14 h-14" />
                      </div>
                      <div className="space-y-2 max-w-lg mx-auto">
                        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300">
                          {profile.preferredName
                            ? `Welcome back, ${profile.preferredName}`
                            : 'How can Kora help today?'}
                        </h2>
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 high-contrast:text-white leading-relaxed">
                          Ask a question by text, launch a real-time voice conversation, or store preferences in your personalized memory.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto text-left">
                        {QUICK_PROMPTS.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => void handleSendText(prompt)}
                            className="min-h-[48px] px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 bg-white dark:bg-slate-900 high-contrast:bg-black text-sm text-slate-800 dark:text-slate-200 high-contrast:text-white hover:border-sky-400 dark:hover:border-sky-500 transition-colors"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    activeMessages.map((msg) => {
                      const isUser = msg.role === 'user';
                      return (
                        <article
                          key={msg.id}
                          className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400 high-contrast:text-yellow-300 tabular-nums">
                            <span className="font-semibold">
                              {isUser ? profile.preferredName || 'You' : 'Kora'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{msg.mode === 'voice' ? 'Voice' : 'Text'}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          <div
                            className={`max-w-[92%] sm:max-w-[82%] rounded-2xl px-4 py-3 ${
                              isUser
                                ? 'bg-slate-900 text-white dark:bg-sky-600 dark:text-white high-contrast:bg-yellow-400 high-contrast:text-black rounded-br-sm'
                                : 'bg-white dark:bg-slate-900 high-contrast:bg-black text-slate-900 dark:text-slate-100 high-contrast:text-white border border-slate-200 dark:border-slate-800 high-contrast:border-white rounded-bl-sm'
                            }`}
                          >
                            <MessageContent
                              content={msg.content}
                              role={msg.role}
                              largeText={largeText}
                              isSpeakingThis={speakingMessageId === msg.id}
                              onToggleSpeak={
                                msg.role === 'assistant'
                                  ? () => void speakMessage(msg.id, msg.content)
                                  : undefined
                              }
                            />
                          </div>
                        </article>
                      );
                    })
                  )}

                  {streamingReply && (
                    <article className="flex flex-col items-start">
                      <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold">Kora</span>
                        <span aria-hidden="true">·</span>
                        <span>Responding...</span>
                      </div>
                      <div className="max-w-[92%] sm:max-w-[82%] rounded-2xl rounded-bl-sm px-4 py-3 bg-white dark:bg-slate-900 high-contrast:bg-black text-slate-900 dark:text-slate-100 high-contrast:text-white border border-slate-200 dark:border-slate-800 high-contrast:border-white">
                        <MessageContent
                          content={streamingReply}
                          role="assistant"
                          largeText={largeText}
                          isSpeakingThis={false}
                        />
                      </div>
                    </article>
                  )}

                  {isStreaming && !streamingReply && (
                    <div role="status" aria-live="polite" className="text-sm text-slate-500 dark:text-slate-400">
                      Kora is thinking...
                    </div>
                  )}

                  {chatError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 high-contrast:bg-black high-contrast:border-yellow-400 px-4 py-3 text-sm text-rose-800 dark:text-rose-200 high-contrast:text-yellow-300"
                    >
                      {chatError}
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Bottom Message Composer */}
              <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 bg-white dark:bg-slate-900 high-contrast:bg-black px-3 sm:px-6 py-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendText(composerText);
                  }}
                  className="max-w-3xl mx-auto flex items-end gap-2"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (liveVoice.voiceState === 'idle' || liveVoice.voiceState === 'error') {
                        void liveVoice.startSession();
                      } else {
                        liveVoice.stopSession();
                      }
                    }}
                    aria-label={
                      liveVoice.voiceState === 'idle' || liveVoice.voiceState === 'error'
                        ? 'Start real-time voice conversation (Alt+V)'
                        : 'End real-time voice conversation (Alt+V)'
                    }
                    aria-pressed={liveVoice.voiceState !== 'idle' && liveVoice.voiceState !== 'error'}
                    className={`min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl border transition-colors shrink-0 ${
                      liveVoice.voiceState !== 'idle' && liveVoice.voiceState !== 'error'
                        ? 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700'
                        : 'border-slate-300 dark:border-slate-700 high-contrast:border-yellow-400 bg-slate-50 dark:bg-slate-800 high-contrast:bg-black text-slate-700 dark:text-slate-200 high-contrast:text-yellow-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Mic className="w-5 h-5" aria-hidden="true" />
                  </button>

                  <label htmlFor="chat-composer" className="sr-only">
                    Message Kora AI
                  </label>
                  <textarea
                    id="chat-composer"
                    ref={composerRef}
                    rows={1}
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendText(composerText);
                      }
                    }}
                    placeholder={isOnline ? 'Message Kora AI...' : 'Message Kora AI (Offline mode)...'}
                    className={`flex-1 min-h-[48px] max-h-36 rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-white bg-slate-50 dark:bg-slate-950 high-contrast:bg-black px-4 py-3 ${
                      largeText ? 'text-lg' : 'text-base'
                    } text-slate-900 dark:text-slate-100 high-contrast:text-white resize-none`}
                  />

                  <button
                    type="submit"
                    disabled={isStreaming || !composerText.trim()}
                    aria-label="Send message"
                    className="min-h-[48px] min-w-[48px] sm:px-5 flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 high-contrast:bg-yellow-400 high-contrast:text-black text-white dark:text-slate-950 text-sm font-semibold transition-colors disabled:opacity-40 shrink-0"
                  >
                    <Send className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'voice' && (
            <div className="flex-1 overflow-y-auto kora-scroll px-4 sm:px-8 py-6">
              <div className="max-w-3xl mx-auto space-y-6">
                <VoiceStage
                  voiceState={liveVoice.voiceState}
                  isMuted={liveVoice.isMuted}
                  voiceName={profile.voiceName}
                  errorMessage={liveVoice.errorMessage}
                  liveUserTranscript={liveVoice.liveUserTranscript}
                  liveModelTranscript={liveVoice.liveModelTranscript}
                  inputLevel={liveVoice.inputLevel}
                  outputLevel={liveVoice.outputLevel}
                  isOnline={isOnline}
                  onSelectVoice={(v: VoiceName) => handleUpdateProfile({ ...profile, voiceName: v })}
                  onStart={() => void liveVoice.startSession()}
                  onStop={liveVoice.stopSession}
                  onToggleMute={liveVoice.toggleMute}
                  onInterrupt={liveVoice.interruptModel}
                />

                {activeMessages.filter((m) => m.mode === 'voice').length > 0 && (
                  <section
                    aria-label="Recent voice transcript log"
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 high-contrast:border-white bg-white dark:bg-slate-900 high-contrast:bg-black p-6 space-y-4"
                  >
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300">
                      Voice Transcript Log
                    </h3>
                    <div className="space-y-3">
                      {activeMessages
                        .filter((m) => m.mode === 'voice')
                        .slice(-10)
                        .map((m) => (
                          <div key={m.id} className="text-sm leading-relaxed">
                            <span className="font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300">
                              {m.role === 'user' ? profile.preferredName || 'You' : 'Kora'}:{' '}
                            </span>
                            <span className="text-slate-700 dark:text-slate-300 high-contrast:text-white">
                              {m.content}
                            </span>
                          </div>
                        ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="flex-1 overflow-y-auto kora-scroll px-4 sm:px-8 py-6">
              <div className="max-w-4xl mx-auto">
                <MemoryManager
                  profile={profile}
                  memories={memories}
                  isCloudSynced={isCloudUser}
                  onUpdateProfile={handleUpdateProfile}
                  onAddMemory={(c, cat) => handleAddMemory(c, cat, 'manual')}
                  onUpdateMemory={handleUpdateMemory}
                  onTogglePin={handleTogglePin}
                  onDeleteMemory={handleDeleteMemory}
                />
              </div>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="flex-1 overflow-y-auto kora-scroll px-4 sm:px-8 py-6">
              <div className="max-w-5xl mx-auto">
                <GuideView
                  onExportBackup={() => setBackupModalMode('export')}
                  onOpenImport={() => setBackupModalMode('import')}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      <OfflineIndicator />

      <AccessibilityModal
        isOpen={showA11yModal}
        profile={profile}
        onClose={() => setShowA11yModal(false)}
        onUpdateProfile={handleUpdateProfile}
      />

      <BackupModal
        mode={backupModalMode}
        initialJson={backupModalMode === 'export' ? exportJsonString : ''}
        onClose={() => setBackupModalMode(null)}
        onRestoreJson={handleRestoreBackup}
      />
    </div>
  );
}
