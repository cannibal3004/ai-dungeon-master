# AI Dungeon Master

A multiplayer web-based D&D 5e game powered by AI, where the AI acts as an intelligent Dungeon Master managing narrative, NPCs, combat, and world state.

## Features

- **Multi-LLM Support**: Flexible integration with OpenAI, Anthropic, X.ai, Google Gemini, Ollama, llama.cpp, and LocalAI
- **Real-time Multiplayer**: WebSocket-based synchronization for collaborative gameplay
- **D&D 5e Rules Engine**: Full implementation of combat, skill checks, character creation, and spellcasting
- **Context Management**: Intelligent handling of conversation history with token optimization and rate limiting
- **Autosave & Save States**: Automatic turn-level saves with manual save slot support
- **Dockerized**: Fully containerized with Docker Compose for easy deployment

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + TypeScript + Express
- **Database**: PostgreSQL
- **Cache/Sessions**: Redis
- **Real-time**: Socket.io
- **Containerization**: Docker + Docker Compose

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)

### Quick Start

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd AIDungeonMaster
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. Start with Docker Compose:
   ```bash
   docker-compose up -d
   ```

4. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:4000

### Local Development

#### Backend
```bash
cd backend
npm install
npm run dev
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
AIDungeonMaster/
├── backend/              # Node.js/TypeScript backend
│   ├── src/
│   │   ├── controllers/  # Request handlers
│   │   ├── services/     # Business logic
│   │   ├── models/       # Database models
│   │   ├── routes/       # API routes
│   │   ├── llm/          # LLM abstraction layer
│   │   ├── rules/        # D&D rules engine
│   │   ├── websocket/    # Socket.io handlers
│   │   └── migrations/   # Database migrations
│   └── Dockerfile
├── frontend/             # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── hooks/        # Custom hooks
│   │   ├── services/     # API clients
│   │   └── types/        # TypeScript types
│   └── Dockerfile
└── docker-compose.yml    # Container orchestration
```

## Architecture

### LLM Abstraction Layer
The system supports multiple LLM providers through a unified interface with:
- Automatic rate limiting and queuing
- Token counting and context management
- Provider fallback strategies
- Cost tracking and optimization

### Context Management
- Sliding window of recent game turns
- Vector embeddings for long-term memory
- Automatic session recap generation
- Token limit enforcement with graceful degradation

### Multiplayer System
- Turn-based synchronization
- Real-time chat and narrative updates
- Player state management
- Session persistence (24-hour rejoin window)

### Save System
- Automatic save on each turn
- 10 manual save slots per campaign
- Save metadata (timestamp, turn count, location)
- Point-in-time restoration

## Configuration

See `.env.example` for all configuration options including:
- LLM provider API keys
- Database connection settings
- Redis configuration
- WebSocket settings
- Rate limiting parameters

## License

MIT

## Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.
