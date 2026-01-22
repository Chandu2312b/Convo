require("dotenv").config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://convo-q85p.vercel.app', // Update with your frontend URL
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

// Load Gemini API key from environment variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not found in .env file");
}
console.log("Gemini key loaded:", GEMINI_API_KEY ? "YES" : "NO");


// Initialize Gemini AI client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.0-pro' });

// Safeguards configuration
const MAX_MESSAGES_PER_ROOM = 1000; // Maximum messages allowed per room
const MAX_CHARACTERS_PER_MESSAGE = 5000; // Maximum characters per message
const ROOM_INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
const ROOM_CLEANUP_INTERVAL = 5 * 60 * 1000; // Check for inactive rooms every 5 minutes

// ============================================================================
// IN-MEMORY DATA STRUCTURE
// ============================================================================

/**
 * Rooms data structure:
 * {
 *   [roomCode]: {
 *     users: [{ id: socketId, username: string }],
 *     messages: [
 *       {
 *         username: string,
 *         message: string,
 *         timestamp: number (Date.now())
 *       }
 *     ],
 *     lastActivity: number (Date.now()),
 *     createdAt: number (Date.now())
 *   }
 * }
 */
const rooms = {};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a random 6-character room code
 */
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Validate message before storing
 * Returns { valid: boolean, error?: string }
 */
function validateMessage(message) {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message must be a non-empty string' };
  }
  
  if (message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  
  if (message.length > MAX_CHARACTERS_PER_MESSAGE) {
    return { 
      valid: false, 
      error: `Message exceeds maximum length of ${MAX_CHARACTERS_PER_MESSAGE} characters` 
    };
  }
  
  return { valid: true };
}

/**
 * Check if room has reached message limit
 */
function hasReachedMessageLimit(roomCode) {
  const room = rooms[roomCode];
  return room && room.messages && room.messages.length >= MAX_MESSAGES_PER_ROOM;
}

/**
 * Format messages for Gemini API prompt
 * Converts message array into a readable conversation format
 */
function formatMessagesForPrompt(messages) {
  if (!messages || messages.length === 0) {
    return 'No messages in this conversation.';
  }
  
  return messages.map((msg, index) => {
    const timestamp = new Date(msg.timestamp).toLocaleString();
    return `[${timestamp}] ${msg.username}: ${msg.message}`;
  }).join('\n');
}

/**
 * Generate AI summary using Gemini API
 * Returns structured summary with: summary, keyPoints, actionItems
 */
