/**
 * DUEL NEON // Native HTML5 WebSocket Netplay Manager
 * Replaces PeerJS entirely with pure WebSocket relay connections.
 */
class NetworkManager {
  constructor() {
    this.ws = null;
    
    this.role = null; // 'HOST' or 'CLIENT'
    this.roomCode = null;
    this.isConnected = false;
    
    // Star topology slots (P2, P3 and P4 mappings) for Host
    this.slots = {
      p2: false,
      p3: false,
      p4: false
    };

    // Callbacks bound by main.js
    this.onStatusChange = null;
    this.onConnectionEstablished = null;
    this.onConnectionLost = null;
    this.onMessageReceived = null;
  }

  /**
   * Helper to dynamically build WebSocket URL based on current page URL.
   */
  getSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname; // Use the hostname of the server providing the files
    return `${protocol}//${host}:8080`;
  }

  /**
   * Initializes host mode. Connects to the VPS relay server and requests a new room.
   */
  hostGame(onCodeReady) {
    this.disconnect();
    this.role = 'HOST';
    this.slots = { p2: false, p3: false, p4: false };

    const url = this.getSocketUrl();
    this.updateStatus("CONNECTING TO VPS...", "orange");

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        // Request a new room
        this.sendWS({ type: "CREATE_ROOM" });
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "ROOM_CREATED") {
          this.roomCode = data.roomCode;
          this.isConnected = true;
          this.updateStatus("LOBBY OPEN (WAITING FOR PLAYERS)", "cyan");
          if (onCodeReady) onCodeReady(data.roomCode);
          if (this.onConnectionEstablished) {
            this.onConnectionEstablished();
          }
        } else if (data.type === "PLAYER_JOINED") {
          const slot = data.slot;
          this.slots[slot] = true;
          console.log(`[NET] Player joined slot: ${slot}`);
          
          // Re-evaluate net status message depending on slots filled
          const activeSlots = Object.keys(this.slots).filter(s => this.slots[s]);
          this.updateStatus(`CONNECTED CLIENTS: ${activeSlots.map(s => s.toUpperCase()).join(", ")}`, "green");

          if (this.onMessageReceived) {
            this.onMessageReceived({ type: "PLAYER_CONNECTED", slot });
          }
        } else if (data.type === "PLAYER_LEFT") {
          const slot = data.slot;
          this.slots[slot] = false;
          console.log(`[NET] Player left slot: ${slot}`);

          const activeSlots = Object.keys(this.slots).filter(s => this.slots[s]);
          if (activeSlots.length > 0) {
            this.updateStatus(`CONNECTED CLIENTS: ${activeSlots.map(s => s.toUpperCase()).join(", ")}`, "green");
          } else {
            this.updateStatus("LOBBY OPEN (WAITING FOR PLAYERS)", "cyan");
          }

          if (this.onMessageReceived) {
            this.onMessageReceived({ type: "PLAYER_DISCONNECTED", slot });
          }
        } else if (data.type === 'INPUT_SYNC') {
          // These are the synchronized inputs for all players in the room
          if (this.onMessageReceived) {
            this.onMessageReceived(data);
          }
        } else if (data.type === 'STATE' || data.type === 'EXIT_GAME' || data.type === 'LOAD_GAME' || data.type === 'START_GAME') {
          // Relayed state frames (if still used for specific events)
          if (this.onMessageReceived) {
            this.onMessageReceived(data);
          }
        }
      };

      this.ws.onclose = () => {
        this.handleDisconnect();
      };

      this.ws.onerror = (err) => {
        console.error("Host socket error:", err);
        this.updateStatus("VPS SERVER OFFLINE", "red");
        this.handleDisconnect();
      };

    } catch (e) {
      console.error("Failed to host WebSocket server:", e);
      this.updateStatus("HOST INITIALISE FAILED", "red");
    }
  }

  /**
   * Initializes client mode and requests connection to a Room Code.
   */
  joinGame(code) {
    if (!code || code.length !== 4) {
      this.updateStatus("INVALID CODE", "red");
      return;
    }

    this.disconnect();
    this.role = 'CLIENT';
    this.roomCode = code;

    const url = this.getSocketUrl();
    this.updateStatus("CONNECTING TO VPS...", "orange");

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        // Handshake to join specific room
        this.sendWS({
          type: "JOIN_ROOM",
          roomCode: code
        });
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "JOINED") {
          this.isConnected = true;
          const assignedSlot = data.slot;
          this.updateStatus(`CONNECTED AS ${assignedSlot.toUpperCase()}`, "green");

          if (this.onConnectionEstablished) {
            this.onConnectionEstablished(assignedSlot);
          }
        } else if (data.type === "ERROR") {
          if (data.message === "ROOM_NOT_FOUND") {
            this.updateStatus("ROOM NOT FOUND", "red");
          } else if (data.message === "ROOM_FULL") {
            this.updateStatus("ROOM FULL", "red");
          } else {
            this.updateStatus("CONNECTION FAILED", "red");
          }
          this.disconnect();
        } else if (data.type === "DISCONNECTED") {
          this.updateStatus("HOST SHUTDOWN LOBBY", "grey");
          this.handleDisconnect();
        } else if (data.type === 'INPUT_SYNC') {
          // These are the synchronized inputs for all players in the room
          if (this.onMessageReceived) {
            this.onMessageReceived(data);
          }
        } else if (data.type === 'STATE' || data.type === 'EXIT_GAME' || data.type === 'LOAD_GAME' || data.type === 'START_GAME') {
          // Relayed state frames (if still used for specific events)
          if (this.onMessageReceived) {
            this.onMessageReceived(data);
          }
        }
      };

      this.ws.onclose = () => {
        this.handleDisconnect();
      };

      this.ws.onerror = (err) => {
        console.error("Client socket error:", err);
        this.updateStatus("VPS SERVER OFFLINE", "red");
        this.handleDisconnect();
      };

    } catch (e) {
      console.error("Failed to join WebSocket server:", e);
      this.updateStatus("JOIN INITIALISE FAILED", "red");
    }
  }

  /**
   * Helper to send JSON strings over WebSocket.
   */
  sendWS(packet) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(jsonSafeStringify(packet));
    }
  }

  /**
   * Emits network frames. Relays via central VPS server.
   */
  send(packet) {
    this.sendWS(packet);
  }

  handleDisconnect() {
    this.isConnected = false;
    const oldRole = this.role;
    this.role = null;
    this.roomCode = null;
    this.slots = { p2: false, p3: false, p4: false };

    this.updateStatus("LOBBY DISCONNECTED", "grey");
    
    if (this.onConnectionLost) {
      this.onConnectionLost(oldRole);
    }
  }

  disconnect() {
    this.isConnected = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.role = null;
    this.roomCode = null;
    this.slots = { p2: false, p3: false, p4: false };
  }

  /**
   * UI status glow helper text updates.
   */
  updateStatus(message, colorClass) {
    if (this.onStatusChange) {
      this.onStatusChange(message, colorClass);
    }
  }
}

/**
 * Fast JSON serializer with fallback for safety.
 */
function jsonSafeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    // Fallback: strip circular references only if plain stringify fails
    const cache = new Set();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) return;
        cache.add(value);
      }
      return value;
    });
  }
}

export const network = new NetworkManager();
export default network;
