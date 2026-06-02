#!/usr/bin/env python3
"""
Test script to debug CSV Bullion WebSocket connection
"""
import asyncio
import aiohttp
import json

async def test_csv_websocket():
    """Test CSV Bullion WebSocket connection"""
    
    print("Testing CSV Bullion WebSocket...")
    
    # Try different WebSocket URLs
    urls = [
        "wss://csvbullion.com:10001/socket.io/?transport=websocket",
        "wss://csvbullion.com/socket.io/?transport=websocket", 
        "ws://csvbullion.com:10001/socket.io/?transport=websocket"
    ]
    
    for url in urls:
        print(f"\n🔍 Testing URL: {url}")
        try:
            async with aiohttp.ClientSession() as session:
                async with session.ws_connect(
                    url,
                    timeout=10,
                    headers={
                        'Origin': 'https://csvbullion.com',
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                    }
                ) as ws:
                    print("✅ Connected successfully")
                    
                    # Try different handshake patterns
                    handshakes = [
                        "2probe",
                        "40",
                        '42["client","csvbullion"]',
                        "ping"
                    ]
                    
                    for handshake in handshakes:
                        print(f"📤 Sending: {handshake}")
                        await ws.send_str(handshake)
                        
                        try:
                            response = await asyncio.wait_for(ws.receive(), timeout=3)
                            if response.type == aiohttp.WSMsgType.TEXT:
                                print(f"📥 Received: {response.data}")
                            else:
                                print(f"📥 Received non-text: {response.type}")
                        except asyncio.TimeoutError:
                            print("⏰ No response (timeout)")
                        
                        await asyncio.sleep(0.5)
                    
                    # Listen for any incoming messages
                    print("👂 Listening for messages...")
                    for i in range(10):
                        try:
                            msg = await asyncio.wait_for(ws.receive(), timeout=1)
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                print(f"📨 Incoming message: {msg.data}")
                        except asyncio.TimeoutError:
                            continue
                        except Exception as e:
                            print(f"❌ Error: {e}")
                            break
                    
                    break  # Success, no need to try other URLs
                    
        except Exception as e:
            print(f"❌ Failed to connect: {e}")
    
    print("\n🏁 Test complete")

if __name__ == "__main__":
    asyncio.run(test_csv_websocket())