// Utility functions for text processing

/**
 * Cleans HTML tags and excessive whitespace from text.
 * @param text The input string.
 * @returns The cleaned string.
 */
export const cleanHtmlAndFormatText = (text: string): string => {
  if (typeof text !== 'string') return '';

  // First, check if the text contains "Response:" prefix and remove it
  if (text.startsWith('Response:')) {
    text = text.substring('Response:'.length).trim();
  }
  
  // Try to extract content from JSON if it's still in JSON format
  // This regex is a simplified example; robust JSON parsing is preferred
  if (text.trim().startsWith('{') && text.includes('"output"')) {
    try {
      // Attempt to find "output" field in a JSON-like string.
      // This is a heuristic and might not cover all cases.
      const match = text.match(/"output"\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (match && match[1]) {
        // If a match is found, unescape newlines and quotes.
        text = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
    } catch (e) {
      console.warn('Error extracting from JSON-like string in cleanHtmlAndFormatText:', e);
      // Proceed with text as is if extraction fails
    }
  }
  
  // Replace escaped newlines with actual newlines
  text = text.replace(/\\n/g, '\n');
  
  // Replace escaped quotes with actual quotes
  text = text.replace(/\\"/g, '"');
  
  // Basic HTML tag removal and formatting preservation
  text = text
    .replace(/<br\s*\/?>/gi, '\n')      // Replace <br> with newline
    .replace(/<p>/gi, '\n')             // Replace <p> with newline (start)
    .replace(/<\/p>/gi, '\n')           // Replace </p> with newline (end)
    .replace(/<li>/gi, '\n• ')          // Replace <li> with newline and bullet
    .replace(/<\/li>/gi, '')            // Remove </li>
    .replace(/<ul>|<\/ul>|<ol|<\/ol>/gi, '\n') // Replace list tags with newlines
    .replace(/<h[1-6]>/gi, '\n\n')      // Replace heading starts with double newline
    .replace(/<\/h[1-6]>/gi, '\n')      // Replace heading ends with newline
    .replace(/<strong>|<\/strong>|<b>|<\/b>/gi, '') // Remove bold tags
    .replace(/<em>|<\/em>|<i>|<\/i>/gi, '')       // Remove italic/emphasis tags
    .replace(/<[^>]+>/g, ' ');         // Remove any remaining HTML tags, replace with space

  // Markdown-like cleaning
  text = text.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold: **text**
  text = text.replace(/\*(.*?)\*/g, '$1');   // Italic: *text*
  text = text.replace(/__(.*?)__/g, '$1');  // Bold: __text__
  text = text.replace(/_(.*?)_/g, '$1');    // Italic: _text_
  text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Links: [text](url)

  // Normalize whitespace: replace multiple spaces/newlines with single ones
  text = text.replace(/\s+/g, ' ').trim(); // Consolidate multiple spaces and trim
  text = text.replace(/\n{3,}/g, '\n\n');  // Reduce multiple newlines to max two

  return text.trim();
};

/**
 * Processes text before sending it for speech synthesis.
 * This can include removing markdown, HTML, or other artifacts.
 * @param text The input string.
 * @returns The processed string ready for TTS.
 */
export const processTextForSpeech = (text: string): string => {
  let processedText = text;
  // Remove or replace any characters/patterns not suitable for speech
  // For example, you might want to expand abbreviations or handle special symbols.
  // The cleanHtmlAndFormatText function already does a good job of removing most noise.
  processedText = cleanHtmlAndFormatText(processedText);

  // Further speech-specific processing can be added here if needed.
  // e.g., replacing "..." with a pause indication if your TTS supports SSML,
  // or simply ensuring it's a period.
  processedText = processedText.replace(/\.\.\./g, '. '); 
  
  // Ensure there are no excessively long strings of non-alphanumeric characters
  // that might cause issues with TTS.
  processedText = processedText.replace(/[^a-zA-Z0-9À-ÿ\s.,!?'"()-€$£%]/g, ' '); // Keep common punctuation

  // Normalize whitespace again after all processing
  processedText = processedText.replace(/\s+/g, ' ').trim();
  
  return processedText;
};
