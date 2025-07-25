# Jenkins Client - Refactored Architecture

This directory contains the refactored Jenkins client implementation following TypeScript best practices and design patterns.

## Architecture Overview

The Jenkins client has been refactored using a service-oriented architecture with the following benefits:

- **Single Responsibility Principle**: Each class has one clear purpose
- **Type Safety**: Comprehensive TypeScript types throughout
- **Testability**: Smaller, focused classes are easier to unit test
- **Maintainability**: Changes to specific functionality affect fewer files
- **Reusability**: Utility classes can be reused across the codebase
- **Error Handling**: Consistent, typed error handling
- **Configuration**: Centralized configuration management
- **Extensibility**: Easy to add new credential types or job configurations

## Directory Structure

```
jenkins/
├── enums/                    # Enums for Jenkins constants
│   └── jenkins.enums.ts
├── types/                    # TypeScript type definitions
│   └── jenkins.types.ts
├── config/                   # Configuration constants
│   └── jenkins.config.ts
├── errors/                   # Custom error classes
│   └── jenkins.errors.ts
├── utils/                    # Utility classes
│   └── jenkins.utils.ts
├── strategies/               # Strategy pattern implementations
│   └── credential.strategy.ts
├── http/                     # HTTP client abstraction
│   └── jenkins-http.client.ts
├── services/                 # Business logic services
│   ├── jenkins-job.service.ts
│   ├── jenkins-build.service.ts
│   └── jenkins-credential.service.ts
├── jenkins.client.ts         # Main client facade
├── index.ts                  # Module exports
└── README.md                 # This file
```

## Usage Examples

### Basic Usage (Backwards Compatible)

```typescript
import { JenkinsClient } from './jenkins';

const client = new JenkinsClient({
  baseUrl: 'https://jenkins.example.com',
  username: 'your-username',
  token: 'your-api-token'
});

// Create a job (legacy method signature)
await client.createJob(
  'my-job',
  'https://github.com/user/repo.git',
  'my-folder',
  'main',
  'Jenkinsfile',
  'git-credentials'
);

// Trigger a build
await client.build('my-job', 'my-folder', { PARAM1: 'value1' });

// Get build information
const build = await client.getBuild('my-job', 123, 'my-folder');
```

### New Options-Based Usage

```typescript
import { JenkinsClient, CreateJobOptions, BuildOptions } from './jenkins';

const client = new JenkinsClient({
  baseUrl: 'https://jenkins.example.com',
  username: 'your-username',
  token: 'your-api-token'
});

// Create a job (new options signature)
const jobOptions: CreateJobOptions = {
  jobName: 'my-job',
  repoUrl: 'https://github.com/user/repo.git',
  folderName: 'my-folder',
  branch: 'main',
  jenkinsfilePath: 'Jenkinsfile',
  credentialId: 'git-credentials'
};
await client.createJob(jobOptions);

// Trigger a build with options
const buildOptions: BuildOptions = {
  jobName: 'my-job',
  folderName: 'my-folder',
  parameters: { PARAM1: 'value1' }
};
await client.build(buildOptions);
```

### Direct Service Access

```typescript
import { JenkinsClient } from './jenkins';

const client = new JenkinsClient(config);

// Access individual services for advanced operations
const jobs = client.jobs;
const builds = client.builds;
const credentials = client.credentials;

// Use services directly
const runningBuilds = await builds.getRunningBuilds('my-job', 'my-folder');
const jobExists = await jobs.jobExists('my-job', 'my-folder');
await credentials.createSecretTextCredential('my-folder', 'my-secret', 'secret-value');
```

### Error Handling

```typescript
import { 
  JenkinsClient, 
  JenkinsJobNotFoundError, 
  JenkinsBuildTimeoutError,
  JenkinsAuthenticationError 
} from './jenkins';

try {
  const build = await client.getBuild('non-existent-job', 123);
} catch (error) {
  if (error instanceof JenkinsJobNotFoundError) {
    console.log('Job not found:', error.message);
  } else if (error instanceof JenkinsAuthenticationError) {
    console.log('Authentication failed:', error.message);
  } else {
    console.log('Unexpected error:', error);
  }
}
```

## Design Patterns Used

### 1. Facade Pattern
- `JenkinsClient` acts as a facade providing a simple interface to the complex subsystem

### 2. Strategy Pattern
- `CredentialStrategy` and implementations for different credential types
- Easy to add new credential types without modifying existing code

### 3. Service Layer Pattern
- Business logic separated into focused service classes
- Each service handles one domain (jobs, builds, credentials)

### 4. Builder Pattern
- `JenkinsXmlBuilder` for constructing XML configurations
- `JenkinsPathBuilder` for constructing API paths

### 5. Factory Pattern
- `CredentialStrategyFactory` for creating credential strategies

### 6. Error Handling Pattern
- Custom error hierarchy with specific error types
- Consistent error handling across all services

## Configuration

All configuration constants are centralized in `JenkinsConfig`:

```typescript
import { JenkinsConfig } from './jenkins';

// Access default values
const timeout = JenkinsConfig.DEFAULT_TIMEOUT_MS;
const headers = JenkinsConfig.HEADERS.JSON;
const endpoint = JenkinsConfig.ENDPOINTS.API_JSON;
```

## Extending the Client

### Adding New Credential Types

1. Add the new type to `CredentialType` enum
2. Create a new strategy class implementing `CredentialStrategy`
3. Register it in `CredentialStrategyFactory`

### Adding New Services

1. Create a new service class in `services/`
2. Add it to the main `JenkinsClient` constructor
3. Expose it through the facade if needed

### Adding New Error Types

1. Create new error classes extending `JenkinsError`
2. Export them from `errors/jenkins.errors.ts`
3. Use them in appropriate services

## Testing

The refactored architecture makes testing much easier:

```typescript
// Mock individual services
const mockJobService = {
  createJob: jest.fn(),
  getJob: jest.fn(),
};

// Test services in isolation
const jobService = new JenkinsJobService(mockHttpClient);
```

## Performance Considerations

- Services are lightweight and share the same HTTP client instance
- Path building and XML generation are optimized
- Error handling is consistent and efficient
- Configuration is loaded once and reused

## Security

- Credentials are handled through the strategy pattern
- Sensitive data is not logged
- XML escaping prevents injection attacks
- Type-safe parameter handling 