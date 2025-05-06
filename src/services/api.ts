import { cleanHtmlAndFormatText } from './textUtils'; // Renamed for clarity

export const sendMessageToWebhook = async (message: string): Promise<string> => {
  try {
    console.log('Sending message to webhook:', message);
    
    const response = await fetch('https://n8n.aidoption.fr/webhook/Artips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      console.error('HTTP error status:', response.status);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const textData = await response.text();
    console.log('Raw webhook response:', textData);
    
    if (!textData || textData.trim() === '') {
      console.warn('Empty response received from webhook');
      return 'Sorry, I received an empty response. Please try again.';
    }
    
    return formatResponseText(textData);
  } catch (error) {
    console.error('Error sending message to webhook:', error);
    throw error;
  }
};

// Function to format the response text (moved to textUtils.ts but kept here for context if not creating textUtils.ts separately)
export const formatResponseText = (text: string): string => {
  // Try to parse as JSON if it looks like JSON
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      const data = JSON.parse(text);
      
      if (typeof data === 'string') {
        return cleanHtmlAndFormatText(data);
      } else if (data && typeof data.output === 'string') {
        return cleanHtmlAndFormatText(data.output);
      } else if (data && typeof data.response === 'string') {
        return cleanHtmlAndFormatText(data.response);
      } else if (data && typeof data.message === 'string') {
        return cleanHtmlAndFormatText(data.message);
      } else if (data && typeof data.text === 'string') {
        return cleanHtmlAndFormatText(data.text);
      } else if (data && typeof data.content === 'string') {
        return cleanHtmlAndFormatText(data.content);
      } else if (data && typeof data.result === 'string') {
        return cleanHtmlAndFormatText(data.result);
      } else if (data && typeof data.answer === 'string') {
        return cleanHtmlAndFormatText(data.answer);
      } else if (data && typeof data.data === 'string') {
        return cleanHtmlAndFormatText(data.data);
      } else if (data && data.data && typeof data.data.response === 'string') {
        return cleanHtmlAndFormatText(data.data.response);
      } else if (data && data.data && typeof data.data.message === 'string') {
        return cleanHtmlAndFormatText(data.data.message);
      } else if (data && data.data && typeof data.data.text === 'string') {
        return cleanHtmlAndFormatText(data.data.text);
      } else if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
        return cleanHtmlAndFormatText(data[0]);
      } else if (data && typeof data === 'object') {
        for (const key in data) {
          if (typeof data[key] === 'string' && data[key].length > 20) {
            return cleanHtmlAndFormatText(data[key]);
          }
        }
        return 'Response: ' + cleanHtmlAndFormatText(JSON.stringify(data));
      }
    } catch (e) {
      // console.error('JSON parsing error in formatResponseText:', e);
      return cleanHtmlAndFormatText(text);
    }
  }
  return cleanHtmlAndFormatText(text);
};


/**
 * Fetches synthesized speech audio from the backend proxy.
 * The backend proxy is responsible for calling the Google Cloud TTS API.
 * @param text The text to synthesize.
 * @returns A promise that resolves to an object containing the base64 audio content and sample rate.
 */
export const fetchGoogleTTSAudio = async (text: string): Promise<{ audioContent: string; sampleRate: number }> => {
  // IMPORTANT: '/api/google-tts-proxy' is a placeholder.
  // You need to implement this backend endpoint.
  // It should securely call Google Cloud TTS and return the audio.
  const ttsProxyUrl = '/api/google-tts-proxy'; 

  try {
    console.log(`Fetching TTS audio for text: "${text.substring(0, 50)}..."`);
    const response = await fetch(ttsProxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        // You can pass other parameters your backend might need, e.g., voice preferences
        // These would align with the Google Cloud TTS API request structure
        voice: {
          languageCode: "fr-FR",
          name: "fr-FR-Chirp3-HD-Aoede"
        },
        audioConfig: {
          audioEncoding: "LINEAR16"
          // sampleRateHertz: 24000 // Optional: backend can set this or derive it
        }
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`HTTP error fetching TTS audio! Status: ${response.status}`, errorBody);
      throw new Error(`Failed to fetch TTS audio. Status: ${response.status}. ${errorBody}`);
    }

    const data = await response.json();
    
    if (!data.audioContent || typeof data.sampleRate !== 'number') {
      console.error('Invalid TTS response format from proxy:', data);
      throw new Error('Invalid TTS response format from proxy. Expected { audioContent: string, sampleRate: number }.');
    }
    
    console.log(`Received TTS audio data (sample rate: ${data.sampleRate})`);
    return { audioContent: data.audioContent, sampleRate: data.sampleRate };

  } catch (error) {
    console.error('Error fetching Google TTS audio:', error);
    // Provide a more user-friendly error or rethrow
    if (error instanceof Error && error.message.startsWith('Failed to fetch TTS audio')) {
      throw error; // Rethrow specific errors
    }
    throw new Error('Could not retrieve synthesized speech. Please ensure the backend TTS proxy is running and configured correctly.');
  }
};
