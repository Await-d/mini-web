# Mini Web Project Memory

## Project Overview
Mini Web is a remote terminal management platform supporting multiple protocols (RDP, SSH, Telnet) with a React frontend and Go backend.

## Project Structure
```
mini-web/
├── backend/             # Go backend
│   ├── cmd/server/      # Main server entry
│   ├── internal/        # Internal packages
│   │   ├── api/         # API handlers
│   │   ├── config/      # Configuration
│   │   ├── model/       # Data models
│   │   └── service/     # Business logic
│   └── data/            # Database files
├── frontend/            # React frontend
│   ├── src/             # Source code
│   │   ├── components/  # Reusable components
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # Custom hooks
│   │   └── services/    # API services
│   └── public/          # Static assets
└── docker-compose.yml   # Docker configuration
```

## Technology Stack
- **Frontend**: React, TypeScript, Vite, Ant Design 5
- **Backend**: Go, Gorilla Mux, SQLite, JWT
- **Development**: Docker Compose, Yarn, Go modules

## Environment Setup
- **Go**: v1.24.3
- **Node.js**: v18.19.1  
- **Yarn**: v1.22.22

## Current Status (Last Updated: 2025-07-06 23:39 - Serena Session)
- ✅ Backend running on http://localhost:8080 (PID: 2633557)
- ✅ Frontend running on http://localhost:5173 (PID: 2636019)
- ✅ Health check: API responding normally
- ✅ Project activated and operational for Serena
- ✅ All services verified and functioning

## Default Credentials
- **Admin**: `admin` / `admin123` (role: admin)
- **User**: `user` / `admin123` (role: user)

## Development Commands

### Backend
```bash
cd mini-web/backend
go mod tidy                    # Install dependencies
go run cmd/server/main.go      # Start development server
```

### Frontend  
```bash
cd mini-web/frontend
yarn install                   # Install dependencies
yarn dev                      # Start development server
```

### Docker Deployment
```bash
docker compose up -d           # Start all services
docker compose down            # Stop all services
```

## Key Features Implemented
- User authentication (JWT-based)
- Connection management (SSH/RDP/VNC/Telnet)
- Terminal functionality with SSH support
- Multi-session management
- Special command detection (passwords, sudo, etc.)
- Binary protocol for enhanced communication
- File browser and viewer
- WebSocket-based real-time communication

## Important Files
- `/cmd/server/main.go` - Backend entry point
- `/src/main.tsx` - Frontend entry point
- `/docker-compose.yml` - Container orchestration
- `/internal/config/config.go` - Backend configuration
- `/src/services/api.ts` - Frontend API client

## Recent System Settings Enhancements (2025-07-08)

### Performance Monitoring Dashboard
- **System Overview**: Real-time CPU, memory, disk usage monitoring
- **Database Performance**: Connection pooling, query performance metrics
- **Network Statistics**: Active connections, bandwidth usage, latency tracking
- **Application Metrics**: User sessions, protocol-specific connection counts
- **Auto-refresh**: Configurable 30-second interval refresh capability

### Advanced Configuration Management
- **API Access Control**: Enhanced security configurations for API endpoints
- **Email Configuration**: Complete SMTP setup with template management
- **SSL Certificate Management**: Certificate upload, validation, and monitoring
- **System Logging**: Comprehensive log management with filtering and statistics
- **Security Settings**: Password policies, session timeout, two-factor authentication

### Key Features Implemented
1. **Performance Monitoring Tab**: Real-time system metrics dashboard
2. **Email Configuration Component**: Full SMTP configuration interface
3. **SSL Certificate Management**: Certificate lifecycle management
4. **System Log Management**: Advanced log viewing and filtering
5. **Security Configuration**: Enhanced security policy settings

### Files Modified
- `frontend/src/pages/Settings/index.tsx`: Enhanced with performance monitoring
- `frontend/src/components/EmailConfig/index.tsx`: Complete email configuration
- `frontend/src/components/SSLConfig/index.tsx`: SSL certificate management
- `frontend/src/services/api.ts`: API endpoints for system management

### Build Status
- ✅ Frontend build successful
- ✅ Backend build successful
- ✅ All TypeScript compilation issues resolved
- ✅ Icon import conflicts fixed

## Development Notes
- Backend uses SQLite for data storage
- Frontend uses Vite for fast development
- WebSocket connections for real-time terminal sessions
- Special handling for headless/container environments
- Supports multiple terminal protocols simultaneously

## Usage Guidelines
- **Access**: Frontend at http://localhost:5173, Backend API at http://localhost:8080
- **Default Login**: Use admin/admin123 for admin access, user/admin123 for regular user
- **Terminal Protocols**: SSH, RDP, VNC, Telnet all supported
- **Special Features**: Smart command detection, password masking, file browser
- **Development**: Both services auto-restart on code changes

## Serena Session Notes
- **Session Started**: 2025-07-06 23:39
- **Project Status**: Fully activated and operational
- **Ready for Use**: All services verified and functioning normally
- **Available for**: Terminal connections, file management, user administration

## Troubleshooting
- Check process status: `ps aux | grep -E "(go run|yarn|vite)"`
- Check ports: `ss -tlnp | grep -E "(8080|5173)"`
- Backend logs: Check `backend.log` in backend directory
- Frontend logs: Check `frontend.log` in frontend directory
- Health check: `curl http://localhost:8080/api/health`
- Senser status: Integrated into project monitoring