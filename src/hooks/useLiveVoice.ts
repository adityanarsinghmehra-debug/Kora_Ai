import { useCallback, useEffect, useRef, useState } from 'react';
import { type CommunicationStyle, type MemoryCategory, type UserMemory, type VoiceName } from '../types/chat';

export type VoiceSessionState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface UseLiveVoiceOptions {
  voiceName: VoiceName;
  systemInstruction: string;
  preferredName: string;
  communicationStyle: CommunicationStyle;
  memories: UserMemory[];
  crossChatSummary: string;
  onTurnFinalized: (userText: string, assistantText: string) => void;
  onMemorySavedByVoice: (content: string, category: MemoryCategory) => void;
}

function downsampleBuffer(buffer: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (inputRate === targetRate) return buffer;
  const ratio = inputRate / targetRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function floatTo16BitPCMBase64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64PCMToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

export function useLiveVoice(options: UseLiveVoiceOptions) {
  const [voiceState, setVoiceState] = useState<VoiceSessionState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveUserTranscript, setLiveUserTranscript] = useState('');
  const [liveModelTranscript, setLiveModelTranscript] = useState('');
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const isMutedRef = useRef(false);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const userTranscriptBufRef = useRef('');
  const modelTranscriptBufRef = useRef('');
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stopPlaybackQueue = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // Ignore already-stopped nodes
      }
    });
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setOutputLevel(0);
  }, []);

  const flushTranscriptTurn = useCallback(() => {
    const userTxt = userTranscriptBufRef.current.trim();
    const modelTxt = modelTranscriptBufRef.current.trim();
    if (userTxt || modelTxt) {
      optionsRef.current.onTurnFinalized(userTxt, modelTxt);
      userTranscriptBufRef.current = '';
      modelTranscriptBufRef.current = '';
      setLiveUserTranscript('');
      setLiveModelTranscript('');
    }
  }, []);

  const stopSession = useCallback(() => {
    flushTranscriptTurn();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopPlaybackQueue();
    try {
      processorRef.current?.disconnect();
    } catch {
      // Ignore
    }
    processorRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      void outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }
    outputAnalyserRef.current = null;
    setInputLevel(0);
    setOutputLevel(0);
    setIsMuted(false);
    isMutedRef.current = false;
    setVoiceState('idle');
  }, [flushTranscriptTurn, stopPlaybackQueue]);

  const scheduleAudioChunk = useCallback((base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    const pcmFloat = base64PCMToFloat32(base64Audio);
    if (pcmFloat.length === 0) return;

    const buffer = ctx.createBuffer(1, pcmFloat.length, 24000);
    buffer.copyToChannel(new Float32Array(pcmFloat), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    if (outputAnalyserRef.current) {
      source.connect(outputAnalyserRef.current);
      outputAnalyserRef.current.connect(ctx.destination);
    } else {
      source.connect(ctx.destination);
    }

    const startAt = Math.max(ctx.currentTime + 0.02, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.add(source);
    setVoiceState('speaking');

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setVoiceState((prev) => (prev === 'speaking' ? 'listening' : prev));
      }
    };
  }, []);

  const startSession = useCallback(async () => {
    if (voiceState === 'connecting' || voiceState === 'listening' || voiceState === 'speaking') {
      return;
    }
    setErrorMessage(null);
    setVoiceState('connecting');
    userTranscriptBufRef.current = '';
    modelTranscriptBufRef.current = '';
    setLiveUserTranscript('');
    setLiveModelTranscript('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      await inputCtx.resume();
      await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const outAnalyser = outputCtx.createAnalyser();
      outAnalyser.fftSize = 128;
      outputAnalyserRef.current = outAnalyser;

      const inAnalyser = inputCtx.createAnalyser();
      inAnalyser.fftSize = 128;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Silent gain to keep processor active without audio loopback
      const muteGain = inputCtx.createGain();
      muteGain.gain.value = 0;

      source.connect(inAnalyser);
      inAnalyser.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(inputCtx.destination);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      const freqData = new Uint8Array(outAnalyser.frequencyBinCount);
      const updateMeters = () => {
        if (outputAnalyserRef.current && activeSourcesRef.current.size > 0) {
          outputAnalyserRef.current.getByteFrequencyData(freqData);
          const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;
          setOutputLevel(Math.min(1, avg / 110));
        } else {
          setOutputLevel(0);
        }
        rafRef.current = requestAnimationFrame(updateMeters);
      };
      rafRef.current = requestAnimationFrame(updateMeters);

      ws.onopen = () => {
        const opts = optionsRef.current;
        ws.send(
          JSON.stringify({
            type: 'init',
            voiceName: opts.voiceName,
            systemInstruction: opts.systemInstruction,
            preferredName: opts.preferredName,
            communicationStyle: opts.communicationStyle,
            memories: opts.memories.map((m) => ({
              content: m.content,
              category: m.category,
              pinned: m.pinned,
            })),
            crossChatSummary: opts.crossChatSummary,
          })
        );
      };

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || isMutedRef.current) {
          setInputLevel(0);
          return;
        }
        const channel = e.inputBuffer.getChannelData(0);
        let sumSq = 0;
        for (let i = 0; i < channel.length; i++) {
          sumSq += channel[i] * channel[i];
        }
        const rms = Math.sqrt(sumSq / channel.length);
        setInputLevel(Math.min(1, rms * 8));

        const resampled = downsampleBuffer(channel, inputCtx.sampleRate, 16000);
        const base64 = floatTo16BitPCMBase64(resampled);
        wsRef.current.send(JSON.stringify({ audio: base64 }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            audio?: string;
            text?: string;
            error?: string;
            memory?: { content: string; category: MemoryCategory };
          };

          if (msg.type === 'ready') {
            setVoiceState('listening');
          } else if (msg.type === 'audio' && msg.audio) {
            scheduleAudioChunk(msg.audio);
          } else if (msg.type === 'input_transcript' && msg.text) {
            userTranscriptBufRef.current += msg.text;
            setLiveUserTranscript(userTranscriptBufRef.current.trim());
          } else if (msg.type === 'output_transcript' && msg.text) {
            modelTranscriptBufRef.current += msg.text;
            setLiveModelTranscript(modelTranscriptBufRef.current.trim());
          } else if (msg.type === 'interrupted') {
            stopPlaybackQueue();
            setVoiceState('listening');
          } else if (msg.type === 'turn_complete') {
            flushTranscriptTurn();
            if (activeSourcesRef.current.size === 0) {
              setVoiceState('listening');
            }
          } else if (msg.type === 'memory_saved' && msg.memory) {
            optionsRef.current.onMemorySavedByVoice(msg.memory.content, msg.memory.category);
          } else if (msg.type === 'error') {
            setErrorMessage(msg.error || 'Voice connection encountered an error.');
            setVoiceState('error');
          } else if (msg.type === 'closed') {
            stopSession();
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onerror = () => {
        setErrorMessage('Could not establish real-time voice WebSocket connection.');
        setVoiceState('error');
      };

      ws.onclose = () => {
        if (wsRef.current) {
          stopSession();
        }
      };
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow microphone permissions in your browser settings to use real-time voice.'
          : err instanceof Error
          ? err.message
          : 'Unable to access microphone.';
      setErrorMessage(msg);
      stopSession();
      setVoiceState('error');
    }
  }, [flushTranscriptTurn, scheduleAudioChunk, stopPlaybackQueue, stopSession, voiceState]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      return next;
    });
  }, []);

  const interruptModel = useCallback(() => {
    stopPlaybackQueue();
    setVoiceState('listening');
  }, [stopPlaybackQueue]);

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, [stopSession]);

  return {
    voiceState,
    isMuted,
    errorMessage,
    liveUserTranscript,
    liveModelTranscript,
    inputLevel,
    outputLevel,
    startSession,
    stopSession,
    toggleMute,
    interruptModel,
  };
}
