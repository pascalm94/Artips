import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchGoogleTTSAudio } from '../services/api';
import { processTextForSpeech } from '../services/textUtils';

// Helper to decode Base64 string to ArrayBuffer
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

export const useSpeechSynthesis = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Initialize AudioContext and check support
  useEffect(() => {
    if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        setIsSupported(true);
        console.log('AudioContext initialized for speech synthesis.');
      } catch (e) {
        console.error('Error initializing AudioContext:', e);
        setIsSupported(false);
        setError('AudioContext could not be initialized.');
      }
    } else {
      console.warn('AudioContext is not supported by this browser.');
      setIsSupported(false);
      setError('AudioContext is not supported.');
    }

    return () => {
      // Cleanup AudioContext and source on unmount
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch (e) { /* ignore */ }
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(e => console.warn("Error closing AudioContext:", e));
        console.log('AudioContext closed.');
      }
    };
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!isSupported || !audioContextRef.current) {
      console.warn('Speech synthesis called but not supported or AudioContext not ready.');
      setError('Speech synthesis is not available.');
      return;
    }
    if (!text || text.trim().length === 0) {
      console.warn('Speak called with empty text. Ignoring.');
      return;
    }

    // Ensure AudioContext is running (it might be suspended on page load)
    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        console.log('AudioContext resumed.');
      } catch (e) {
        console.error('Failed to resume AudioContext:', e);
        setError('Could not resume AudioContext. User interaction might be required.');
        return;
      }
    }
    
    // Cancel any ongoing speech
    if (isSpeaking && audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
        console.log('Previous speech stopped.');
      } catch (e) { /* ignore if already stopped */ }
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    setIsSpeaking(true);
    setError(null);

    try {
      const processedText = processTextForSpeech(text);
      if (!processedText) {
        console.warn('Text became empty after processing. Not speaking.');
        setIsSpeaking(false);
        return;
      }

      console.log(`Requesting speech for: "${processedText.substring(0,100)}..."`);
      // Fetch audio data from backend proxy
      const { audioContent, sampleRate } = await fetchGoogleTTSAudio(processedText);
      
      const audioBuffer = base64ToArrayBuffer(audioContent);
      
      // Decode the raw PCM data (LINEAR16)
      // For LINEAR16, the browser can't decode it directly with decodeAudioData
      // We need to create an AudioBuffer manually.
      // Assuming mono audio, 16-bit samples.
      const pcmData = new Int16Array(audioBuffer);
      const float32Data = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768.0; // Convert 16-bit PCM to Float32 range [-1, 1]
      }

      const newAudioBuffer = audioContextRef.current.createBuffer(
        1, // Number of channels (mono)
        float32Data.length, // Number of frames
        sampleRate // Sample rate (e.g., 24000 for LINEAR16 default)
      );
      newAudioBuffer.copyToChannel(float32Data, 0);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = newAudioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        setIsSpeaking(false);
        if (audioSourceRef.current === source) { // Ensure it's the current source
            audioSourceRef.current = null;
        }
        console.log('Speech finished.');
      };
      
      source.start(0);
      audioSourceRef.current = source;
      console.log('Speech started.');

    } catch (e: any) {
      console.error('Error during speech synthesis:', e);
      setError(`Speech synthesis failed: ${e.message || 'Unknown error'}`);
      setIsSpeaking(false);
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch (err) { /* ignore */ }
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
      }
    }
  }, [isSupported, isSpeaking]);

  const cancel = useCallback(() => {
    if (!isSupported || !audioSourceRef.current || !isSpeaking) {
      // console.log('Cancel called but not speaking or not supported.');
      return;
    }
    console.log('Cancelling speech.');
    try {
      audioSourceRef.current.stop(); // This will trigger onended
    } catch (e) {
      console.warn('Error stopping audio source during cancel:', e);
      // Manually reset state if stop() fails or onended doesn't fire quickly
      setIsSpeaking(false);
      audioSourceRef.current = null;
    }
