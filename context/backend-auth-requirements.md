# Backend Authentication Requirements

## Required API Endpoints

The frontend authentication system expects these backend endpoints:

### 1. User Registration
```http
POST /auth/signup
Content-Type: application/json

{
  "username": "string",
  "password": "string", 
  "masterKey": "string"
}

Response (201):
{
  "user": {
    "id": "string",
    "username": "string", 
    "createdAt": "string"
  },
  "token": "string"
}

Error (400/401):
{
  "message": "Invalid master key" | "Username already exists"
}
```

### 2. User Login
```http
POST /auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}

Response (200):
{
  "user": {
    "id": "string",
    "username": "string",
    "createdAt": "string" 
  },
  "token": "string"
}

Error (401):
{
  "message": "Invalid credentials"
}
```

### 3. Token Validation
```http
GET /auth/validate
Authorization: Bearer <token>

Response (200):
{
  "valid": true,
  "user": {
    "id": "string",
    "username": "string",
    "createdAt": "string"
  }
}

Error (401):
{
  "message": "Invalid or expired token"
}
```

### 4. Logout (Optional)
```http
POST /auth/logout
Authorization: Bearer <token>

Response (200):
{
  "message": "Logged out successfully"
}
```

## Database Schema

### User Model
```python
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
import uuid
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)  # bcrypt hash
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Optional fields for future use
    email = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
```

## Environment Variables Required

```bash
# Authentication
MASTER_KEY=your_secure_master_key_here
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRATION_HOURS=24

# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# Optional
BCRYPT_ROUNDS=12
```

## JWT Token Implementation

### Token Generation
```python
import jwt
from datetime import datetime, timedelta
import os

def generate_jwt_token(user_id: str, username: str) -> str:
    payload = {
        'user_id': user_id,
        'username': username,
        'exp': datetime.utcnow() + timedelta(hours=int(os.getenv('JWT_EXPIRATION_HOURS', 24))),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, os.getenv('JWT_SECRET'), algorithm='HS256')

def validate_jwt_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, os.getenv('JWT_SECRET'), algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        raise Exception("Token has expired")
    except jwt.InvalidTokenError:
        raise Exception("Invalid token")
```

### Password Hashing
```python
import bcrypt

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=int(os.getenv('BCRYPT_ROUNDS', 12)))
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
```

## WebSocket Authentication

### Token Validation for WebSocket
```python
from fastapi import WebSocket, HTTPException, Depends
from urllib.parse import parse_qs

async def authenticate_websocket(websocket: WebSocket):
    # Extract token from query parameters
    query_params = parse_qs(str(websocket.url.query))
    token = query_params.get('token', [None])[0]
    
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return None
        
    try:
        payload = validate_jwt_token(token)
        return payload['user_id']
    except Exception as e:
        await websocket.close(code=4001, reason=str(e))
        return None

@app.websocket("/ws/rates")
async def websocket_rates(websocket: WebSocket):
    await websocket.accept()
    
    # Authenticate user
    user_id = await authenticate_websocket(websocket)
    if not user_id:
        return
        
    # Continue with WebSocket logic for authenticated user
    # ... rate streaming logic
```

## Middleware for API Protection

### Authentication Dependency
```python
from fastapi import Depends, HTTPException, Header
from typing import Optional

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
        
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
        
    token = authorization.split(" ")[1]
    
    try:
        payload = validate_jwt_token(token)
        # Fetch user from database using payload['user_id']
        user = get_user_by_id(payload['user_id'])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

# Usage in protected routes
@app.get("/api/rates/current")
async def get_current_rates(current_user = Depends(get_current_user)):
    # Only authenticated users can access this endpoint
    return get_rates_for_user(current_user.id)
```

## Error Handling

### Standard Error Responses
```python
from fastapi import HTTPException

# Authentication errors
raise HTTPException(status_code=401, detail="Invalid credentials")
raise HTTPException(status_code=401, detail="Token has expired") 
raise HTTPException(status_code=401, detail="Invalid master key")
raise HTTPException(status_code=409, detail="Username already exists")

# Server errors
raise HTTPException(status_code=500, detail="Authentication service unavailable")
```

## Implementation Priority

### Phase 1 (Immediate)
1. ✅ User model and database table
2. ✅ `/auth/signup` endpoint with master key validation
3. ✅ `/auth/login` endpoint with password verification
4. ✅ JWT token generation and validation
5. ✅ Authentication middleware for API protection

### Phase 2 (Next)
1. WebSocket authentication with token validation
2. Token refresh mechanism
3. User management endpoints
4. Audit logging for authentication events

### Phase 3 (Future)
1. Password reset functionality
2. Multi-factor authentication
3. Rate limiting for auth endpoints
4. Session management and monitoring

## Testing Authentication

### Manual Testing Sequence
```bash
# 1. Test signup
curl -X POST http://localhost:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "securepass123", 
    "masterKey": "super_secret_master_key_123!"
  }'

# 2. Test login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "securepass123"
  }'

# 3. Test protected endpoint (use token from login response)
curl -X GET http://localhost:8000/api/rates/current \
  -H "Authorization: Bearer <token>"

# 4. Test WebSocket (use browser or wscat)
wscat -c "ws://localhost:8000/ws/rates?token=<token>"
```