# AGENTS.md

## Overview
This document provides guidelines and information for coding agents operating in this repository.

## Build, Lint, and Test Commands

### Build
- Run `npm run build` to build the project.

### Lint
- Run `npm run lint` to lint the code.

### Test
- Run `npm run test` to run all tests.
- To run a single test, use `npm run test -- --testNamePattern="<test-name>"`.

## Code Style Guidelines

### Imports
- Use ES6 import syntax.
- Keep imports organized and alphabetically sorted.

### Formatting
- Use 2 spaces for indentation.
- Keep lines under 80 characters where possible.
- Use semicolons.

### Types
- Use TypeScript type annotations.
- Prefer `interface` over `type` for object types.

### Naming Conventions
- Use PascalCase for class names.
- Use camelCase for variable and function names.
- Use UPPERCASE for constants.

### Error Handling
- Use try-catch blocks for error handling.
- Log errors using a logging library.

### Commit Messages
- Use the imperative mood (e.g., "Fix bug" instead of "Fixed bug").
- Keep commit messages concise and descriptive.

## Additional Notes
- Always run lint and tests before committing.
- Use descriptive commit messages and follow standard professional guidelines.
- Keep code organized, readable, and well-documented.