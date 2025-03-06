import { useEffect, useState, useRef } from "react";
import "./App.css";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";
import { FiCopy, FiPlay, FiUsers, FiCode, FiLogOut } from "react-icons/fi";

const socket = io("https://realtime-code-editor-final.onrender.com");

const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("// start code here");
  const [copySuccess, setCopySuccess] = useState("");
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState("");
  const [outPut, setOutPut] = useState("");
  const [version, setVersion] = useState("*");
  const [remoteCursors, setRemoteCursors] = useState({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [theme, setTheme] = useState("vs-dark");
  
  const editorRef = useRef(null);
  const decorationsRef = useRef([]);

  // Function to generate a consistent color from a username
  const generateColor = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF)
      .toString(16)
      .toUpperCase();
    return "#" + "00000".substring(0, 6 - c.length) + c;
  };

  // Function to handle editor mounting
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    
    // Set up cursor tracking
    editor.onDidChangeCursorPosition((e) => {
      const position = editor.getPosition();
      socket.emit("cursorMove", {
        roomId,
        userName,
        position: {
          lineNumber: position.lineNumber,
          column: position.column
        }
      });
    });
    
    // Create custom cursor style
    monaco.editor.defineTheme('customTheme', {
      base: theme,
      inherit: true,
      rules: [],
      colors: {
        'editorCursor.foreground': '#FF5733',
        'editor.lineHighlightBackground': '#1E1E1E40',
        'editor.selectionBackground': '#264F78'
      }
    });
    
    editor.updateOptions({
      theme: 'customTheme',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: true,
      cursorWidth: 3
    });
  };

  // Update remote cursors
  const updateRemoteCursors = () => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const monaco = window.monaco;
    
    if (!monaco) return;
    
    // Remove old decorations
    if (decorationsRef.current.length) {
      editor.deltaDecorations(decorationsRef.current, []);
    }
    
    // Create new decorations
    const newDecorations = [];
    
    Object.entries(remoteCursors).forEach(([user, position]) => {
      if (user !== userName && position) {
        const color = generateColor(user);
        
        newDecorations.push({
          range: new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column + 1
          ),
          options: {
            className: 'remoteCursor',
            hoverMessage: { value: user },
            beforeContentClassName: 'remoteCursorLine',
            after: {
              content: ` ${user.slice(0, 6)}`,
              inlineClassName: 'remoteCursorLabel'
            }
          }
        });
        
        // Add cursor style
        const styleEl = document.getElementById(`cursor-style-${user}`) || document.createElement('style');
        styleEl.id = `cursor-style-${user}`;
        styleEl.innerHTML = `
          .remoteCursor[data-user="${user}"] {
            background-color: ${color}40;
          }
          .remoteCursorLine[data-user="${user}"] {
            border-left: 2px solid ${color};
            height: 18px;
          }
          .remoteCursorLabel[data-user="${user}"] {
            background-color: ${color};
            color: white;
            border-radius: 2px;
            padding: 0 4px;
            font-size: 12px;
          }
        `;
        document.head.appendChild(styleEl);
      }
    });
    
    // Apply decorations
    decorationsRef.current = editor.deltaDecorations([], newDecorations);
  };

  useEffect(() => {
    socket.on("userJoined", (users) => {
      setUsers(users);
    });

    socket.on("codeUpdate", (newCode) => {
      setCode(newCode);
    });

    socket.on("userTyping", (user) => {
      setTyping(`${user.slice(0, 8)}... is typing`);
      setTimeout(() => setTyping(""), 2000);
    });

    socket.on("languageUpdate", (newLanguage) => {
      setLanguage(newLanguage);
    });

    socket.on("codeResponse", (response) => {
      setOutPut(response.run.output);
      setIsExecuting(false);
    });
    
    // Add listener for cursor updates
    socket.on("cursorUpdate", ({ userName, position }) => {
      setRemoteCursors(prev => ({
        ...prev,
        [userName]: position
      }));
    });

    return () => {
      socket.off("userJoined");
      socket.off("codeUpdate");
      socket.off("userTyping");
      socket.off("languageUpdate");
      socket.off("codeResponse");
      socket.off("cursorUpdate");
    };
  }, []);

  // Update cursor decorations when remote cursors change
  useEffect(() => {
    updateRemoteCursors();
  }, [remoteCursors]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      socket.emit("leaveRoom");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const joinRoom = () => {
    if (roomId && userName) {
      socket.emit("join", { roomId, userName });
      setJoined(true);
    }
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    setJoined(false);
    setRoomId("");
    setUserName("");
    setCode("// start code here");
    setLanguage("javascript");
    setRemoteCursors({});
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopySuccess("Copied!");
    setTimeout(() => setCopySuccess(""), 2000);
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    socket.emit("codeChange", { roomId, code: newCode });
    socket.emit("typing", { roomId, userName });
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    socket.emit("languageChange", { roomId, language: newLanguage });
  };

  const runCode = () => {
    setIsExecuting(true);
    setOutPut("Executing code...");
    socket.emit("compileCode", { code, roomId, language, version });
  };

  const toggleTheme = () => {
    setTheme(theme === "vs-dark" ? "light" : "vs-dark");
    
    if (editorRef.current) {
      editorRef.current.updateOptions({ theme: theme === "vs-dark" ? "light" : "vs-dark" });
    }
  };

  if (!joined) {
    return (
      <div className="join-container">
        <div className="join-form">
          <div className="logo-container">
            <FiCode className="logo-icon" />
            <h1>CodeCollab</h1>
          </div>
          <p className="join-subtitle">Real-time collaborative code editor</p>
          
          <div className="input-group">
            <label htmlFor="roomId">Room ID</label>
            <input
              id="roomId"
              type="text"
              placeholder="Enter room ID or create new"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="userName">Your Name</label>
            <input
              id="userName"
              type="text"
              placeholder="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>
          
          <button 
            className="join-button"
            onClick={joinRoom}
            disabled={!roomId || !userName}
          >
            Join Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`editor-container ${theme}`}>
      <div className="sidebar">
        <div className="sidebar-header">
          <FiCode className="logo-icon-small" />
          <h2>CodeCollab</h2>
        </div>
        
        <div className="room-info">
          <h3>Room: {roomId}</h3>
          <button onClick={copyRoomId} className="icon-button">
            <FiCopy />
            {copySuccess && <span className="copy-tooltip">{copySuccess}</span>}
          </button>
        </div>
        
        <div className="users-section">
          <div className="section-header">
            <FiUsers />
            <h4>Collaborators</h4>
          </div>
          <ul className="users-list">
            {users.map((user, index) => (
              <li key={index} className="user-item">
                <span 
                  className="user-color" 
                  style={{ backgroundColor: generateColor(user) }}
                ></span>
                <span className="user-name">{user}</span>
              </li>
            ))}
          </ul>
          {typing && <p className="typing-indicator">{typing}</p>}
        </div>
        
        <div className="settings-section">
          <div className="section-header">
            <FiCode />
            <h4>Settings</h4>
          </div>
          
          <div className="settings-control">
            <label htmlFor="language">Language:</label>
            <select
              id="language"
              className="language-selector"
              value={language}
              onChange={handleLanguageChange}
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
              <option value="ruby">Ruby</option>
              <option value="go">Go</option>
            </select>
          </div>
          
          <div className="settings-control">
            <label htmlFor="theme">Theme:</label>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === "vs-dark" ? "Light Mode" : "Dark Mode"}
            </button>
          </div>
        </div>
        
        <button className="leave-button" onClick={leaveRoom}>
          <FiLogOut />
          Leave Room
        </button>
      </div>

      <div className="main-content">
        <div className="editor-wrapper">
          <div className="editor-header">
            <span className="language-badge">{language}</span>
            <button 
              className={`run-btn ${isExecuting ? 'executing' : ''}`} 
              onClick={runCode}
              disabled={isExecuting}
            >
              <FiPlay />
              {isExecuting ? 'Executing...' : 'Execute'}
            </button>
          </div>
          
          <Editor
            height="65%"
            defaultLanguage={language}
            language={language}
            value={code}
            onChange={handleCodeChange}
            theme={theme}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 15 }
            }}
            onMount={handleEditorDidMount}
          />
          
          <div className="output-header">
            <h3>Output</h3>
          </div>
          <div className="output-wrapper">
            <pre className="output-console">{outPut}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;