import { type UserMemory } from '../types/chat';

const OFFLINE_TOPICS = [
  {
    keys: ['token', 'tokens', 'tokenization'],
    answer:
      'Tokens are the text chunks a language model reads—roughly 4 characters or 3/4 of an English word. Both your conversation history and the reply count toward context limits.',
  },
  {
    keys: ['system', 'instruction', 'persona', 'prompt'],
    answer:
      'A System Instruction acts as the assistant rulebook sent before your turns. It defines role, tone, and boundaries across text and real-time voice sessions.',
  },
  {
    keys: ['rag', 'knowledge', 'retrieval', 'vector'],
    answer:
      'Retrieval-Augmented Generation (RAG) searches your trusted notes or documents first and injects relevant passages into the model context so answers stay grounded.',
  },
  {
    keys: ['memory', 'context', 'remember'],
    answer:
      'Kora AI stores your personalized memories (preferences, facts, goals) in Cloud Firestore when signed in with Google and caches them locally for offline PWA access.',
  },
];

export function generateOfflineReply(
  input: string,
  preferredName: string,
  memories: UserMemory[]
): string {
  const lower = input.trim().toLowerCase();

  const pctMatch = input.match(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/i);
  if (pctMatch) {
    const p = parseFloat(pctMatch[1]);
    const n = parseFloat(pctMatch[2]);
    return `${p}% of ${n} is **${Number(((p / 100) * n).toFixed(4))}** (computed offline).`;
  }

  const cleanedMath = input.replace(/[^0-9+\-*/().\s]/g, '').trim();
  if (/[0-9]/.test(cleanedMath) && /[+\-*/]/.test(cleanedMath) && /^[0-9+\-*/().\s]+$/.test(cleanedMath)) {
    try {
      const val = Function(`"use strict"; return (${cleanedMath})`)();
      if (typeof val === 'number' && Number.isFinite(val)) {
        return `${cleanedMath} = **${Number(val.toFixed(6))}** (computed offline).`;
      }
    } catch {
      // Ignore invalid expressions
    }
  }

  if (/(?:what is my name|who am i|what's my name)/i.test(lower)) {
    return preferredName
      ? `Your preferred name is **${preferredName}** (retrieved from offline memory cache).`
      : 'You have not set a preferred name yet—open the Memory tab to add one anytime.';
  }

  if (/(?:what do you remember|my memories|saved memory)/i.test(lower)) {
    if (memories.length === 0) {
      return 'No personalized memories are saved yet. You can add facts or preferences in the Memory view even while offline.';
    }
    const list = memories.slice(0, 5).map((m) => `• ${m.content}`).join('\n');
    return `Here are your saved memories available offline:\n${list}`;
  }

  if (/(?:time|clock)/i.test(lower)) {
    return `Your device time is **${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}**.`;
  }

  if (/(?:date|today|day is it)/i.test(lower)) {
    return `Today is **${new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}**.`;
  }

  for (const topic of OFFLINE_TOPICS) {
    if (topic.keys.some((k) => lower.includes(k))) {
      return `${topic.answer} *(Offline PWA Mode)*`;
    }
  }

  return `${preferredName ? `${preferredName}, you` : 'You'} are currently offline. I can still answer AI basics, calculate math, check time/date, and read your ${memories.length} cached personalized memories. Reconnect anytime for live Gemini text and real-time voice conversations.`;
}
