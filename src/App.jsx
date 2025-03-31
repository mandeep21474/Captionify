import React, { useState, useRef, useCallback } from 'react';
import { Analytics } from "@vercel/analytics/react";
import './App.css';

function App() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [captionResult, setCaptionResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tone, setTone] = useState('fun');
  // const [language, setLanguage] = useState('');
  
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  
  const MAX_RETRIES = 3;
  const API_TIMEOUT = 30000; // 30 seconds

  // Handle file selection
  const handleFile = useCallback((file) => {
    if (!file?.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPEG, PNG, GIF)');
      return;
    }
    
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  }, []);

  // Configure drag and drop
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    if (dropZoneRef.current) {
      dropZoneRef.current.style.borderColor = '#667eea';
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    if (dropZoneRef.current) {
      dropZoneRef.current.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
    if (dropZoneRef.current) {
      dropZoneRef.current.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    }
  }, [handleFile]);

  // API request handling
  const apiRequest = useCallback(async (url, options, retries = MAX_RETRIES) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 503 && retries > 0) { // Model loading
          await new Promise(resolve => setTimeout(resolve, 2000));
          return apiRequest(url, options, retries - 1);
        }
        throw new Error(`API Error: ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return apiRequest(url, options, retries - 1);
      }
      throw error;
    }
  }, []);

  // Generate caption pipeline
  const generateCaption = useCallback(async () => {
    if (!uploadedFile) {
      alert('Please upload an image first');
      return;
    }
    
    // const currentLanguage = language.trim() || 'English';
    setIsLoading(true);
    setCaptionResult('');
   
    try {
      // Get image description from BLIP
      const blipData = await apiRequest(
        'https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base',
        {
          headers: { 
            'Authorization': `Bearer ${import.meta.env.VITE_HUGGING_FACE_API_KEY}`,
            'Content-Type': uploadedFile.type
          },
          method: 'POST',
          body: uploadedFile
        }
      );

      const baseCaption = blipData[0]?.generated_text || 'an interesting image';
      console.log('BLIP Description:', baseCaption);

      // Generate formatted caption
      const prompt = `USER: Generate a social media caption for: "${baseCaption}". 
          Tone: ${tone}. 
          Format: Catchy start, 2-3 relevant emojis, 3 hashtags at end.
          Strict rules: No explanations about caption, only 1 caption under 150 chars. And caption should not contain '�'
          ASSISTANT:  
          `;

      const mistralResponse = await apiRequest(
        'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
        {
          headers: { 
            'Authorization':`Bearer ${import.meta.env.VITE_HUGGING_FACE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          method: 'POST',
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 100,
              temperature: 0.7,
              repetition_penalty: 1.5,
              top_p: 0.95,
              top_k: 50,
              do_sample: true,
              bad_words_ids: [[27, 91, 437, 1659, 3359]], // Prevent special chars
              return_full_text: false
            }
          })
        }
      );

      // Log raw API response
      console.log('Raw Hugging Face API Response:', mistralResponse);
      
      const rawCaption = mistralResponse[0]?.generated_text || '';
      console.log('Raw Caption Before Processing:', rawCaption);
      
      const cleanCaption = rawCaption
        .replace(/[^\p{L}\p{M}\p{N}\p{P}\p{S}\p{Z}\p{Emoji}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();

      console.log('Cleaned Caption:', cleanCaption);
      
      if (cleanCaption.includes("Caption Ideas")) {
        const firstColonIndex = cleanCaption.indexOf(":");
        setCaptionResult(cleanCaption.slice(firstColonIndex + 1));
      } else {
        setCaptionResult(cleanCaption);
      }

    } catch (error) {
      alert(`Error: ${error.message}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  }, [uploadedFile, tone, apiRequest]);

  return (
    <div className="container">
      <h1>Captionify</h1>
      
      <div 
        className={`upload-section ${isLoading ? 'active' : ''}`}
        ref={dropZoneRef}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        Click or Drag & Drop to Upload Image
        <input 
          type="file" 
          ref={fileInputRef}
          accept="image/*" 
          hidden
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>
      
      {imagePreview && (
        <img 
          id="imagePreview" 
          src={imagePreview} 
          alt="Preview" 
          style={{ display: 'block' }}
        />
      )}
      
      {/* Tone Selection */}
      <div className="tone-selector">
        <label htmlFor="tone">Select Tone:</label>
        <select 
          id="tone"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
        > '
          <option value="fun">😄 Fun</option>
          <option value="formal">🎩 Formal</option>
          <option value="casual">👕 Casual</option>
          <option value="friendly">🤝 Friendly</option>
          <option value="creative">🎨 Creative</option>
          <option value="sarcastic">😏 Sarcastic</option>
          <option value="motivational">🔥 Motivational</option>
          <option value="romantic">💖 Romantic</option>
          <option value="mysterious">🕵️ Mysterious</option>
          <option value="dramatic">🎭 Dramatic</option>
          <option value="inspirational">🌟 Inspirational</option>
          <option value="humble">🙏 Humble</option>
          <option value="poetic">📜 Poetic</option>
          <option value="witty">🧠 Witty</option>
          <option value="sad">😢 Sad</option>
          <option value="excited">🚀 Excited</option>
          <option value="bold">💪 Bold</option>
          <option value="aesthetic">✨ Aesthetic</option>
          <option value="nostalgic">📻 Nostalgic</option>
          <option value="techy">💻 Techy</option>

        </select>
      </div>

      {/* Language Selection */}
      {/* <div className="tone-selector">
        <label htmlFor="lang">Caption Language:</label>
        <input 
          id="lang" 
          type="text" 
          placeholder="English (default)"
          style={{ backgroundImage: 'none', paddingRight: '25px' }}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        />
      </div> */}

      {isLoading && <div className="loading-spinner" />}
      
      {captionResult && (
        <div id="captionResult" style={{ display: 'block' }}>
          {captionResult}
        </div>
      )}
      
      <div className="button-group">
        <button onClick={generateCaption}>Generate Caption</button>
      </div>
      <Analytics /> 
    </div>
  );
}

export default App;



