/**
 * Logger Verification Script
 * 
 * Comprehensive test for the logger framework, demonstrating:
 * - All log levels (trace, debug, info, warn, error)
 * - Parameterized logging with {} placeholders
 * - Structured logging with metadata objects
 * - Mixed logging (parameters + metadata)
 * - Auto-injection: projectName, worker, timestamp
 */

import { LoggerFactory } from './factory/loggerFactory';

console.log('=== Logger Framework Verification ===\n');

// Test 1: All log levels
console.log('Test 1: All log levels (trace, debug, info, warn, error)');
const logger = LoggerFactory.getLogger('VerificationTest');
logger.trace('Trace message - most detailed logging');
logger.debug('Debug message - detailed information');
logger.info('Info message - general information');
logger.warn('Warning message - potential issues');
logger.error('Error message - error conditions');

// Test 2: Parameterized logging (Java-style)
console.log('\nTest 2: Parameterized logging with {} placeholders');
const username = 'john_doe';
const ipAddress = '192.168.1.100';
const count = 42;
logger.info('User {} logged in from {}', username, ipAddress);
logger.debug('Processing {} items', count);
logger.warn('Retry attempt {} of {}', 3, 5);

// Test 3: Structured logging (metadata objects)
console.log('\nTest 3: Structured logging with metadata objects');
logger.info('Component created', { 
  componentName: 'payment-service', 
  repository: 'github.com/org/repo',
  timestamp: Date.now()
});
logger.error('Operation failed', { 
  error: 'Connection timeout', 
  retryCount: 3,
  duration: 5000
});

// Test 4: Mixed logging (parameters + metadata)
console.log('\nTest 4: Mixed logging (parameters + metadata)');
logger.info('Processing {} items from {}', 100, 'kafka-queue', { 
  batchId: 'batch-001',
  processingTime: 250
});
logger.warn('Slow query detected: {}ms', 3500, { 
  query: 'SELECT * FROM users',
  threshold: 1000
});

// Test 5: Logger with custom metadata
console.log('\nTest 5: Logger with custom metadata');
const loggerWithMeta = LoggerFactory.getLogger('CustomLogger', { 
  service: 'authentication',
  version: '2.1.0'
});
loggerWithMeta.info('Service started', { port: 8080 });
loggerWithMeta.debug('Configuration loaded', { 
  configFile: '/etc/app/config.yaml',
  environment: 'production'
});

// Test 6: Error handling with stack traces
console.log('\nTest 6: Error handling');
try {
  throw new Error('Simulated error for testing');
} catch (error) {
  logger.error('Caught exception: {}', (error as Error).message, {
    stack: (error as Error).stack,
    errorType: (error as Error).name
  });
}

console.log('\n✓ Verification complete!');
console.log('\nExpected automatic fields in logs:');
console.log('- timestamp: Automatic via Winston formatter');
console.log('- projectName: From test context (if running in test environment)');
console.log('- worker: Worker/parallel index (if running in test environment)');
console.log('- level: trace/debug/info/warn/error');
console.log('- message: Formatted message with placeholders replaced');
console.log('- logger: Logger name (e.g., "VerificationTest")');
console.log('\nLogging styles supported:');
console.log('1. Parameterized: logger.info("User {} did {}", user, action)');
console.log('2. Structured: logger.info("Event", { key: value })');
console.log('3. Mixed: logger.info("User {} did {}", user, action, { metadata })');
console.log('\nCheck logs/ directory for output files');
