import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  type FunctionDeclaration,
  type LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';
import { getGeminiClient } from './server/gemini.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

interface ChatTurnPayload {
  role: 'user' | 'assistant';
  content: string;
}

interface MemoryItemPayload {
  content: string;
  category: string;
  pinned?: boolean;
}

function buildPersonalizedSystemInstruction(params: {
  baseInstruction?: string;
  preferredName?: string;
  communicationStyle?: string;
  memories?: MemoryItemPayload[];
  crossChatSummary?: string;
  isVoice?: boolean;
}): string {
  const sections: string[] = [];
  const base =
    params.baseInstruction?.trim() ||
    'You are Kora, a warm, knowledgeable, and accessible AI assistant. Give clear, accurate, well-structured answers grounded in the user context.';
  sections.push(base);

  if (params.isVoice) {
    sections.push(
      'Voice mode rules: Keep spoken responses natural, conversational, and concise (usually 1-4 sentences unless the user asks for depth). Avoid markdown tables or raw URLs when speaking aloud.'
    );
  }

  const profileBits: string[] = [];
  if (params.preferredName?.trim()) {
    profileBits.push(`The user's preferred name is ${params.preferredName.trim()}.`);
  }
  if (params.communicationStyle && params.communicationStyle !== 'balanced') {
    const styleMap: Record<string, string> = {
      concise: 'Prefer concise, high-signal answers without filler.',
      detailed: 'Provide thorough explanations with helpful context and examples.',
      'step-by-step': 'Break explanations down into clear, numbered step-by-step guidance.',
    };
    if (styleMap[params.communicationStyle]) {
      profileBits.push(styleMap[params.communicationStyle]);
    }
  }
  if (profileBits.length > 0) {
    sections.push(`User Profile:\n${profileBits.join(' ')}`);
  }

  if (Array.isArray(params.memories) && params.memories.length > 0) {
    const pinnedFirst = [...params.memories].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
    const lines = pinnedFirst
      .slice(0, 25)
      .map((m) => `- [${m.category}${m.pinned ? ', pinned' : ''}] ${m.content}`);
    sections.push(`Personalized User Memories (apply naturally when relevant):\n${lines.join('\n')}`);
  }

  if (params.crossChatSummary?.trim()) {
    sections.push(`Recent Context From Other Conversations:\n${params.crossChatSummary.trim()}`);
  }

  return sections.join('\n\n');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // Streaming text chat endpoint using gemini-4-hydrogen
  app.post('/api/chat/stream', async (req, res) => {
    try {
      const {
        history = [],
        systemInstruction,
        preferredName,
        communicationStyle,
        memories = [],
        crossChatSummary,
        reasoningDepth = 'standard',
      } = req.body as {
        history?: ChatTurnPayload[];
        systemInstruction?: string;
        preferredName?: string;
        communicationStyle?: string;
        memories?: MemoryItemPayload[];
        crossChatSummary?: string;
        reasoningDepth?: 'fast' | 'standard';
      };

      const cleanHistory = history
        .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
        .slice(-24);

      if (cleanHistory.length === 0) {
        res.status(400).json({ error: 'At least one message is required.' });
        return;
      }

      const ai = getGeminiClient();
      const fullSystemInstruction = buildPersonalizedSystemInstruction({
        baseInstruction: systemInstruction,
        preferredName,
        communicationStyle,
        memories,
        crossChatSummary,
        isVoice: false,
      });

      const contents = cleanHistory.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      const stream = await ai.models.generateContentStream({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction: fullSystemInstruction,
          thinkingConfig: {
            thinkingLevel: reasoningDepth === 'fast' ? ThinkingLevel.LOW : ThinkingLevel.MEDIUM,
          },
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate chat response.';
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      }
    }
  });

  // Structured automatic personalized memory extractor
  app.post('/api/memory/extract', async (req, res) => {
    try {
      const { userMessage, assistantMessage, existingMemories = [], currentPreferredName = '' } = req.body as {
        userMessage?: string;
        assistantMessage?: string;
        existingMemories?: string[];
        currentPreferredName?: string;
      };

      if (!userMessage?.trim()) {
        res.json({ preferredName: null, newMemories: [] });
        return;
      }

      const ai = getGeminiClient();
      const prompt = [
        'Analyze the user message below and extract any durable, helpful personal facts, preferences, goals, or ongoing context worth remembering across future conversations.',
        'Do NOT extract transient greetings, one-off math questions, or facts already covered in Existing Memories.',
        'If the user explicitly states their name or asks to be called something, return preferredName.',
        `Current preferredName: ${currentPreferredName || '(none)'}`,
        `Existing Memories:\n${existingMemories.length > 0 ? existingMemories.map((m) => `- ${m}`).join('\n') : '(none)'}`,
        `User Message: ${userMessage}`,
        assistantMessage ? `Assistant Reply: ${assistantMessage}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              preferredName: {
                type: Type.STRING,
                description: 'Updated preferred name if user stated their name, otherwise empty string.',
              },
              newMemories: {
                type: Type.ARRAY,
                description: 'List of concise, durable, non-duplicate facts or preferences about the user.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    content: {
                      type: Type.STRING,
                      description: 'Concise third-person or neutral memory statement under 140 characters.',
                    },
                    category: {
                      type: Type.STRING,
                      enum: ['preference', 'fact', 'goal', 'context'],
                    },
                  },
                  required: ['content', 'category'],
                },
              },
            },
            required: ['preferredName', 'newMemories'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({
        preferredName: typeof parsed.preferredName === 'string' ? parsed.preferredName.trim() : '',
        newMemories: Array.isArray(parsed.newMemories) ? parsed.newMemories.slice(0, 3) : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Memory extraction failed';
      res.status(500).json({ error: message, preferredName: '', newMemories: [] });
    }
  });

  // High-accessibility Text-to-Speech endpoint using gemini-3.8-flash-lite-tts
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voiceName = 'Zephyr' } = req.body as { text?: string; voiceName?: string };
      if (!text?.trim()) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }

      const safeVoice = ALLOWED_VOICES.has(voiceName) ? voiceName : 'Zephyr';
      const ai = getGeminiClient();
      const cleanText = text.replace(/[*_`#>-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500);

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'No audio returned by TTS model.' });
        return;
      }

      res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech generation failed.';
      res.status(500).json({ error: message });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<ReturnType<typeof getGeminiClient>['live']['connect']>> | null = null;
    let isClosing = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const closeAll = () => {
      if (isClosing) return;
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
      liveSession = null;
    };

    clientWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type?: string;
          audio?: string;
          text?: string;
          voiceName?: string;
          systemInstruction?: string;
          preferredName?: string;
          communicationStyle?: string;
          memories?: MemoryItemPayload[];
          crossChatSummary?: string;
        };

        if (msg.type === 'init') {
          if (liveSession) return;
          const ai = getGeminiClient();
          const safeVoice = msg.voiceName && ALLOWED_VOICES.has(msg.voiceName) ? msg.voiceName : 'Zephyr';
          const systemInstruction = buildPersonalizedSystemInstruction({
            baseInstruction: msg.systemInstruction,
            preferredName: msg.preferredName,
            communicationStyle: msg.communicationStyle,
            memories: msg.memories,
            crossChatSummary: msg.crossChatSummary,
            isVoice: true,
          });

          const saveMemoryDeclaration: FunctionDeclaration = {
            name: 'save_user_memory',
            description:
              'Saves a durable personal fact, preference, name, or goal shared by the user into their personalized memory.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                content: {
                  type: Type.STRING,
                  description: 'Concise summary of the fact or preference to remember.',
                },
                category: {
                  type: Type.STRING,
                  enum: ['preference', 'fact', 'goal', 'context'],
                },
              },
              required: ['content', 'category'],
            },
          };

          liveSession = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: safeVoice },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              tools: [{ functionDeclarations: [saveMemoryDeclaration] }],
              systemInstruction,
            },
            callbacks: {
              onopen: () => {
                safeSend({ type: 'ready' });
              },
              onmessage: (message: LiveServerMessage) => {
                const content = message.serverContent;
                if (content?.inputTranscription?.text) {
                  safeSend({
                    type: 'input_transcript',
                    text: content.inputTranscription.text,
                  });
                }
                if (content?.outputTranscription?.text) {
                  safeSend({
                    type: 'output_transcript',
                    text: content.outputTranscription.text,
                  });
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    safeSend({ type: 'audio', audio: part.inlineData.data });
                  }
                }
                if (content?.interrupted) {
                  safeSend({ type: 'interrupted' });
                }
                if (content?.turnComplete) {
                  safeSend({ type: 'turn_complete' });
                }
                for (const call of message.toolCall?.functionCalls ?? []) {
                  if (call.name === 'save_user_memory' && call.args) {
                    const args = call.args as { content?: string; category?: string };
                    if (args.content) {
                      safeSend({
                        type: 'memory_saved',
                        memory: {
                          content: String(args.content).slice(0, 600),
                          category: ['preference', 'fact', 'goal', 'context'].includes(String(args.category))
                            ? String(args.category)
                            : 'fact',
                        },
                      });
                    }
                    liveSession?.sendToolResponse({
                      functionResponses: [
                        {
                          id: call.id,
                          name: call.name,
                          response: { saved: true },
                        },
                      ],
                    });
                  }
                }
              },
              onerror: (err) => {
                safeSend({ type: 'error', error: err.message || 'Live voice session error.' });
              },
              onclose: () => {
                safeSend({ type: 'closed' });
              },
            },
          });
          return;
        }

        if (msg.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
          return;
        }

        if (msg.text && liveSession) {
          liveSession.sendRealtimeInput({ text: msg.text });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Live voice processing error.';
        safeSend({ type: 'error', error: message });
      }
    });

    clientWs.on('close', closeAll);
    clientWs.on('error', closeAll);
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`Kora AI server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
