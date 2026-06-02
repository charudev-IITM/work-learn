# Authentication System

## Overview

Complete JWT-based authentication system with master key signup restriction and user-specific data isolation.

## Architecture

### Frontend Authentication Flow
```
User -> AuthPage -> AuthGuard -> WatchlistApp
      (login/signup)  (token validation)  (protected content)
```

### Key Components

#### Core Authentication
- **AuthContext** (`/src/contexts/AuthContext.tsx`) - Global auth state with useReducer
- **AuthService** (`/src/services/auth.ts`) - JWT token management & API client
- **AuthGuard** (`/src/components/auth/AuthGuard.tsx`) - Route protection wrapper

#### UI Components
- **AuthPage** (`/src/components/auth/AuthPage.tsx`) - Main auth interface
- **LoginForm** (`/src/components/auth/LoginForm.tsx`) - Mobile-first login
- **SignupForm** (`/src/components/auth/SignupForm.tsx`) - Master key validation
- **UserHeader** (`/src/components/auth/UserHeader.tsx`) - User profile & logout

## Security Features

### Master Key Signup
- Environment variable: `MASTER_KEY=super_secret_master_key_123!`
- Required for account creation
- Server-side validation prevents unauthorized signups

### JWT Token Management
- Automatic token refresh on expiry
- Bearer token authentication for all API calls
- Secure localStorage with user-specific keys
- Auto-logout on 401 responses

### User Data Isolation
```typescript
// User-specific localStorage keys
const getStorageKey = (userId: string, key: string) => `comp-intel-${userId}-${key}`

// Examples:
// comp-intel-user123-watchlists
// comp-intel-user123-settings
// comp-intel-user456-watchlists
```

## Authentication States

### Auth State Management
```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
```

### User Flow States
1. **Loading** - Validating existing token on app startup
2. **Unauthenticated** - Show AuthPage with login/signup
3. **Authenticated** - Show protected WatchlistApp
4. **Error** - Display authentication error with retry

## Integration Points

### WebSocket Authentication
```typescript
// Token passed as URL parameter
const wsUrl = `ws://localhost:8000/ws/rates?token=${authToken}`
```

### API Authentication
```typescript
// All API calls include Bearer token
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

### Protected Routes
```typescript
// App.tsx integration
<AuthProvider>
  <AuthGuard>
    <WatchlistDataProvider>
      <WatchlistProvider>
        <WatchlistAppWrapper />
      </WatchlistProvider>
    </WatchlistDataProvider>
  </AuthGuard>
</AuthProvider>
```

## Mobile-First Design

### Touch Targets
- Minimum 44px height for all interactive elements
- Large form fields (h-12 = 48px)
- Proper spacing for thumb navigation

### Form Optimization
- `inputMode="text"` for username fields
- `autoCapitalize="none"` for usernames
- Password visibility toggles
- Real-time validation feedback

### Visual Hierarchy
- Progressive disclosure for complex forms
- Clear error messaging
- Loading states with proper feedback
- Responsive breakpoints for all screen sizes

## Configuration

### Development Setup
```bash
# .env file
MASTER_KEY=super_secret_master_key_123!
JWT_SECRET=dev_jwt_secret_456!
VITE_API_BASE_URL=http://localhost:8000
```

### Production Setup
```bash
# Generate secure keys
openssl rand -base64 32  # for MASTER_KEY
openssl rand -base64 64  # for JWT_SECRET
```

### Environment Variables
- `MASTER_KEY` - Required for signup validation
- `JWT_SECRET` - Token signing secret
- `VITE_API_BASE_URL` - Backend API endpoint

## Error Handling

### Client-Side Errors
- Network failures with retry logic
- Token expiry with automatic refresh
- Form validation with real-time feedback
- User-friendly error messages

### Server Integration Points
- `POST /auth/login` - Username/password authentication
- `POST /auth/signup` - Master key validated registration
- `POST /auth/logout` - Token invalidation
- `GET /auth/validate` - Token verification

## Future Enhancements

### Immediate Backend Requirements
- Implement `/auth/login` endpoint
- Implement `/auth/signup` with master key validation
- JWT token generation and validation
- User model with encrypted passwords

### Advanced Features
- Password reset functionality
- Multi-factor authentication
- Session management
- Audit logging