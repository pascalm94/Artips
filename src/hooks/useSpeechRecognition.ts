import { useState, useEffect, useCallback, useRef } from 'react';

interface UseSpeechRecognitionProps {
  onResult: (transcript: string) => void;
  onError: (error: string) => void;
}

// Declare the global SpeechRecognition types
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    // Add other properties if needed, like resultIndex
  }
  interface SpeechRecognitionErrorEvent extends Event { // Changed from SpeechRecognitionError to SpeechRecognitionErrorEvent
    error: string; // Standard property for SpeechRecognitionErrorEvent
    message?: string; // Optional message property
  }
}


export const useSpeechRecognition = ({ onResult, onError }: UseSpeechRecognitionProps) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const initializedRef = useRef<boolean>(false);
  
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  const initialize = useCallback(() => {
    if (initializedRef.current) return;
    
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognitionAPI) {
      console.warn('Speech recognition is not supported in this browser.');
      setIsSupported(false);
      onErrorRef.current('Speech recognition not supported.');
      return;
    }
    
    try {
      const recognitionInstance = new SpeechRecognitionAPI();
      
      recognitionInstance.continuous = false; // Stop after first result
      recognitionInstance.interimResults = false; // We only want final results
      recognitionInstance.lang = 'fr-FR'; 
      
      recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = event.resultIndex || 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        if (transcript) {
          console.log('Speech recognition result:', transcript);
          onResultRef.current(transcript);
        }
        // setIsRecording(false); // Moved to onend for more reliability
      };
      
      recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error, event.message);
        let errorMessage = event.error;
        if (event.message) {
          errorMessage += `: ${event.message}`;
        }
        // Common errors and more user-friendly messages
        if (event.error === 'no-speech') {
          errorMessage = 'No speech was detected. Please try again.';
        } else if (event.error === 'audio-capture') {
          errorMessage = 'Audio capture failed. Please check microphone permissions and settings.';
        } else if (event.error === 'not-allowed') {
          errorMessage = 'Microphone access was denied. Please allow microphone access in your browser settings.';
        } else if (event.error === 'network') {
          errorMessage = 'Network error during speech recognition. Please check your internet connection.';
        }
        onErrorRef.current(errorMessage);
        setIsRecording(false); 
      };
      
      recognitionInstance.onend = () => {
        console.log('Speech recognition ended.');
        setIsRecording(false);
      };

      recognitionInstance.onstart = () => {
        console.log('Speech recognition started.');
        setIsRecording(true);
      };

      recognitionInstance.onaudiostart = () => {
        console.log('Audio capture started.');
      };
      recognitionInstance.onaudioend = () => {
        console.log('Audio capture ended.');
      };
      recognitionInstance.onspeechstart = () => {
        console.log('Speech detected.');
      };
      recognitionInstance.onspeechend = () => {
        console.log('Speech ended.');
        // recognitionRef.current?.stop(); // Sometimes helps ensure it stops if continuous was true
      };
      
      recognitionRef.current = recognitionInstance;
      setIsSupported(true);
      initializedRef.current = true;
      console.log('Speech recognition initialized.');
    } catch (error: any) {
      console.error('Failed to initialize speech recognition:', error);
      setIsSupported(false);
      onErrorRef.current(`Initialization failed: ${error.message || 'Unknown error'}`);
    }
  }, []); // Empty dependency array: initialize only once

  // Effect to initialize on mount
  useEffect(() => {
    initialize();
    
    // Cleanup function
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort(); // Abort any ongoing recognition
          console.log('Speech recognition aborted on cleanup.');
        } catch (e) {
          console.warn('Error aborting speech recognition on cleanup:', e);
        }
        // Nullify handlers to prevent memory leaks
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onstart = null;
        recognitionRef.current = null;
      }
      initializedRef.current = false; // Allow re-initialization if component remounts
    };
  }, [initialize]); // Depend on initialize

  const startRecording = useCallback(() => {
    if (!initializedRef.current || !recognitionRef.current) {
      console.warn('Attempted to start recording, but not initialized. Initializing now...');
      initialize(); // Try to initialize if not already
      // If initialize is async or takes time, this start might not happen immediately.
      // Consider a small delay or a state to retry startRecording after init.
      setTimeout(() => {
        if (recognitionRef.current && isSupported) {
          try {
            recognitionRef.current.start();
          } catch (e: any) {
            console.error('Error starting speech recognition after re-init:', e);
            onErrorRef.current(`Start failed: ${e.message || 'Could not start'}`);
            setIsRecording(false);
          }
        }
      }, 100);
      return;
    }

    if (isRecording) {
      console.warn('Already recording.');
      return;
    }
    
    if (!isSupported) {
      onErrorRef.current('Speech recognition is not supported or not allowed.');
      return;
    }

    try {
      recognitionRef.current.start();
      // setIsRecording(true); // Moved to onstart for accuracy
    } catch (e: any) {
      // This can happen if start() is called too soon after a previous session,
      // or if the microphone is not available.
      console.error('Error starting speech recognition:', e);
      onErrorRef.current(`Start failed: ${e.message || 'Could not start'}`);
      setIsRecording(false); // Ensure state is correct
    }
  }, [isRecording, isSupported, initialize]);

  const stopRecording = useCallback(() => {
    if (!recognitionRef.current || !isRecording) {
      // console.warn('Not recording or recognition not initialized.');
      return;
    }
    try {
      recognitionRef.current.stop();
      console.log('Speech recognition stop requested.');
      // setIsRecording(false); // State is set by onend
    } catch (e: any) {
      console.error('Error stopping speech recognition:', e);
      onErrorRef.current(`Stop failed: ${e.message || 'Could not stop'}`);
      // Force state update if stop fails critically
      setIsRecording(false);
    }
  }, [isRecording]);

  return {
    isRecording,
    isSupported,
    startRecording,
    stopRecording,
  };
};
