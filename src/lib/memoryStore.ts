import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  type ChatMessage,
  type ChatSession,
  type CommunicationStyle,
  type FontSizeMode,
  type MemoryCategory,
  type MemorySource,
  PERSONA_PRESETS,
  type ThemeMode,
  type UserMemory,
  type UserProfile,
  type VoiceName,
} from '../types/chat';

const LOCAL_PREFIX = 'kora_ai_v1';

const VALID_STYLES = new Set<CommunicationStyle>(['balanced', 'concise', 'detailed', 'step-by-step']);
const VALID_VOICES = new Set<VoiceName>(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);
const VALID_THEMES = new Set<ThemeMode>(['light', 'dark', 'high-contrast']);
const VALID_FONT_SIZES = new Set<FontSizeMode>(['normal', 'large']);
const VALID_CATEGORIES = new Set<MemoryCategory>(['preference', 'fact', 'goal', 'context']);
const VALID_SOURCES = new Set<MemorySource>(['auto', 'manual', 'voice']);

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

export function createDefaultProfile(userId: string, email?: string, displayName?: string): UserProfile {
  return {
    userId: sanitizeId(userId),
    email: email?.slice(0, 254),
    displayName: displayName?.slice(0, 120),
    preferredName: displayName ? displayName.split(' ')[0].slice(0, 80) : '',
    communicationStyle: 'balanced',
    voiceName: 'Zephyr',
    systemInstruction: PERSONA_PRESETS[0].instruction,
    crossChatMemoryEnabled: true,
    theme: 'light',
    fontSize: 'normal',
    autoReadResponses: false,
  };
}

