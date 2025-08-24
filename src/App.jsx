import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Analytics } from "@vercel/analytics/react";
import { Client } from "@gradio/client";
import { GoogleGenerativeAI } from '@google/generative-ai';
import './App.css';

function App() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [captionResult, setCaptionResult] = useState('');
  const [client, setClient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tone, setTone] = useState('fun');
  // const [error, setError] = useState(null);
  const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
  // const [language, setLanguage] = useState('');
  
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  
  const spaceId = "Mandeep08/test";
  const MAX_RETRIES = 3;
  const API_TIMEOUT = 30000; // 30 seconds


    // Initialize the Gradio client on component mount
  useEffect(() => {
    async function initClient() {
      try {
        const gradioClient = await Client.connect(spaceId);
        setClient(gradioClient);
      } catch (err) {
        console.error("Failed to connect to Gradio:", err);
        setError("Could not connect to the Gradio app");
      }
    }
    
    initClient();
    
    // Clean up function
    return () => {
      // If there's any cleanup for the client
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [spaceId]);

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

    if (!client) {
      setError("Client not initialized yet. Please wait or refresh.");
      return;
    }
    
    
    // const currentLanguage = language.trim() || 'English';
    setIsLoading(true);
    setCaptionResult('');
   
    try {
      let blipdata='';
      // Call the Gradio endpoint using the client with the correct format
      const result = await client.predict("/predict", { 
        img: uploadedFile,        
        min_len: 15,
        max_len: 100
      });
      
      if (result && result.data) {
  
          console.log("Received non-string data:", result.data);
           const rawCaption = result.data[0];
          const cleanCaption = rawCaption.replace(/\d+(\.\d+)?\s*seconds?/, '').trim();
          blipdata=String(cleanCaption);
        
      } else {
        setError("Received empty response");
      }

      const baseCaption =blipdata;
      console.log('BLIP Description:', baseCaption);

      // Generate formatted caption
    async function generateCaption(baseCaption, tone) {
              try {
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                
                const prompt = `Generate a social media caption for: "${baseCaption}". 
                      Tone: ${tone}. 
                      Format: Catchy start, relevant appropriate emojis, hashtags at end.
                      Strict rules: No explanations about caption, only 1 caption under 150 characters. Return only the caption text, nothing else.`;

                const result = await model.generateContent(prompt);
                const response = await result.response;
                const caption = response.text().trim();
                
                return caption;
                
              } catch (error) {
                console.error('Error generating caption:', error);
                throw error;
              }
    }
    const caption = await generateCaption(baseCaption, tone);
    setCaptionResult(caption);
    console.log(caption);

      

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


