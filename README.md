# TSSC E2E Testing Framework and Tests

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Running Tests](#running-tests)
- [UI Tests](#ui-tests)
- [Development](#development)

## Overview

This project is an end-to-end automation testing framework designed to validate the functionality of the [Red Hat Trusted Software Supply Chain CLI](https://github.com/redhat-appstudio/rhtap-cli) (tssc). Built with Playwright and TypeScript, this framework simulates real-world user interactions and backend processes to ensure the reliability and correctness of tssc's core features.

## Test Execution Control

The framework supports environment variables to control which types of tests run:

### Environment Variables

- **`ENABLE_E2E_TESTS`** (default: `true`) - Controls backend E2E test execution
- **`ENABLE_UI_TESTS`** (default: `false`) - Controls UI test execution
- **`UI_DEPENDS_ON_ALL_E2E`** (default: `false`) - Controls UI test dependency behavior
  - When `false`: Each UI test depends only on its corresponding E2E test
  - When `true`: All UI tests depend on ALL E2E tests (sequential execution)

### Usage Examples

```bash
# Run only E2E tests (default behavior) - generates fresh config
npm run test:e2e
# or
ENABLE_E2E_TESTS=true ENABLE_UI_TESTS=false npm test

# Run only UI tests - uses existing config from previous E2E runs
npm run test:ui
# or
ENABLE_E2E_TESTS=false ENABLE_UI_TESTS=true playwright test

# Run both E2E and UI tests - generates fresh config, UI depends on E2E
npm run test:all
# or
npm run generate-config && ENABLE_E2E_TESTS=true ENABLE_UI_TESTS=true npm test

# Run UI tests with dependency on ALL E2E tests (sequential execution)
UI_DEPENDS_ON_ALL_E2E=true ENABLE_E2E_TESTS=true ENABLE_UI_TESTS=true npm test

# Default: Only E2E tests - generates fresh config
npm test
```

### Test Dependencies

- **When both are enabled**: UI tests depend on their corresponding E2E tests (by default)
  - With `UI_DEPENDS_ON_ALL_E2E=true`: UI tests depend on ALL E2E tests. Even when a single E2E test fails, all UI tests are skipped.
  - With `UI_DEPENDS_ON_ALL_E2E=false`: Each UI test depends only on its corresponding E2E test.
- **When only UI enabled**: UI tests run standalone using existing project configurations
- **When only E2E enabled**: Only backend tests run with fresh configurations

### Configuration Generation

Configuration generation is controlled by the `generate-config` script. This script will read testplan.json file and generate project configurations for each test combination in `./tmp/project-configs.json` file.

* Running only E2E tests (`npm run test:e2e`) or both E2E and UI  tests (`npm run test:all`) will generate fresh project configurations.
* Running only UI tests (`npm run test:ui`) will use existing project configurations from previous E2E runs or hand-crafted project configurations in `./tmp/project-configs.json` file.

## Prerequisites

Before using this testing framework, ensure you have:

* An OpenShift cluster with tssc installed and properly configured (Enable `debug/ci=true`)
* **For Local Test Execution:**
  * Node.js (v20+)
  * ArgoCD CLI installed
* **For Container Test Execution:**
  * Podman

## Configuration

### Step 1: Configure Test Plan

Copy the `testplan.json` template from the templates directory to the root directory:

```bash
cp templates/testplan.json .
```

The testplan.json file supports defining multiple TSSC combinations, allowing you to test different configurations in parallel.

#### File Structure
```json
{
  "templates": ["go", "python", "nodejs", "dotnet-basic", "java-quarkus", "java-springboot"],
  "tssc": [
    {
      "git": "github",
      "ci": "tekton",
      "registry": "quay",
      "tpa": "remote",
      "acs": "local"
    },
    {
      "git": "gitlab",
      "ci": "tekton",
      "registry": "quay",
      "tpa": "remote",
      "acs": "local"
    }
  ],
  "tests": ["test1", "test2"]
}
```

#### Configuration Fields

- **`templates`**: Array of application templates to test
  - Valid values: `["go", "python", "nodejs", "dotnet-basic", "java-quarkus", "java-springboot"]`

- **`tssc`**: Array of TSSC configuration objects, each containing:
  - `git`: Git provider - `["github", "gitlab", "bitbucket"]`
  - `ci`: CI provider - `["tekton", "jenkins", "gitlabci", "githubactions"]`
  - `registry`: Image registry - `["quay","artifactory", "nexus"]`
  - `acs`: ACS configuration - `["local", "remote"]`
  - `tpa`: TPA configuration - `["local", "remote"]`

- **`tests`**: Array of test identifiers (optional)

#### Test Execution Matrix

The framework creates a test matrix by combining each template with each TSSC configuration. For example, with the above configuration:
- **Templates**: 6 (go, python, nodejs, dotnet-basic, java-quarkus, java-springboot)
- **TSSC combinations**: 2 (github+tekton+quay, gitlab+tekton+quay)
- **Total tests**: 6 × 2 = 12 test combinations

Each test combination runs independently, allowing you to validate different technology stacks across various TSSC configurations.

### Step 2: Configure Environment Variables

Copy the template file from `templates/.env` to the root directory:

```bash
cp templates/.env .env
```

Edit the `.env` file to set required environment variables for running automation tests. After that, source the file before running tests:

```bash
source .env
```

### Step 3: (Optional) Skip TLS Verification

For testing environments with self-signed certificates or invalid SSL certificates, you can disable TLS verification globally. This is useful in testing environments but should not be used in production:

```bash
# Option 1: Set environment variable before running tests
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Option 2: Add to your .env file
echo "NODE_TLS_REJECT_UNAUTHORIZED=0" >> .env
```

## Running Tests

### Option 1: Local Test Execution

#### Install Dependencies
```bash
npm install
```

#### Run Tests
```bash
# Run all tests
npm run test:all

# Run a specific test file
npm test -- tests/tssc/full_workflow.test.ts

# View test report
npm run test:report
```

### Option 2: Container Test Execution

You also can run tests in a container using Podman, which provides a consistent testing environment.

#### Build Container Image
```bash
podman build -t tssc-test:latest .
```

#### Start Interactive Container

Prepare your configuration files:
- `testplan.json` - Test plan configuration
- `.env` - Environment variables
- `kubeconfig` - Kubernetes configuration file

Start an interactive shell in the container:

```bash
podman run -it --rm \
  -v "$(pwd)/testplan.json:/tssc-test/testplan.json:ro" \
  -v "$(pwd)/.env:/tssc-test/.env:ro" \
  -v "$(pwd)/kubeconfig:/tssc-test/.kube/config:ro" \
  -v "$(pwd)/test-results:/tssc-test/playwright-report" \
  tssc-test:latest /bin/bash
```

#### Run Tests Inside Container

Once inside the container, you can execute any test commands:

```bash
# Source environment variables
source .env

# Run all tests
npm run test:all

# Run a specific test file
npm test -- tests/tssc/full_workflow.test.ts

# Run UI tests
npm run test:ui

# View test report
npm run test:report

# Run validation commands
npm run validate
```

**Volume Mounts:**
- `testplan.json` - Your test configuration (read-only)
- `.env` - Environment variables file (read-only)
- `kubeconfig` - Kubernetes configuration (read-only)
- `test-results` - Test results and artifacts (read-write)
- `test-logs` - Application logs (read-write)

## Test Reports

After test execution, Playwright automatically generates an heml formated report under playwright-report directory


## UI Tests

The framework includes UI automation tests that validate the tssc user interface using Playwright. These tests ensure the correct functionality of the web interface and its integration with various plugins and backend services.

### Prerequisites for UI Tests

- Complete all backend test setup steps above
- Component should be created manually or during backend tests
- Component name should be set as an environment variable
- Set UI-specific variables in the `.env` file
- GitHub App authentication: Ensure user has authenticated the application manually (this step is not part of the UI tests)

### Running UI Tests

#### Local Execution
```bash
# Run UI tests in console
npm run test:ui

# Run UI tests in UI mode (interactive)
npm run ui
```

#### Container Execution
```bash
# Inside the container
npm run test:ui
```

**Note:** UI mode (`npm run ui`) opens the Playwright UI interface and allows developers to see test execution and UI behavior, read the DOM, watch page networking, etc. This mode is only available for local execution.

### UI Test Structure

The UI tests are organized as follows:

- `src/ui/plugins/` - UI-specific automation for various plugins (Git providers, CI providers, image registries, etc.)
- `src/ui/page-objects/` - Page Object Models (POMs) for UI elements
- `tests/ui/ui.test.ts` - Main UI automation test file

### Naming convention

All UI related files should be placed to the `/src/ui` or `/tests/ui` directories. To distinguish UI entities from backend ones, it's required to include `Ui` or `plugin` to the name of the entity.

Page object identifiers are located in the `/src/ui/page-objects` directory. Each file should have a `_po.ts` suffix.

Plugin-related functionality is stored in the `/src/ui/plugins` directory, organized by plugins type - for example, `git` or `ci`. The file name should match the short name of a plugin. Classes defined in these files must include either `Ui` or `plugin` in their names.

### UI Test Artifacts

UI tests should save artifacts to a separate directory from backend E2E tests to prevent overwriting. This is currently not implemented, so please backup your test results if needed before a new test run.

## Development

### High-level Architecture
![Architecture Diagram](./docs/images/Hight_level_Arch.jpg)

### Development Commands

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Type check
npm run check-types

# Run all validation steps
npm run validate
```

### Debugging

#### VS Code Debugging

For VS Code users, you can debug tests directly in the editor using the provided launch configuration template.

**Setup VS Code Debugging:**

1. Copy the launch configuration template:
```bash
cp templates/launch.json .vscode/launch.json
```

2. The launch.json template contains a configuration for debugging specific test files

3. **Customize the configuration:**
   - Change the test file path in `args` array to debug different test files
   - Modify `--headed` to `--headless` for headless debugging
   - Add additional Playwright options as needed

4. **Start debugging:**
   - Open the test file you want to debug
   - Set breakpoints in your code
   - Go to VS Code's Debug view (Ctrl+Shift+D)
   - Select "Debug specific test file" from the dropdown
   - Click the play button or press F5

**Debug Different Test Files:**
- For full workflow tests: `tests/tssc/full_workflow.test.ts`
- For UI tests: `tests/tssc/ui.test.ts`
