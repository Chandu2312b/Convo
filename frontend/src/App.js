

import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const SERVER_URL = 'https://convo-39d3.onrender.com';

function App() {
  const [step, setStep] = useState('lobby'); // lobby, chat
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [inputUsername, setInputUsername] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (step === 'chat' && !socketRef.current) {
      socketRef.current = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true
      });
      socketRef.current.emit('join_room', { roomCode, username });
      socketRef.current.on('receive_message', (data) => {
        setMessages((msgs) => [...msgs, { user: data.username, text: data.message }]);
      });
      socketRef.current.on('user_joined', (data) => {
        setMessages((msgs) => [...msgs, { user: 'System', text: `${data.username} joined the room.` }]);
      });
      socketRef.current.on('user_left', (data) => {
        setMessages((msgs) => [...msgs, { user: 'System', text: `A user left the room.` }]);
      });
      socketRef.current.on('error', (data) => {
        const errorMsg = typeof data === 'string' ? data : (data?.message || 'An error occurred');
        setError(errorMsg);
        setSummaryLoading(false);
      });

      // Listen for summary generation events
      socketRef.current.on('summary_generating', () => {
        setSummaryLoading(true);
        setError('');
      });

      socketRef.current.on('summary_generated', (data) => {
        setSummaryLoading(false);
        setSummaryData({
          summary: data.summary,
          keyPoints: data.keyPoints || [],
          actionItems: data.actionItems || [],
          messageCount: data.messageCount || 0
        });
        setShowSummaryModal(true);
      });

      socketRef.current.on('room_closed', () => {
        // Clear summary data and close modal when room is closed
        setSummaryData(null);
        setShowSummaryModal(false);
        setSummaryLoading(false);
      });
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line
  }, [step]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleCreateRoom = async () => {
    if (!inputUsername) return setError('Enter a username');
    setError('');
    const res = await fetch(`${SERVER_URL}/api/create-room`, { method: 'POST' });
    const data = await res.json();
    setRoomCode(data.roomCode);
    setUsername(inputUsername);
    setStep('chat');
  };

  const handleJoinRoom = async () => {
    if (!inputRoomCode || !inputUsername) return setError('Enter room code and username');
    setError('');
    const res = await fetch(`${SERVER_URL}/api/room-exists/${inputRoomCode}`);
    const data = await res.json();
    if (!data.exists) return setError('Room does not exist');
    setRoomCode(inputRoomCode);
    setUsername(inputUsername);
    setStep('chat');
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message) return;
    socketRef.current.emit('send_message', { roomCode, username, message });
    setMessage('');
  };

  const handleGenerateSummary = () => {
    if (summaryLoading) return; // Prevent duplicate clicks

    if (!socketRef.current) {
      setError('Not connected to server');
      return;
    }

    if (messages.length === 0) {
      setError('No messages to summarize');
      return;
    }

    setSummaryLoading(true);
    setError('');
    socketRef.current.emit('generate_summary', { roomCode });
  };

  const handleCopySummary = async () => {
    if (!summaryData) return;

    const summaryText = `Conversation Summary\n\n${summaryData.summary}\n\nKey Points:\n${summaryData.keyPoints.map((point, i) => `${i + 1}. ${point}`).join('\n')}\n\nAction Items:\n${summaryData.actionItems.length > 0 ? summaryData.actionItems.map((item, i) => `${i + 1}. ${item}`).join('\n') : 'None'}`;

    try {
      await navigator.clipboard.writeText(summaryText);
      // Show temporary success feedback
      const copyBtn = document.querySelector('.copy-button');
      if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = '#4caf50';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
        }, 2000);
      }
    } catch (err) {
      setError('Failed to copy summary');
    }
  };

  const handleCloseSummaryModal = () => {
    setShowSummaryModal(false);
    setSummaryData(null);
  };

  if (step === 'lobby') {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="header-content">
            <h1 className="app-title">💬 ChatApp</h1>
            <p className="app-subtitle">Real-time messaging made simple</p>
          </div>
        </header>
        <main className="main-content">
          <div className="lobby-container">
            <div className="lobby-card">
              <h2 className="card-title">Create a Room</h2>
              <p className="card-description">Start a new chat room and invite others</p>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="Enter your username"
                  value={inputUsername}
                  onChange={e => setInputUsername(e.target.value)}
                  className="input-field"
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
                />
                <button onClick={handleCreateRoom} className="btn btn-primary">
                  Create Room
                </button>
              </div>
            </div>
            <div className="divider">
              <span>OR</span>
            </div>
            <div className="lobby-card">
              <h2 className="card-title">Join a Room</h2>
              <p className="card-description">Enter a room code to join an existing chat</p>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="Enter room code"
                  value={inputRoomCode}
                  onChange={e => setInputRoomCode(e.target.value.toUpperCase())}
                  className="input-field"
                  maxLength="6"
                />
                <input
                  type="text"
                  placeholder="Enter your username"
                  value={inputUsername}
                  onChange={e => setInputUsername(e.target.value)}
                  className="input-field"
                  onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
                />
                <button onClick={handleJoinRoom} className="btn btn-secondary">
                  Join Room
                </button>
              </div>
            </div>
            {error && <div className="error-message">{error}</div>}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="chat-header">
        <div className="header-content">
          <div className="room-info">
            <h1 className="room-title">Room: <span className="room-code">{roomCode}</span></h1>
            <p className="room-subtitle">Connected as <span className="username">{username}</span></p>
          </div>
          <button
            onClick={handleGenerateSummary}
            disabled={summaryLoading || messages.length === 0}
            className="btn-summary"
            title="Generate AI summary of conversation"
          >
            {summaryLoading ? (
              <>
                <span className="spinner"></span>
                Generating...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Generate Summary
              </>
            )}
          </button>
        </div>
      </header>
      <main className="chat-main">
        <div className="chat-container">
          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="empty-state">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`message ${msg.user === username ? 'message-own' : msg.user === 'System' ? 'message-system' : 'message-other'}`}>
                  {msg.user !== 'System' && <span className="message-user">{msg.user}</span>}
                  <span className="message-text">{msg.text}</span>
                  <span className="message-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          <form className="message-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              placeholder="Type your message..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="message-input"
            />
            <button type="submit" className="send-button" disabled={!message.trim()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>
        {error && <div className="error-message">{error}</div>}
      </main>

      {/* Summary Modal */}
      {showSummaryModal && summaryData && (
        <div className="modal-overlay" onClick={handleCloseSummaryModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📋 Conversation Summary</h2>
              <button className="modal-close" onClick={handleCloseSummaryModal}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <div className="privacy-note">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                This summary is generated once and not stored.
              </div>

              <div className="summary-section">
                <h3 className="section-title">Summary</h3>
                <p className="section-content">{summaryData.summary}</p>
              </div>

              {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
                <div className="summary-section">
                  <h3 className="section-title">Key Points</h3>
                  <ul className="summary-list">
                    {summaryData.keyPoints.map((point, index) => (
                      <li key={index} className="summary-item">{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {summaryData.actionItems && summaryData.actionItems.length > 0 && (
                <div className="summary-section">
                  <h3 className="section-title">Action Items</h3>
                  <ul className="summary-list action-items">
                    {summaryData.actionItems.map((item, index) => (
                      <li key={index} className="summary-item">{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {summaryData.actionItems && summaryData.actionItems.length === 0 && (
                <div className="summary-section">
                  <h3 className="section-title">Action Items</h3>
                  <p className="section-content no-items">No action items identified in this conversation.</p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button onClick={handleCopySummary} className="copy-button">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy Summary
              </button>
              <button onClick={handleCloseSummaryModal} className="btn-close-modal">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
