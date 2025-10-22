# DBT Studio Features Documentation

This directory contains comprehensive documentation for all major features in the DBT Studio application.

## Available Features

### 1. [AI Chat Feature](./ai-chat-feature.md)

Comprehensive AI integration with multi-provider support covering:

- Multi-provider AI system (OpenAI, Anthropic, Gemini, Ollama)
- Advanced conversational AI with context management
- Real-time streaming responses with cancellation support
- Intelligent token management and conversation optimization
- File, folder, and project context integration
- Structured responses with JSON schema validation
- Usage analytics and cost tracking
- Secure credential management with keytar

### 2. [Project Creation and Import Feature](./project-creation-import-feature.md)

Comprehensive guide to creating and importing dbt projects from various sources including:

- New project creation with form-based setup
- Git repository import with authentication support
- Folder import with validation
- Getting started template with example project
- Connection auto-detection and configuration
- Template file management

### 3. [Connections Feature](./connections-feature.md)

Database connection management system covering:

- Multi-database support (PostgreSQL, Snowflake, BigQuery, Redshift, Databricks, DuckDB)
- Secure credential storage using keytar
- Connection validation and testing
- Profile generation for dbt
- Rosetta configuration integration

### 4. [Cloud Explorer Feature](./cloud-explorer-feature.md)

Cloud storage integration for data exploration:

- AWS S3, Azure Blob Storage, Google Cloud Storage support
- File browsing and preview capabilities
- Data preview using DuckDB
- Connection management for cloud storage
- Recent items tracking

### 5. [Development Workflow](./development-workflow.md)

Development and deployment workflow features:

- Git integration with simple-git
- File status tracking and diff visualization
- Branch management and switching
- Commit and push operations
- Real-time process monitoring

### 6. [Factory Reset Feature](./factory-reset-feature.md)

Application reset and cleanup functionality:

- Complete data cleanup
- Credential removal
- Automatic app restart
- User confirmation dialogs
- Recovery mechanisms

### 7. [SQL Editor Feature](./sql-editor-feature.md)

Modern SQL editor with Beekeeper Studio-inspired UX:

- Multi-tab SQL editor with drag & drop reordering
- Monaco editor integration with syntax highlighting and autocompletion
- Query block detection and execution
- Enhanced result viewer with pagination and export
- Advanced features like formatting, minification, and validation
- Query history management and keyboard shortcuts

## Feature Architecture

All features follow consistent architectural patterns:

### Backend Services

- **Main Process Services**: Located in `src/main/services/`
- **IPC Handlers**: Located in `src/main/ipcHandlers/`
- **Error Handling**: Centralized error management
- **Security**: Secure credential storage

### Frontend Components

- **React Components**: Located in `src/renderer/components/`
- **Screens**: Located in `src/renderer/screens/`
- **Controllers**: React Query hooks in `src/renderer/controllers/`
- **Services**: Frontend services in `src/renderer/services/`

### State Management

- **React Query**: Server state management
- **React Context**: Global application state
- **Local State**: Component-specific state
- **Persistence**: Local storage and secure storage

### Communication Patterns

- **IPC Channels**: Typed channel definitions
- **Error Handling**: User-friendly error messages
- **Loading States**: Progress indication
- **Validation**: Real-time form validation

## Integration Points

### Cross-Feature Dependencies

- **Project ↔ Connections**: Project connection configuration
- **Cloud Explorer ↔ Connections**: Cloud storage connections
- **Development ↔ Projects**: Git integration with projects
- **Settings ↔ All Features**: Global configuration management

### External Dependencies

- **Database Drivers**: Multi-database support
- **Cloud SDKs**: AWS, Azure, GCP integration
- **Git Library**: simple-git for version control
- **Security**: keytar for credential storage

## Development Guidelines

### Adding New Features

1. **Service Layer**: Implement backend services
2. **IPC Handlers**: Add typed channel handlers
3. **Frontend Components**: Create React components
4. **Controllers**: Add React Query hooks
5. **Documentation**: Update this feature documentation

### Testing Strategy

- **Unit Tests**: Service layer testing
- **Component Tests**: React component testing
- **Integration Tests**: End-to-end feature testing
- **Error Testing**: Failure scenario testing

### Performance Considerations

- **Caching**: React Query caching strategies
- **Lazy Loading**: Component and service lazy loading
- **Optimization**: Large dataset handling
- **Memory Management**: Resource cleanup

## Best Practices

### Security

- **Credential Storage**: Use secure storage service
- **Input Validation**: Validate all user inputs
- **Error Handling**: Don't expose sensitive data
- **Authentication**: Proper auth flow handling

### User Experience

- **Loading States**: Show progress indicators
- **Error Messages**: Provide actionable feedback
- **Validation**: Real-time input validation
- **Navigation**: Intuitive user flow

### Code Quality

- **TypeScript**: Strict typing throughout
- **Error Boundaries**: Graceful error handling
- **Documentation**: Comprehensive code comments
- **Testing**: Thorough test coverage

## Future Enhancements

### Planned Features

- **AI Integration**: Enhanced AI-powered features
- **Advanced Analytics**: More sophisticated data analysis
- **Team Collaboration**: Multi-user support
- **Cloud Deployment**: Direct cloud deployment
- **Plugin System**: Extensible architecture

### Technical Improvements

- **Performance**: Optimize large dataset handling
- **Scalability**: Support for enterprise-scale projects
- **Security**: Enhanced security measures
- **Accessibility**: Improved accessibility support
