import React, { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Header from './components/Header';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import ConversationHistory from './components/ConversationHistory';
import ErrorMessage from './components/ErrorMessage';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis'; // Updated hook
import { sendMessageToWebhook } from './services/api';
import { Message, Conversation, ConversationState } from './types';

// Polyfill for UUID
const generateId = () => {
  try {
    return uuidv4();
  } catch (e) {
    // Basic fallback for environments where uuidv4 might fail (e.g., very old browsers or specific sandboxes)
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
};

function App() {
  const [state, setState] = useState<ConversationState>({
    currentConversationId: generateId(),
    conversations: [{
      id: generateId(), // Initial conversation
      title: 'New Conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }],
    isRecording: false,
    isProcessing: false,
    error: null,
    selectedVoiceId: null // This might be deprecated if Google TTS voice is fixed
  });

  // Load conversation history from localStorage
  useEffect(() => {
    const savedConversations = localStorage.getItem('artips-conversations');
    const savedCurrentId = localStorage.getItem('artips-current-conversation-id');
    
    let initialConversations: Conversation[] = [{
      id: generateId(),
      title: 'New Conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }];
    let currentIdToUse = initialConversations[0].id;

    if (savedConversations) {
      try {
        const parsedConversations = JSON.parse(savedConversations) as Conversation[];
        
        if (Array.isArray(parsedConversations) && parsedConversations.length > 0) {
          initialConversations = parsedConversations.map(conv => ({
            ...conv,
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt),
            messages: conv.messages.map(msg => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }))
          }));

          if (savedCurrentId && initialConversations.some(c => c.id === savedCurrentId)) {
            currentIdToUse = savedCurrentId;
          } else {
            // Sort by updatedAt descending to pick the most recent if savedCurrentId is invalid
            initialConversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            currentIdToUse = initialConversations[0].id;
          }
        }
      } catch (error) {
        console.error('Failed to parse saved conversations:', error);
        // Fallback to default initial conversation if parsing fails
      }
    }
    
    setState(prev => ({ 
      ...prev, 
      conversations: initialConversations,
      currentConversationId: currentIdToUse
    }));
  }, []);

  // Save conversation history to localStorage
  useEffect(() => {
    // Only save if there are conversations and a current ID
    if (state.conversations.length > 0 && state.currentConversationId) {
      localStorage.setItem('artips-conversations', JSON.stringify(state.conversations));
      localStorage.setItem('artips-current-conversation-id', state.currentConversationId);
    }
  }, [state.conversations, state.currentConversationId]);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const { 
    speak, 
    cancel: stopSpeaking, 
    isSpeaking, 
    isSupported: isSpeechSynthesisSupported,
    error: ttsError // Get error from the new TTS hook
  } = useSpeechSynthesis();

  // Handle TTS errors
  useEffect(() => {
    if (ttsError) {
      setError(`Speech synthesis error: ${ttsError}`);
    }
  }, [ttsError, setError]);


  // Get current conversation or create a default if not found
  const getCurrentConversation = useCallback((): Conversation => {
    const foundConversation = state.conversations.find(c => c.id === state.currentConversationId);
    if (foundConversation) {
      return foundConversation;
    }
    // This case should ideally not happen if state is managed correctly
    // but as a fallback, return the first conversation or a new one.
    if (state.conversations.length > 0) {
      return state.conversations[0];
    }
    // If there are no conversations at all (e.g. after clearing history and no new one started)
    const newConvId = generateId();
    const newConv: Conversation = {
      id: newConvId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    // Add this new conversation to the state
    // This might cause an extra render, but ensures consistency
    setState(prev => ({
      ...prev,
      conversations: [newConv],
      currentConversationId: newConvId
    }));
    return newConv;
  }, [state.conversations, state.currentConversationId]);


  // Update or add a conversation in the state
  const upsertConversation = useCallback((updatedConversation: Conversation) => {
    setState(prev => {
      const existingIndex = prev.conversations.findIndex(c => c.id === updatedConversation.id);
      let newConversations;
      if (existingIndex > -1) {
        newConversations = [...prev.conversations];
        newConversations[existingIndex] = updatedConversation;
      } else {
        newConversations = [updatedConversation, ...prev.conversations];
      }
      // Sort conversations by updatedAt date, most recent first
      newConversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return {
        ...prev,
        conversations: newConversations,
        currentConversationId: updatedConversation.id // Ensure current ID is set to the one being updated/added
      };
    });
  }, []);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const currentConversation = getCurrentConversation();

    const userMessage: Message = {
      id: generateId(),
      text,
      isUser: true,
      timestamp: new Date()
    };
    
    let updatedConversation = {
      ...currentConversation,
      messages: [...currentConversation.messages, userMessage],
      updatedAt: new Date()
    };
    
    if (currentConversation.messages.length === 0 && (!currentConversation.title || currentConversation.title === "New Conversation")) {
      updatedConversation.title = text.length > 30 ? text.substring(0, 27) + '...' : text;
    }
    
    upsertConversation(updatedConversation);
    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      if (isSpeaking) {
        stopSpeaking();
      }
      
      const responseText = await sendMessageToWebhook(text);
      
      const agentMessage: Message = {
        id: generateId(),
        text: responseText,
        isUser: false,
        timestamp: new Date()
      };
      
      updatedConversation = {
        ...updatedConversation,
        messages: [...updatedConversation.messages, agentMessage],
        updatedAt: new Date()
      };
      
      upsertConversation(updatedConversation);
      setState(prev => ({ ...prev, isProcessing: false }));
      
      if (isSpeechSynthesisSupported) {
        speak(responseText);
      } else {
        setError("Speech synthesis is not supported on this device/browser.");
      }
    } catch (error: any) {
      console.error('Error processing message:', error);
      let errorMessage = 'Failed to get a response. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage = 'Network error: Unable to connect. Please check your internet connection.';
        } else if (error.message.includes('HTTP error! Status: 4')) {
          errorMessage = 'Server error (client-side): The request was rejected. Please try again later.';
        } else if (error.message.includes('HTTP error! Status: 5')) {
          errorMessage = 'Server error (server-side): The server is currently unavailable. Please try again later.';
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }
      setState(prev => ({ ...prev, isProcessing: false, error: errorMessage }));
    }
  }, [getCurrentConversation, upsertConversation, speak, stopSpeaking, isSpeaking, isSpeechSynthesisSupported, setError]);

  const handleSpeechResult = useCallback((transcript: string) => {
    if (transcript.trim()) {
      handleSendMessage(transcript);
    }
    setState(prev => ({ ...prev, isRecording: false })); // Ensure recording state is reset
  }, [handleSendMessage]);

  const handleSpeechError = useCallback((speechError: string) => {
    setError(`Speech recognition error: ${speechError}`);
    setState(prev => ({ ...prev, isRecording: false }));
  }, [setError]);

  const { 
    startRecording, 
    stopRecording,
    isSupported: isSpeechRecognitionSupported
  } = useSpeechRecognition({
    onResult: handleSpeechResult,
    onError: handleSpeechError
  });

  const handleStartRecording = useCallback(() => {
    if (!isSpeechRecognitionSupported) {
      setError("Speech recognition is not supported on this device/browser.");
      return;
    }
    // Stop any ongoing speech synthesis before starting recording
    if (isSpeaking) {
      stopSpeaking();
    }
    startRecording();
    setState(prev => ({ ...prev, isRecording: true, error: null }));
  }, [startRecording, isSpeechRecognitionSupported, setError, isSpeaking, stopSpeaking]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    // isRecording state is managed by onend in useSpeechRecognition and handleSpeechResult
  }, [stopRecording]);

  const handleReplayAudio = useCallback((message: Message) => {
    if (isSpeechSynthesisSupported && !message.isUser && message.text) {
      if (isSpeaking) {
        stopSpeaking(); // Stop current speech if any
        // Add a small delay to ensure the previous speech is fully cancelled before starting new one
        setTimeout(() => speak(message.text), 100);
      } else {
        speak(message.text);
      }
    }
  }, [speak, stopSpeaking, isSpeaking, isSpeechSynthesisSupported]);

  const handleNewConversation = useCallback(() => {
    if (isSpeaking) stopSpeaking();
    const newId = generateId();
    const newConversation: Conversation = {
      id: newId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    // Add to the beginning of the list and make it current
    setState(prev => ({
      ...prev,
      conversations: [newConversation, ...prev.conversations.filter(c => c.id !== newId)],
      currentConversationId: newId,
      error: null
    }));
  }, [isSpeaking, stopSpeaking]);

  const handleSelectConversation = useCallback((conversationId: string) => {
    if (isSpeaking) stopSpeaking();
    setState(prev => ({
      ...prev,
      currentConversationId: conversationId,
      error: null
    }));
  }, [isSpeaking, stopSpeaking]);

  const handleDeleteConversation = useCallback((conversationId: string) => {
    if (isSpeaking) stopSpeaking();
    setState(prev => {
      const remainingConversations = prev.conversations.filter(c => c.id !== conversationId);
      let newCurrentId = prev.currentConversationId;

      if (prev.currentConversationId === conversationId) {
        if (remainingConversations.length > 0) {
          // Sort by updatedAt to select the most recent as current
          remainingConversations.sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          newCurrentId = remainingConversations[0].id;
        } else {
          // If all conversations are deleted, create a new one
          const newConvId = generateId();
          remainingConversations.push({
            id: newConvId,
            title: 'New Conversation',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date()
          });
          newCurrentId = newConvId;
        }
      }
      return {
        ...prev,
        conversations: remainingConversations,
        currentConversationId: newCurrentId,
        error: null
      };
    });
  }, [isSpeaking, stopSpeaking]);
  
  const currentConversation = getCurrentConversation();

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <ConversationHistory
          conversations={state.conversations}
          currentConversationId={state.currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
        />
        <main className="flex-1 flex flex-col overflow-hidden">
          {state.error && <ErrorMessage message={state.error} onClose={() => setError(null)} />}
          <MessageList
            messages={currentConversation.messages}
            onReplayAudio={handleReplayAudio}
            isSpeechSynthesisSupported={isSpeechSynthesisSupported}
          />
          <MessageInput
            onSendMessage={handleSendMessage}
            isRecording={state.isRecording}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            isProcessing={state.isProcessing}
            isSpeaking={isSpeaking}
            onStopSpeaking={stopSpeaking}
            isSpeechRecognitionSupported={isSpeechRecognitionSupported}
            isSpeechSynthesisSupported={isSpeechSynthesisSupported}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
