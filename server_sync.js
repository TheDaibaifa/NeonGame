import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const rooms = {}; // { roomCode: { p1: ws, p2: ws, p3: ws, p4: ws, inputs: { p1: {}, p2: {}, p3: {}, p4: {} } } }

function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms[code]);
    return code;
}

wss.on('connection', (ws) => {
    let currentRoom = null;
    let currentSlot = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'CREATE_ROOM') {
                const roomCode = generateRoomCode();
                rooms[roomCode] = { 
                    p1: ws, p2: null, p3: null, p4: null,
                    inputs: { p1: {}, p2: {}, p3: {}, p4: {} } 
                };
                currentRoom = roomCode;
                currentSlot = 'p1';
                ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomCode }));
                console.log(`[ROOM] Created ${roomCode}`);
            } 
            else if (data.type === 'JOIN_ROOM') {
                const roomCode = data.roomCode;
                const room = rooms[roomCode];
                if (!room) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'ROOM_NOT_FOUND' }));
                    return;
                }
                let slot = !room.p2 ? 'p2' : (!room.p3 ? 'p3' : (!room.p4 ? 'p4' : null));
                if (!slot) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'ROOM_FULL' }));
                    return;
                }
                room[slot] = ws;
                currentRoom = roomCode;
                currentSlot = slot;
                ws.send(JSON.stringify({ type: 'JOINED', slot, roomCode }));
                if (room.p1) room.p1.send(JSON.stringify({ type: 'PLAYER_JOINED', slot }));
                console.log(`[JOIN] Client joined ${roomCode} as ${slot}`);
            }
            else if (data.type === 'INPUT') {
                // High-speed input update
                if (currentRoom && rooms[currentRoom]) {
                    rooms[currentRoom].inputs[currentSlot] = data.keys;
                }
            }
            else if (data.type === 'START_GAME') {
                if (currentSlot === 'p1' && currentRoom) {
                    const room = rooms[currentRoom];
                    const startPacket = JSON.stringify({ type: 'LOAD_GAME', gameKey: data.gameKey, mods: data.mods });
                    if (room.p1) room.p1.send(startPacket);
                    if (room.p2) room.p2.send(startPacket);
                    if (room.p3) room.p3.send(startPacket);
                    if (room.p4) room.p4.send(startPacket);
                }
            }
            else if (data.type === 'EXIT_GAME') {
                if (currentSlot === 'p1' && currentRoom) {
                    const room = rooms[currentRoom];
                    const exitPacket = JSON.stringify({ type: 'EXIT_GAME' });
                    if (room.p1) room.p1.send(exitPacket);
                    if (room.p2) room.p2.send(exitPacket);
                    if (room.p3) room.p3.send(exitPacket);
                    if (room.p4) room.p4.send(exitPacket);
                }
            }
            else if (data.type === 'STATE') {
                // Relay authoritative game state from host to all clients
                if (currentSlot === 'p1' && currentRoom) {
                    const room = rooms[currentRoom];
                    const statePacket = JSON.stringify(data);
                    if (room.p2) room.p2.send(statePacket);
                    if (room.p3) room.p3.send(statePacket);
                    if (room.p4) room.p4.send(statePacket);
                }
            }
        } catch (e) {
            console.error('Packet Error:', e);
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            if (currentSlot === 'p1') {
                const msg = JSON.stringify({ type: 'DISCONNECTED', reason: 'HOST_LEFT' });
                if (room.p2) { room.p2.send(msg); room.p2.close(); }
                if (room.p3) { room.p3.send(msg); room.p3.close(); }
                if (room.p4) { room.p4.send(msg); room.p4.close(); }
                delete rooms[currentRoom];
            } else {
                room[currentSlot] = null;
                if (room.p1) room.p1.send(JSON.stringify({ type: 'PLAYER_LEFT', slot: currentSlot }));
            }
        }
    });
});

// Broadcast inputs at 60hz
setInterval(() => {
    for (const roomCode in rooms) {
        const room = rooms[roomCode];
        const inputPacket = JSON.stringify({
            type: 'INPUT_SYNC',
            inputs: room.inputs
        });
        if (room.p1) room.p1.send(inputPacket);
        if (room.p2) room.p2.send(inputPacket);
        if (room.p3) room.p3.send(inputPacket);
        if (room.p4) room.p4.send(inputPacket);
    }
}, 1000 / 60);

console.log('=============================================');
console.log('  SYNC-SIM INPUT SERVER ACTIVE (Port 8080)   ');
console.log('=============================================');
