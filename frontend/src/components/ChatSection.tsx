import React, { useState, useEffect, useRef } from "react";
import { FaMicrophone, FaStop } from "react-icons/fa"; // Import microphone and stop icons

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSectionProps {
  messages: Message[];
  onSendMessage: (message: string) => Promise<void>;
  loading: boolean;
}

// Configuration for recording
const MAX_RECORDING_DURATION_SECONDS = 15; // Auto-stop after 15 seconds (fallback)

// NEW: Silence Detection Configuration
const SILENCE_THRESHOLD = 0.05; // Adjust this value (0.01 to 0.1 typically) based on microphone and ambient noise
const SILENCE_TIMEOUT_MS = 1500; // 1.5 seconds of silence to stop recording
const AUDIO_MONITOR_INTERVAL_MS = 100; // How often to check audio levels

const ChatSection: React.FC<ChatSectionProps> = ({
  messages,
  onSendMessage,
  loading,
}) => {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recordingTimeoutRef = useRef<number | null>(null); // For max duration auto-stop
  const audioStreamRef = useRef<MediaStream | null>(null); // To stop media stream tracks

  // NEW: Web Audio API Refs for Silence Detection
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silenceDetectionIntervalRef = useRef<number | null>(null); // For the VAD monitoring loop
  const silenceDurationRef = useRef<number>(0); // Tracks consecutive silent intervals

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    if (input.trim() === "") return;
    await onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // NEW: Function to monitor audio for silence
  const monitorAudioForSilence = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(dataArray); // Get waveform data

    // Calculate RMS (Root Mean Square) as a measure of loudness
    let sumSquares = 0;
    for (const amplitude of dataArray) {
      const normalizedAmplitude = (amplitude - 128) / 128; // Normalize to -1.0 to 1.0
      sumSquares += normalizedAmplitude * normalizedAmplitude;
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);

    // console.log("RMS:", rms); // For debugging: log audio levels

    if (rms < SILENCE_THRESHOLD) {
      silenceDurationRef.current += AUDIO_MONITOR_INTERVAL_MS;
      if (silenceDurationRef.current >= SILENCE_TIMEOUT_MS) {
        console.log("Silence detected. Stopping recording automatically.");
        stopRecording(); // Automatically stop if silence exceeds timeout
      }
    } else {
      silenceDurationRef.current = 0; // Reset silence duration if sound is detected
    }
  };

  // --- Speech Recognition Logic ---
  const startRecording = async () => {
    if (isRecording) return;
    if (isTranscribing) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // NEW: Web Audio API setup for VAD
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      microphoneStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(stream);

      microphoneStreamSourceRef.current.connect(analyserRef.current);
      // Connect analyser to destination (speakers) if you want to hear your own mic input,
      // otherwise, omit this for pure analysis or privacy. For VAD, it's not strictly needed.
      // analyserRef.current.connect(audioContextRef.current.destination);

      // Start monitoring for silence
      silenceDurationRef.current = 0; // Reset silence counter
      silenceDetectionIntervalRef.current = setInterval(
        monitorAudioForSilence,
        AUDIO_MONITOR_INTERVAL_MS
      );

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        // Clear max duration timeout if it exists
        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }

        // NEW: Clean up Web Audio API resources
        if (silenceDetectionIntervalRef.current) {
          clearInterval(silenceDetectionIntervalRef.current);
          silenceDetectionIntervalRef.current = null;
        }
        if (microphoneStreamSourceRef.current) {
          microphoneStreamSourceRef.current.disconnect();
          microphoneStreamSourceRef.current = null;
        }
        if (analyserRef.current) {
          analyserRef.current.disconnect();
          analyserRef.current = null;
        }
        if (audioContextRef.current) {
          await audioContextRef.current.close(); // Close the audio context
          audioContextRef.current = null;
        }

        // Stop all tracks in the stream to release microphone
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null; // Clear stream ref
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log("Recording stopped. Sending audio blob to backend.");
        await sendAudioToBackend(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setInput("");
      console.log("Recording started...");

      // Set max-duration auto-stop timeout as a fallback
      recordingTimeoutRef.current = setTimeout(() => {
        console.log("Max recording duration reached. Stopping recording automatically.");
        stopRecording();
      }, MAX_RECORDING_DURATION_SECONDS * 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Error accessing microphone. Please ensure it's connected and permissions are granted.");
      setIsRecording(false);
      // Ensure all resources are cleaned up on error as well
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      if (silenceDetectionIntervalRef.current) {
        clearInterval(silenceDetectionIntervalRef.current);
        silenceDetectionIntervalRef.current = null;
      }
      if (microphoneStreamSourceRef.current) {
          microphoneStreamSourceRef.current.disconnect();
          microphoneStreamSourceRef.current = null;
      }
      if (analyserRef.current) {
          analyserRef.current.disconnect();
          analyserRef.current = null;
      }
      if (audioContextRef.current) {
          await audioContextRef.current.close();
          audioContextRef.current = null;
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsTranscribing(true);
      setInput("Transcribing...");
    }
  };

  const sendAudioToBackend = async (audioBlob: Blob) => {
    try {
      const wavBlob = await convertWebmToWav(audioBlob);
      
      const response = await fetch('http://localhost:8000/speech_to_text', {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
        },
        body: wavBlob,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('STT Error:', errorData.detail);
        alert(`Speech-to-text failed: ${errorData.detail}`);
        setInput("");
        return;
      }

      const data = await response.json();
      const transcribedText = data.text;
      console.log('Transcribed Text:', transcribedText);

      if (transcribedText) {
        // setInput(transcribedText);
        await onSendMessage(transcribedText);
        setInput("");
      } else {
        alert("Could not transcribe speech. Please try again.");
        setInput("");
      }
    } catch (error) {
      console.error('Error converting audio or sending to STT:', error);
      alert('Failed to process speech. Please check your microphone and network.');
      setInput("");
    } finally {
      setIsTranscribing(false);
    }
  };

  // Cleanup all resources on component unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop(); // This will trigger onstop and its cleanup
      } else { // If not recording, manually clean up
        if (silenceDetectionIntervalRef.current) {
            clearInterval(silenceDetectionIntervalRef.current);
        }
        if (microphoneStreamSourceRef.current) {
            microphoneStreamSourceRef.current.disconnect();
        }
        if (analyserRef.current) {
            analyserRef.current.disconnect();
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
        if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach(track => track.stop());
        }
      }
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    };
  }, []);


  return (
    <div className="flex flex-col flex-grow p-4 bg-gray-900 h-full max-h-[90%]">
      <div className="flex-grow overflow-y-auto mb-4 max-h-full flex flex-col">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-2 p-3 rounded-lg break-words ${
              msg.role === "user"
                ? "bg-blue-600 text-white self-end text-left max-w-xl mr-2"
                : "bg-gray-700 text-white self-start text-left max-w-xl"
            }`}
            style={{ width: "fit-content" }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="mb-2 p-3 rounded-lg max-w-xl bg-gray-700 self-start animate-pulse text-left">
            <div className="text-white">Generating answer...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex items-center">
        {/* Microphone/Stop Button */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={loading || isTranscribing}
          className={`mr-2 w-12 h-12 flex items-center justify-center rounded-full text-white text-xl
            ${isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700'}
            disabled:opacity-50`}
          title={isRecording ? "Stop Recording" : "Start Recording"}
        >
          {isRecording ? <FaStop /> : <FaMicrophone />}
        </button>
        <textarea
          value={isTranscribing ? "Transcribing..." : input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message or click microphone..."
          className="flex-grow p-2 rounded bg-gray-800 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-white h-12"
          disabled={isRecording || loading || isTranscribing}
        />
        <button
          onClick={handleSend}
          disabled={loading || input.trim() === "" || isTranscribing}
          className="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatSection;

// Helper function to convert WebM Blob to WAV Blob (no changes here)
async function convertWebmToWav(audioBlob: Blob): Promise<Blob> {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numOfChan = audioBuffer.numberOfChannels;
    const rate = audioBuffer.sampleRate;
    const len = audioBuffer.length;
    const buffer = new Float32Array(len * numOfChan);
    for (let channel = 0; channel < numOfChan; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < len; i++) {
            buffer[i * numOfChan + channel] = channelData[i];
        }
    }

    const encodeWAV = (samples: Float32Array, numChannels: number, sampleRate: number) => {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        let pos = 0;

        function writeString(s: string) {
            for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i));
        }
        function writeUint32(d: number) { view.setUint32(pos, d, true); pos += 4; }
        function writeUint16(d: number) { view.setUint16(pos, d, true); pos += 2; }

        writeString('RIFF');
        writeUint32(36 + samples.length * 2);
        writeString('WAVE');
        writeString('fmt ');
        writeUint32(16);
        writeUint16(1); // PCM
        writeUint16(numChannels);
        writeUint32(sampleRate);
        writeUint32(sampleRate * numChannels * 2); // Byte rate
        writeUint16(numChannels * 2); // Block align
        writeUint16(16); // Bits per sample
        writeString('data');
        writeUint32(samples.length * 2);

        for (let i = 0; i < samples.length; i++, pos += 2) {
            let s = Math.max(-1, Math.min(1, samples[i]));
            s = s < 0 ? s * 0x8000 : s * 0x7FFF; // Convert float to 16-bit PCM
            view.setInt16(pos, s, true);
        }
        return buffer;
    };

    const wavBuffer = encodeWAV(buffer, numOfChan, rate);
    return new Blob([wavBuffer], { type: 'audio/wav' });
}