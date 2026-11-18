export type VoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
export type ThemeMode = 'light' | 'dark' | 'high-contrast';
export type FontSizeMode = 'normal' | 'large';
export type CommunicationStyle = 'balanced' | 'concise' | 'detailed' | 'step-by-step';
export type MemoryCategory = 'preference' | 'fact' | 'goal' | 'context';
export type MemorySource = 'auto' | 'manual' | 'voice';

export interface UserProfile {
  userId: string;
  email?: string;
  displayName?: string;
  preferredName: string;
  communicationStyle: CommunicationStyle;
  voiceName: VoiceName;
  systemInstruction: string;
  crossChatMemoryEnabled: boolean;
  theme: ThemeMode;
  fontSize: FontSizeMode;
  autoReadResponses: boolean;
}

export interface UserMemory {
  id: string;
  userId: string;
  content: string;
  category: MemoryCategory;
  source: MemorySource;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  chatId: string;
  role: 'user' | 'assistant';
  mode: 'text' | 'voice';
  content: string;
  createdAt: number;
  isError?: boolean;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  systemInstruction: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface PersonaPreset {
  id: string;
  label: string;
  instruction: string;
}

export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: 'assistant',
    label: 'Balanced Assistant',
    instruction:
      'You are Kora, a warm, knowledgeable, and accessible AI assistant. Provide clear, accurate, well-structured answers grounded in conversation context and user preferences. If you are unsure of a fact, state that clearly.',
  },
  {
    id: 'tutor',
    label: 'Coding Tutor',
    instruction:
      'You are a patient coding and AI tutor. Explain technical concepts step by step using clear analogies, concise code examples, and check for understanding.',
  },
  {
    id: 'fact_checker',
    label: 'Fact-Checker',
    instruction:
      'You are a strict fact-checker. Respond in concise bullet points, verify assumptions explicitly, and refuse to guess any unverified fact.',
  },
];

export const VOICE_OPTIONS: { value: VoiceName; label: string; tone: string }[] = [
  { value: 'Zephyr', label: 'Zephyr', tone: 'Warm & balanced' },
  { value: 'Kore', label: 'Kore', tone: 'Crisp & clear' },
  { value: 'Puck', label: 'Puck', tone: 'Upbeat & lively' },
  { value: 'Charon', label: 'Charon', tone: 'Calm & deep' },
  { value: 'Fenrir', label: 'Fenrir', tone: 'Grounded & steady' },
];