async function generateSummary(roomCode) {
  const room = rooms[roomCode];
  if (!room || !room.messages || room.messages.length === 0) {
    throw new Error('No messages found in room');
  }

  // Format messages for the prompt
  const conversationText = formatMessagesForPrompt(room.messages);
  
  // Construct the prompt with explicit requirements
  const prompt = `You are analyzing a conversation between two users in a chat room. Please provide a structured summary in the following JSON format:

{
  "summary": "A concise overall summary of the conversation (2-3 sentences)",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "actionItems": ["Action item 1 (if any)", "Action item 2 (if any)"]
}

If there are no action items, return an empty array for "actionItems".

Conversation:
${conversationText}

Please respond with ONLY valid JSON, no additional text or markdown formatting.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse the JSON response
    // Sometimes Gemini wraps JSON in markdown code blocks, so we clean it
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const summaryData = JSON.parse(cleanedText);
    
    // Validate and structure the response
    return {
      summary: summaryData.summary || 'No summary available',
      keyPoints: Array.isArray(summaryData.keyPoints) ? summaryData.keyPoints : [],
      actionItems: Array.isArray(summaryData.actionItems) ? summaryData.actionItems : []
    };
  } catch (error) {
    console.error('Error generating summary:', error);
    throw new Error('Failed to generate summary. Please try again.');
  }
}

/**
 * Clean up room data after summary is generated
 * This ensures privacy - all data is destroyed
 */
function cleanupRoom(roomCode) {
  if (rooms[roomCode]) {
    delete rooms[roomCode];
    console.log(`Room ${roomCode} cleaned up and deleted`);
  }
}

/**
 * Auto-expire inactive rooms
 * Removes rooms that haven't had activity for ROOM_INACTIVITY_TIMEOUT
 */
function expireInactiveRooms() {
  const now = Date.now();
  const expiredRooms = [];
  
  for (const [roomCode, room] of Object.entries(rooms)) {
    if (now - room.lastActivity > ROOM_INACTIVITY_TIMEOUT) {
      expiredRooms.push(roomCode);
    }
  }
  
  expiredRooms.forEach(roomCode => {
    console.log(`Auto-expiring inactive room: ${roomCode}`);
    cleanupRoom(roomCode);
  });
  
  return expiredRooms.length;
}

// ============================================================================
// AUTO-EXPIRATION INTERVAL
// ============================================================================

// Set up interval to check and expire inactive rooms
setInterval(() => {
  const expiredCount = expireInactiveRooms();
  if (expiredCount > 0) {
    console.log(`Expired ${expiredCount} inactive room(s)`);
  }
}, ROOM_CLEANUP_INTERVAL);

// ============================================================================
// HTTP API ENDPOINTS
// ============================================================================

/**
 * Create a new chat room
 * Returns room code for users to join
 */
app.post('/api/create-room', (req, res) => {
  let roomCode;
  do {
    roomCode = generateRoomCode();
  } while (rooms[roomCode]);
  
  // Initialize room with message storage and activity tracking
  rooms[roomCode] = {
    users: [],
    messages: [],
    lastActivity: Date.now(),
    createdAt: Date.now()
  };
  
  res.json({ roomCode });
});

/**
 * Check if a room exists
 */
app.get('/api/room-exists/:roomCode', (req, res) => {
  const { roomCode } = req.params;
  res.json({ exists: !!rooms[roomCode] });
});

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================

io.on('connection', (socket) => {
  /**
   * Handle user joining a room
   */
  socket.on('join_room', ({ roomCode, username }) => {
    if (!rooms[roomCode]) {
      socket.emit('error', { message: 'Room does not exist' });
      return;
    }
    
    socket.join(roomCode);
    rooms[roomCode].users.push({ id: socket.id, username });
    rooms[roomCode].lastActivity = Date.now();
    
    io.to(roomCode).emit('user_joined', { username });
  });

  /**
   * Handle sending messages
   * Stores messages in memory and broadcasts to room
   */
  socket.on('send_message', ({ roomCode, username, message }) => {
    const room = rooms[roomCode];
    
    if (!room) {
      socket.emit('error', { message: 'Room does not exist' });
      return;
    }
    
    // Validate message
    const validation = validateMessage(message);
    if (!validation.valid) {
      socket.emit('error', { message: validation.error });
      return;
    }
    
    // Check message limit
    if (hasReachedMessageLimit(roomCode)) {
      socket.emit('error', { 
        message: `Room has reached maximum message limit of ${MAX_MESSAGES_PER_ROOM}` 
      });
      return;
    }
    
    // Store message in memory
    const messageData = {
      username,
      message: message.trim(),
      timestamp: Date.now()
    };
    
    room.messages.push(messageData);
    room.lastActivity = Date.now();
    
    // Broadcast to all users in the room
    io.to(roomCode).emit('receive_message', { 
      username, 
      message: message.trim() 
    });
  });

  /**
   * Handle summary generation request
   * Generates AI summary and then cleans up room data
   */
  socket.on('generate_summary', async ({ roomCode }) => {
    const room = rooms[roomCode];
    
    if (!room) {
      socket.emit('error', { message: 'Room does not exist' });
      return;
    }
    
    if (!room.messages || room.messages.length === 0) {
      socket.emit('error', { message: 'No messages to summarize' });
      return;
    }
    
    try {
      // Emit loading state
      socket.emit('summary_generating', { roomCode });
      
      // Generate summary using Gemini API
      const summary = await generateSummary(roomCode);
      
      // Send summary to all users in the room
      io.to(roomCode).emit('summary_generated', {
        roomCode,
        summary: summary.summary,
        keyPoints: summary.keyPoints,
        actionItems: summary.actionItems,
        messageCount: room.messages.length
      });
      
      // Clean up room data after a short delay to ensure clients receive the summary
      setTimeout(() => {
        cleanupRoom(roomCode);
        io.to(roomCode).emit('room_closed', { roomCode });
      }, 2000); // 2 second delay for clients to receive summary
      
    } catch (error) {
      console.error('Summary generation error:', error);
      socket.emit('error', { 
        message: error.message || 'Failed to generate summary' 
      });
    }
  });

  /**
   * Handle user disconnection
   */
  socket.on('disconnecting', () => {
    for (const roomCode of socket.rooms) {
      if (rooms[roomCode]) {
        rooms[roomCode].users = rooms[roomCode].users.filter(u => u.id !== socket.id);
        rooms[roomCode].lastActivity = Date.now();
        io.to(roomCode).emit('user_left', { id: socket.id });
      }
    }
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Room inactivity timeout: ${ROOM_INACTIVITY_TIMEOUT / 1000 / 60} minutes`);
  console.log(`Max messages per room: ${MAX_MESSAGES_PER_ROOM}`);
  console.log(`Max characters per message: ${MAX_CHARACTERS_PER_MESSAGE}`);
});
