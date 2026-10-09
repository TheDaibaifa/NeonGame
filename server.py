#!/usr/bin/env python3
"""
DUEL NEON // Asynchronous Python WebSocket Signaling & Relay Server
Authoritative Host-Client routing for 2-4 players.
"""

import asyncio
import json
import random
import sys

try:
    import websockets
except ImportError:
    print("Error: The 'websockets' library is required to run this server.")
    print("Please install it on your VPS using: pip install websockets")
    sys.exit(1)

# Room storage: { room_code: { "host": websocket_conn, "clients": { "p2": ws_conn, "p3": ws_conn, "p4": ws_conn } } }
rooms = {}

async def relay_handler(websocket, path="/"):
    assigned_room = None
    assigned_role = None  # "HOST", "p2", "p3", or "p4"

    try:
        async for message in websocket:
            try:
                packet = json.loads(message)
            except json.JSONDecodeError:
                continue

            packet_type = packet.get("type")

            if packet_type == "CREATE_ROOM":
                # Generate unique 4-digit room code
                room_code = str(random.randint(1000, 9999))
                while room_code in rooms:
                    room_code = str(random.randint(1000, 9999))

                rooms[room_code] = {
                    "host": websocket,
                    "clients": {
                        "p2": None,
                        "p3": None,
                        "p4": None
                    }
                }
                assigned_room = room_code
                assigned_role = "HOST"
                
                await websocket.send(json.dumps({
                    "type": "ROOM_CREATED",
                    "roomCode": room_code
                }))
                print(f"[ROOM] Created room {room_code}")

            elif packet_type == "JOIN_ROOM":
                room_code = packet.get("roomCode")
                if room_code not in rooms:
                    await websocket.send(json.dumps({
                        "type": "ERROR",
                        "message": "ROOM_NOT_FOUND"
                    }))
                    print(f"[JOIN] Room {room_code} not found")
                    continue

                room = rooms[room_code]
                
                # Check for available slot (P2 first, then P3, then P4)
                slot = None
                if room["clients"]["p2"] is None:
                    slot = "p2"
                elif room["clients"]["p3"] is None:
                    slot = "p3"
                elif room["clients"]["p4"] is None:
                    slot = "p4"

                if slot is None:
                    await websocket.send(json.dumps({
                        "type": "ERROR",
                        "message": "ROOM_FULL"
                    }))
                    print(f"[JOIN] Room {room_code} is full")
                    continue

                # Add client to room
                room["clients"][slot] = websocket
                assigned_room = room_code
                assigned_role = slot

                # Confirm join to client
                await websocket.send(json.dumps({
                    "type": "JOINED",
                    "slot": slot,
                    "roomCode": room_code
                }))

                # Notify Host
                await room["host"].send(json.dumps({
                    "type": "PLAYER_JOINED",
                    "slot": slot
                }))
                print(f"[JOIN] Client joined room {room_code} as {slot}")

            # RELAYING PACKETS:
            elif assigned_room and assigned_room in rooms:
                room = rooms[assigned_room]
                
                if assigned_role == "HOST":
                    # Host broadcasts state to active clients
                    targets = packet.get("target")  # Optional specific target
                    state_packet_str = json.dumps(packet)
                    
                    if targets == "p2" and room["clients"]["p2"]:
                        await room["clients"]["p2"].send(state_packet_str)
                    elif targets == "p3" and room["clients"]["p3"]:
                        await room["clients"]["p3"].send(state_packet_str)
                    elif targets == "p4" and room["clients"]["p4"]:
                        await room["clients"]["p4"].send(state_packet_str)
                    else:
                        # Broadcast to all active clients
                        for slot in ["p2", "p3", "p4"]:
                            client_ws = room["clients"][slot]
                            if client_ws:
                                try:
                                    await client_ws.send(state_packet_str)
                                except Exception:
                                    pass

                else:
                    # Client sends input packet to Host, tag which slot sent it
                    packet["slot"] = assigned_role
                    try:
                        await room["host"].send(json.dumps(packet))
                    except Exception:
                        pass

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        # Graceful cleanup on client/host disconnect
        if assigned_room and assigned_room in rooms:
            room = rooms[assigned_room]
            if assigned_role == "HOST":
                # Close entire room, disconnect all clients
                print(f"[ROOM] Host disconnected. Closing room {assigned_room}")
                for slot in ["p2", "p3", "p4"]:
                    client_ws = room["clients"][slot]
                    if client_ws:
                        try:
                            await client_ws.send(json.dumps({"type": "DISCONNECTED", "reason": "HOST_LEFT"}))
                            await client_ws.close()
                        except Exception:
                            pass
                rooms.pop(assigned_room, None)
            else:
                # Client disconnected, notify Host and free slot
                print(f"[ROOM] Client {assigned_role} disconnected from room {assigned_room}")
                room["clients"][assigned_role] = None
                try:
                    await room["host"].send(json.dumps({
                        "type": "PLAYER_LEFT",
                        "slot": assigned_role
                    }))
                except Exception:
                    pass

async def main():
    port = 8080
    async with websockets.serve(relay_handler, "0.0.0.0", port):
        print(f"=============================================")
        print(f"  DUEL NEON RELAY SERVER ACTIVE              ")
        print(f"  Listening on: ws://0.0.0.0:{port}           ")
        print(f"=============================================")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer shut down gracefully.")
