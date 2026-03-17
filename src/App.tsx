/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Calculator, 
  Camera, 
  Send, 
  X, 
  MessageSquare,
  History,
  Trash2,
  ChevronRight,
  BrainCircuit,
  Target,
  Sparkles,
  PenTool,
  Eraser,
  Download,
  AlertCircle,
  CheckCircle2,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Stage, Layer, Line } from 'react-konva';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Initialize Gemini API
const getApiKey = () => {
  return process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
};

const getGenAI = () => new GoogleGenAI({ apiKey: getApiKey() });

const SYSTEM_INSTRUCTION = `
# ROLE: The Elite Socratic Math & Physics Architect
তুমি একজন গণিত বিশেষজ্ঞ। তোমার নাম Math Checker IDE। তোমার প্রধান কাজ হলো ছাত্রদের করা অংকের ভুল খুঁজে বের করা।

# CORE MANDATE (NEVER BREAK THIS):
- **DO NOT** provide final answers or full solutions under ANY circumstances.
- **DO NOT** solve the problem for the user, even if they beg or say they are stuck.
- **YOUR ONLY TASK:** Audit the user's provided work, pinpoint errors, and provide a "Spark Hint" (clue).
- ছাত্রের সমাধানের প্রতিটি ধাপ চেক করো। যদি ২য় লাইনে ভুল থাকে, তবে বলো 'তোমার ২য় লাইনে ক্যালকুলেশনে সমস্যা আছে, একবার চিহ্নগুলো (Signs) চেক করে দেখো।' ছাত্রকে সঠিক উত্তরটি বের করার সুযোগ দাও।

# DOMAIN EXPERTISE:
You possess PhD-level knowledge in:
- **Pure Math:** Linear Algebra (Matrices, Determinants), Calculus (Differential/Integral), Coordinate Geometry (Circle, Straight Line, Conic), Trigonometry, Number Theory, Complex Numbers, Permutation/Combination.
- **Physics:** Newtonian Mechanics, Electromagnetism, Optics, Thermodynamics, Modern Physics.

# ERROR DETECTION PROTOCOL (STEP-BY-STEP):
1. **Transcription:** Extract the problem and the user's solution steps from the text/image.
2. **Path Analysis:** Mentally solve the problem yourself (but keep the solution hidden).
3. **Step-by-Step Comparison:** Compare each of the user's lines with the correct mathematical path.
4. **Error Classification:** Identify if the mistake is:
   - *Arithmetic:* (e.g., 2+3=6)
   - *Conceptual:* (e.g., Using sin instead of cos)
   - *Procedural:* (e.g., Forgetting the +C in integration)
   - *Sign Error:* (e.g., Changing - to + accidentally)

# RESPONSE STRUCTURE (MANDATORY):
[USER INPUT EVALUATION]
- **Status:** [Correct / Error Detected]
- **Confidence:** [Low/High]

[THE AUDIT]
- **Line [N]:** [Mention if Line N is correct or has an issue]
- **The "Stumbling Block":** Briefly describe the type of error without revealing the correct number.

[THE SPARK HINT]
- Give a hint that triggers the user's memory. (e.g., "Recall the chain rule: what happens to the inner function's derivative?")
- Use Socratic Questioning: Ask a question that leads them to the right step.

[MOTIVATION]
- A short, encouraging sentence in Bengali or English.

# STYLE GUIDELINES:
- Use LaTeX for all mathematical expressions: $x^2 + y^2 = r^2$.
- Language: Support both Bengali and English seamlessly.
- Tone: Professional, encouraging, and strictly academic.
`;

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string;
  timestamp: number;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'drawing'>('chat');
  const [lines, setLines] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const stageRef = useRef<any>(null);

  const handleMouseDown = (e: any) => {
    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    setLines([...lines, { tool, points: [pos.x, pos.y] }]);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    let lastLine = lines[lines.length - 1];
    lastLine.points = lastLine.points.concat([point.x, point.y]);
    lines.splice(lines.length - 1, 1, lastLine);
    setLines(lines.concat());
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const clearDrawing = () => {
    setLines([]);
  };

  const exportDrawing = () => {
    if (stageRef.current) {
      const uri = stageRef.current.toDataURL();
      setSelectedImage(uri);
      setActiveTab('chat');
    }
  };

  const [activeTipIndex, setActiveTipIndex] = useState(0);
  const socraticTips = [
    "আমাকে একটা মাছ দিও না, মাছ ধরতে শেখাও।",
    "ভুল করা শেখার একটি অংশ, ভয় পেও না।",
    "প্রতিটি ধাপ নিজে করার চেষ্টা করো, আমি আছি তোমার সাথে।",
    "গণিত হলো যুক্তির খেলা, মুখস্থ করার কিছু নেই।",
    "পদার্থবিজ্ঞান আমাদের চারপাশের জগতকে বোঝার চাবিকাঠি।"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTipIndex((prev) => (prev + 1) % socraticTips.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const preprocessImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        // Limit maximum dimension to 2048px for performance and API limits
        const maxDim = 2048;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = (maxDim / width) * height;
            width = maxDim;
          } else {
            width = (maxDim / height) * width;
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Apply OCR enhancement filters
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // 1. Grayscale conversion
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          
          // 2. Contrast Enhancement (Linear)
          const contrast = 1.2; 
          let enhanced = contrast * (gray - 128) + 128;
          
          // 3. Simple Binarization/Thresholding hint (soft thresholding)
          if (enhanced > 200) enhanced = 255;
          else if (enhanced < 50) enhanced = 0;

          enhanced = Math.max(0, Math.min(255, enhanced));

          data[i] = enhanced;
          data[i + 1] = enhanced;
          data[i + 2] = enhanced;
        }

        ctx.putImageData(imageData, 0, 0);
        // Return as JPEG to reduce payload size
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !selectedImage) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      image: selectedImage || undefined,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error("API Key পাওয়া যায়নি। দয়া করে সেটিংস থেকে API Key সেট করো।");
      }

      const ai = getGenAI();
      
      let contents;
      if (userMessage.image) {
        // Advanced OCR Pre-processing step
        const processedImage = await preprocessImage(userMessage.image);
        const [mimeTypePart, base64Data] = processedImage.split(';base64,');
        const mimeType = mimeTypePart.split(':')[1] || "image/jpeg";
        
        contents = {
          parts: [
            { text: userMessage.text || "Analyze this mathematical problem and the provided solution steps." },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            }
          ]
        };
      } else {
        contents = userMessage.text;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION
        }
      });

      const modelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || "দুঃখিত, আমি কোনো উত্তর তৈরি করতে পারিনি।",
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, modelMessage]);
    } catch (error: any) {
      console.error("Error generating response:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `দুঃখিত, কোনো সমস্যা হয়েছে।\n\n**ত্রুটি:** ${error.message || "অজানা সমস্যা"}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    setMessages([]);
  };

  return (
    <div className="flex h-screen bg-[#0d1117] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-[#161b22] border-r border-slate-800 transition-transform duration-300 lg:relative lg:translate-x-0",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="flex flex-col h-full p-4">
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
              <Calculator size={22} />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-white">Math <span className="text-blue-400">IDE</span></h1>
          </div>

          <nav className="flex-1 space-y-1">
            <div className="pb-2 px-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">প্রধান মেনু</span>
            </div>
            <button 
              onClick={() => { setActiveTab('chat'); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium",
                activeTab === 'chat' ? "bg-slate-800 text-blue-400" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              <MessageSquare size={18} />
              <span>ওয়ার্কস্পেস</span>
            </button>
            <button 
              onClick={() => { setActiveTab('drawing'); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium",
                activeTab === 'drawing' ? "bg-slate-800 text-blue-400" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              <PenTool size={18} />
              <span>ড্রয়িং বোর্ড</span>
            </button>
            
            <div className="pt-6 pb-2 px-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">রিসোর্স</span>
            </div>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all">
              <History size={18} />
              <span>ইতিহাস</span>
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all">
              <Target size={18} />
              <span>লক্ষ্যসমূহ</span>
            </button>
          </nav>

          <div className="p-4 bg-slate-800/30 rounded-2xl mb-4 border border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-blue-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">সক্রেটিক টিপ</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.p 
                key={activeTipIndex}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-[11px] text-slate-400 leading-relaxed italic"
              >
                "{socraticTips[activeTipIndex]}"
              </motion.p>
            </AnimatePresence>
          </div>

          <button 
            onClick={() => setMessages([])}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-400 hover:bg-rose-900/20 transition-all mt-auto font-medium"
          >
            <Trash2 size={18} />
            <span>সেশন মুছুন</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 bg-[#161b22] border-b border-slate-800 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-slate-800 rounded-lg lg:hidden text-slate-400"
            >
              <ChevronRight size={20} className={isSidebarOpen ? 'rotate-180' : ''} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Teacher Online</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-lg shadow-blue-900/20">
              Save Session
            </button>
            <div className="w-8 h-8 bg-slate-700 rounded-full border border-slate-600"></div>
          </div>
        </header>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
          {/* Left Column: Workspace (Image/Drawing) */}
          <div className={cn(
            "flex flex-col border-r border-slate-800 bg-[#0d1117] overflow-hidden",
            activeTab === 'chat' ? "block" : "hidden lg:block"
          )}>
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#161b22]/50">
              <div className="flex items-center gap-2">
                <ImageIcon size={16} className="text-blue-400" />
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest">অংকের খাতা / ড্রয়িং</h2>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab('chat')}
                  className={cn(
                    "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                    activeTab === 'chat' ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  ইমেজ
                </button>
                <button 
                  onClick={() => setActiveTab('drawing')}
                  className={cn(
                    "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                    activeTab === 'drawing' ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  বোর্ড
                </button>
              </div>
            </div>

            <div className="flex-1 relative overflow-hidden flex flex-col">
              {activeTab === 'chat' ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  {!selectedImage ? (
                    <div className="space-y-6 max-w-sm">
                      <div className="w-20 h-20 bg-slate-800/50 rounded-3xl flex items-center justify-center text-slate-600 border border-slate-700 mx-auto">
                        <Upload size={40} />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white">আপনার অংকের খাতার ছবি আপলোড করুন</h3>
                        <p className="text-slate-500 text-sm">Gemini 1.5 Pro আপনার হাতের লেখা এবং চিত্র বিশ্লেষণ করবে।</p>
                      </div>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full font-bold transition shadow-lg shadow-blue-900/20"
                      >
                        Browse Files
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-full relative p-4 flex items-center justify-center">
                      <img 
                        src={selectedImage} 
                        alt="Math problem" 
                        className="rounded-xl max-h-full w-auto border border-slate-700 shadow-2xl" 
                        referrerPolicy="no-referrer" 
                      />
                      <button 
                        onClick={clearImage}
                        className="absolute top-6 right-6 bg-rose-600 p-2 rounded-full hover:bg-rose-700 text-white shadow-lg"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col bg-[#0d1117]">
                  <div className="h-12 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between px-4">
                    <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg">
                      <button 
                        onClick={() => setTool('pen')}
                        className={cn(
                          "p-1.5 rounded-md transition-all",
                          tool === 'pen' ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                        )}
                      >
                        <PenTool size={14} />
                      </button>
                      <button 
                        onClick={() => setTool('eraser')}
                        className={cn(
                          "p-1.5 rounded-md transition-all",
                          tool === 'eraser' ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                        )}
                      >
                        <Eraser size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={clearDrawing}
                        className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Clear"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button 
                        onClick={exportDrawing}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-blue-700 transition-all shadow-sm"
                      >
                        <Download size={12} />
                        <span>ইমপোর্ট</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 relative overflow-hidden bg-white cursor-crosshair">
                    <Stage
                      width={window.innerWidth / 2}
                      height={window.innerHeight - 160}
                      onMouseDown={handleMouseDown}
                      onMousemove={handleMouseMove}
                      onMouseup={handleMouseUp}
                      ref={stageRef}
                    >
                      <Layer>
                        {lines.map((line, i) => (
                          <Line
                            key={i}
                            points={line.points}
                            stroke="#0f172a"
                            strokeWidth={line.tool === 'eraser' ? 20 : 3}
                            tension={0.5}
                            lineCap="round"
                            lineJoin="round"
                            globalCompositeOperation={
                              line.tool === 'eraser' ? 'destination-out' : 'source-over'
                            }
                          />
                        ))}
                      </Layer>
                    </Stage>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: AI Teacher Feedback */}
          <div className="flex flex-col bg-[#161b22] overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center gap-2 bg-[#1c2128]">
              <MessageSquare className="text-blue-400" size={18} />
              <h2 className="font-bold text-xs text-slate-300 uppercase tracking-widest">AI Teacher Feedback</h2>
            </div>

            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 scroll-smooth"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                  <BrainCircuit size={48} className="text-slate-700" />
                  <p className="text-slate-500 text-sm">অংকটি আপলোড করুন, আমি ধাপে ধাপে চেক করে দেব।</p>
                </div>
              ) : (
                messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-2"
                  >
                    {message.role === 'user' ? (
                      <div className="flex justify-end">
                        <div className="bg-slate-800 text-slate-200 p-3 rounded-2xl rounded-tr-none max-w-[90%] text-sm border border-slate-700">
                          {message.text}
                        </div>
                      </div>
                    ) : (
                      <div className={cn(
                        "p-5 rounded-2xl border w-full",
                        message.text.includes("ভুল শনাক্ত করা হয়েছে") || message.text.includes("Error Detected")
                          ? "bg-blue-900/20 border-blue-800/50" 
                          : "bg-emerald-900/10 border-emerald-800/30"
                      )}>
                        <div className="flex items-center gap-2 mb-3">
                          {message.text.includes("ভুল শনাক্ত করা হয়েছে") || message.text.includes("Error Detected") 
                            ? <AlertCircle size={18} className="text-blue-400" />
                            : <CheckCircle2 size={18} className="text-emerald-400" />
                          }
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest",
                            message.text.includes("ভুল শনাক্ত করা হয়েছে") || message.text.includes("Error Detected")
                              ? "text-blue-400"
                              : "text-emerald-400"
                          )}>
                            {message.text.includes("ভুল শনাক্ত করা হয়েছে") || message.text.includes("Error Detected")
                              ? "ভুল শনাক্ত করা হয়েছে!"
                              : "AI টিউটর ফিডব্যাক"
                            }
                          </span>
                        </div>
                        <div className="markdown-body prose prose-invert max-w-none prose-sm">
                          <ReactMarkdown
                            remarkPlugins={[remarkMath, remarkGfm]}
                            rehypePlugins={[rehypeKatex]}
                          >
                            {message.text}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))
              )}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-2xl">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-4 bg-[#1c2128] border-t border-slate-800">
              <form 
                onSubmit={handleSubmit}
                className="relative flex items-center gap-2"
              >
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="এআই টিউটরকে কিছু জিজ্ঞাসা করুন..." 
                    className="w-full bg-[#0d1117] border border-slate-700 rounded-xl py-3.5 px-4 pr-12 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-all"
                  />
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    <Camera size={20} />
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || (!inputText.trim() && !selectedImage)}
                  className="p-3.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/20"
                >
                  <Send size={20} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .markdown-body p { margin-bottom: 1rem; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body ul, .markdown-body ol { margin-left: 1.5rem; margin-bottom: 1rem; }
        .markdown-body li { margin-bottom: 0.5rem; }
        .markdown-body strong { font-weight: 700; color: #60a5fa; }
        .katex-display { margin: 1rem 0; overflow-x: auto; overflow-y: hidden; }
        .markdown-body code { background: rgba(255,255,255,0.1); padding: 0.2rem 0.4rem; border-radius: 0.25rem; }
      `}</style>
    </div>
  );
}
