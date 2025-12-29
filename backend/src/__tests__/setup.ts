// Test setup: Configure test environment, database mocks, etc.

// Mock database for testing
jest.mock('../utils/database', () => ({
  getDatabase: jest.fn(() => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  })),
  initializeDatabase: jest.fn(),
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Global test timeout
jest.setTimeout(10000);