function sanitizeProfile(profile: UserProfile): UserProfile {
  return {
    userId: sanitizeId(profile.userId),
    ...(profile.email ? { email: profile.email.slice(0, 254) } : {}),
    ...(profile.displayName ? { displayName: profile.displayName.slice(0, 120) } : {}),
    preferredName: (profile.preferredName || '').slice(0, 80),
    communicationStyle: VALID_STYLES.has(profile.communicationStyle) ? profile.communicationStyle : 'balanced',
    voiceName: VALID_VOICES.has(profile.voiceName) ? profile.voiceName : 'Zephyr',
    systemInstruction: (profile.systemInstruction || '').slice(0, 2000),
    crossChatMemoryEnabled: Boolean(profile.crossChatMemoryEnabled),
    theme: VALID_THEMES.has(profile.theme) ? profile.theme : 'light',
    fontSize: VALID_FONT_SIZES.has(profile.fontSize) ? profile.fontSize : 'normal',
    autoReadResponses: Boolean(profile.autoReadResponses),
  };
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

function getLocalKeys(scopeKey: string) {
  return {
    profile: `${LOCAL_PREFIX}__${scopeKey}__profile`,
    memories: `${LOCAL_PREFIX}__${scopeKey}__memories`,
    chats: `${LOCAL_PREFIX}__${scopeKey}__chats`,
    messages: `${LOCAL_PREFIX}__${scopeKey}__messages`,
  };
}

export function loadLocalState(scopeKey: string, defaultProfile: UserProfile): {
  profile: UserProfile;
  memories: UserMemory[];
  chats: ChatSession[];
  messagesByChat: Record<string, ChatMessage[]>;
} {
  const keys = getLocalKeys(scopeKey);
  let profile = defaultProfile;
  let memories: UserMemory[] = [];
  let chats: ChatSession[] = [];
  let messagesByChat: Record<string, ChatMessage[]> = {};

  try {
    const rawProfile = localStorage.getItem(keys.profile);
    if (rawProfile) {
      profile = sanitizeProfile({ ...defaultProfile, ...JSON.parse(rawProfile), userId: defaultProfile.userId });
    }
    const rawMem = localStorage.getItem(keys.memories);
    if (rawMem) {
      const parsed = JSON.parse(rawMem);
      if (Array.isArray(parsed)) memories = parsed;
    }
    const rawChats = localStorage.getItem(keys.chats);
    if (rawChats) {
      const parsed = JSON.parse(rawChats);
      if (Array.isArray(parsed)) chats = parsed;
    }
    const rawMsgs = localStorage.getItem(keys.messages);
    if (rawMsgs) {
      const parsed = JSON.parse(rawMsgs);
      if (parsed && typeof parsed === 'object') messagesByChat = parsed;
    }
  } catch {
    // Fallback cleanly if storage is unavailable
  }

  return { profile, memories, chats, messagesByChat };
}

export function saveLocalState(
  scopeKey: string,
  state: {
    profile?: UserProfile;
    memories?: UserMemory[];
    chats?: ChatSession[];
    messagesByChat?: Record<string, ChatMessage[]>;
  }
) {
  const keys = getLocalKeys(scopeKey);
  try {
    if (state.profile) localStorage.setItem(keys.profile, JSON.stringify(state.profile));
    if (state.memories) localStorage.setItem(keys.memories, JSON.stringify(state.memories));
    if (state.chats) localStorage.setItem(keys.chats, JSON.stringify(state.chats));
    if (state.messagesByChat) localStorage.setItem(keys.messages, JSON.stringify(state.messagesByChat));
  } catch {
    // Ignore storage quota errors
  }
}

// Cloud Firestore Operations (strictly validated against firebase-blueprint.json & firestore.rules)
export async function fetchOrCreateCloudProfile(
  uid: string,
  email?: string,
  displayName?: string
): Promise<UserProfile> {
  const safeUid = sanitizeId(uid);
  const userRef = doc(db, 'users', safeUid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      return sanitizeProfile({
        userId: safeUid,
        email: typeof data.email === 'string' ? data.email : email,
        displayName: typeof data.displayName === 'string' ? data.displayName : displayName,
        preferredName: typeof data.preferredName === 'string' ? data.preferredName : '',
        communicationStyle: data.communicationStyle as CommunicationStyle,
        voiceName: data.voiceName as VoiceName,
        systemInstruction: typeof data.systemInstruction === 'string' ? data.systemInstruction : PERSONA_PRESETS[0].instruction,
        crossChatMemoryEnabled: Boolean(data.crossChatMemoryEnabled),
        theme: data.theme as ThemeMode,
        fontSize: data.fontSize as FontSizeMode,
        autoReadResponses: Boolean(data.autoReadResponses),
      });
    }

    const fresh = sanitizeProfile(createDefaultProfile(safeUid, email, displayName));
    await setDoc(userRef, {
      ...fresh,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return fresh;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${safeUid}`);
  }
}

export async function updateCloudProfile(uid: string, profile: UserProfile): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safe = sanitizeProfile({ ...profile, userId: safeUid });
  const userRef = doc(db, 'users', safeUid);
  try {
    await updateDoc(userRef, {
      ...(safe.email ? { email: safe.email } : {}),
      ...(safe.displayName ? { displayName: safe.displayName } : {}),
      preferredName: safe.preferredName,
      communicationStyle: safe.communicationStyle,
      voiceName: safe.voiceName,
      systemInstruction: safe.systemInstruction,
      crossChatMemoryEnabled: safe.crossChatMemoryEnabled,
      theme: safe.theme,
      fontSize: safe.fontSize,
      autoReadResponses: safe.autoReadResponses,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${safeUid}`);
  }
}

export async function fetchCloudMemories(uid: string): Promise<UserMemory[]> {
  const safeUid = sanitizeId(uid);
  const path = `users/${safeUid}/memories`;
  try {
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: safeUid,
        content: String(data.content || ''),
        category: VALID_CATEGORIES.has(data.category) ? data.category : 'fact',
        source: VALID_SOURCES.has(data.source) ? data.source : 'manual',
        pinned: Boolean(data.pinned),
        createdAt: toMillis(data.createdAt),
        updatedAt: toMillis(data.updatedAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createCloudMemory(
  uid: string,
  memory: Omit<UserMemory, 'createdAt' | 'updatedAt'>
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(memory.id);
  const path = `users/${safeUid}/memories/${safeId}`;
  try {
    await setDoc(doc(db, path), {
      userId: safeUid,
      content: memory.content.trim().slice(0, 600),
      category: VALID_CATEGORIES.has(memory.category) ? memory.category : 'fact',
      source: VALID_SOURCES.has(memory.source) ? memory.source : 'manual',
      pinned: Boolean(memory.pinned),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateCloudMemory(
  uid: string,
  memoryId: string,
  updates: { content?: string; category?: MemoryCategory; pinned: boolean }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(memoryId);
  const path = `users/${safeUid}/memories/${safeId}`;
  try {
    if (typeof updates.content === 'string' && updates.category) {
      await updateDoc(doc(db, path), {
        content: updates.content.trim().slice(0, 600),
        category: VALID_CATEGORIES.has(updates.category) ? updates.category : 'fact',
        pinned: Boolean(updates.pinned),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, path), {
        pinned: Boolean(updates.pinned),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteCloudMemory(uid: string, memoryId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(memoryId);
  const path = `users/${safeUid}/memories/${safeId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchCloudChats(uid: string): Promise<ChatSession[]> {
  const safeUid = sanitizeId(uid);
  const path = `users/${safeUid}/chats`;
  try {
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: safeUid,
        title: String(data.title || 'New Chat'),
        systemInstruction: String(data.systemInstruction || PERSONA_PRESETS[0].instruction),
        messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
        createdAt: toMillis(data.createdAt),
        updatedAt: toMillis(data.updatedAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createCloudChat(uid: string, chat: Omit<ChatSession, 'createdAt' | 'updatedAt'>): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chat.id);
  const path = `users/${safeUid}/chats/${safeChatId}`;
  try {
    await setDoc(doc(db, path), {
      userId: safeUid,
      title: (chat.title || 'New Chat').trim().slice(0, 120),
      systemInstruction: (chat.systemInstruction || '').slice(0, 2000),
      messageCount: Math.max(0, Math.min(5000, Math.floor(chat.messageCount || 0))),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateCloudChatMeta(
  uid: string,
  chatId: string,
  updates: { title?: string; messageCount?: number; systemInstruction?: string }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chatId);
  const path = `users/${safeUid}/chats/${safeChatId}`;
  try {
    if (typeof updates.title === 'string' && typeof updates.messageCount === 'number') {
      await updateDoc(doc(db, path), {
        title: updates.title.trim().slice(0, 120) || 'New Chat',
        messageCount: Math.max(0, Math.min(5000, Math.floor(updates.messageCount))),
        updatedAt: serverTimestamp(),
      });
    } else if (typeof updates.messageCount === 'number') {
      await updateDoc(doc(db, path), {
        messageCount: Math.max(0, Math.min(5000, Math.floor(updates.messageCount))),
        updatedAt: serverTimestamp(),
      });
    } else if (typeof updates.title === 'string' && typeof updates.systemInstruction === 'string') {
      await updateDoc(doc(db, path), {
        title: updates.title.trim().slice(0, 120) || 'New Chat',
        systemInstruction: updates.systemInstruction.slice(0, 2000),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchCloudMessages(uid: string, chatId: string): Promise<ChatMessage[]> {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chatId);
  const path = `users/${safeUid}/chats/${safeChatId}/messages`;
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: safeUid,
        chatId: safeChatId,
        role: data.role === 'assistant' ? 'assistant' : 'user',
        mode: data.mode === 'voice' ? 'voice' : 'text',
        content: String(data.content || ''),
        createdAt: toMillis(data.createdAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createCloudMessage(
  uid: string,
  chatId: string,
  msg: Omit<ChatMessage, 'createdAt' | 'isError'>
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chatId);
  const safeMsgId = sanitizeId(msg.id);
  const path = `users/${safeUid}/chats/${safeChatId}/messages/${safeMsgId}`;
  try {
    await setDoc(doc(db, path), {
      userId: safeUid,
      chatId: safeChatId,
      role: msg.role,
      mode: msg.mode === 'voice' ? 'voice' : 'text',
      content: msg.content.trim().slice(0, 16000) || ' ',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function clearCloudChatMessages(uid: string, chatId: string, messageIds: string[]): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chatId);
  const path = `users/${safeUid}/chats/${safeChatId}`;
  try {
    const batch = writeBatch(db);
    for (const mid of messageIds.slice(0, 450)) {
      batch.delete(doc(db, `${path}/messages/${sanitizeId(mid)}`));
    }
    batch.update(doc(db, path), {
      messageCount: 0,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteCloudChat(uid: string, chatId: string, messageIds: string[]): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeChatId = sanitizeId(chatId);
  const path = `users/${safeUid}/chats/${safeChatId}`;
  try {
    const batch = writeBatch(db);
    for (const mid of messageIds.slice(0, 450)) {
      batch.delete(doc(db, `${path}/messages/${sanitizeId(mid)}`));
    }
    batch.delete(doc(db, path));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
