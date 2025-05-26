# TSSC E2E Testing Framework and Tests

## Overview

This project is an end-to-end automation testing framework designed to validate the functionality of the [Red Hat Trusted Software Supply Chain CLI ](https://github.com/redhat-appstudio/rhtap-cli) (tssc). Built with Playwright and TypeScript, this framework simulates real-world user interactions and backend processes to ensure the reliability and correctness of tssc's core features.

## Prerequisites

Before using this testing framework, ensure you have:

* An OpenShift cluster with tssc installed and properly configured(Enable `debug/ci=true`)

* Node.js (v23+)

* ArgoCD CLI installed

## Getting Started

1. Install Dependencies
```
# Install dependencies
npm install
```

2. Configure the Test Plan

Copy the testplan.json template from the templates directory to the root directory of the project:

```
cp templates/testplan.json .
```

Modify the testplan.json file to match your testing requirements. Below are the valid values for each field:
```
"templates": ["go", "python", "nodejs", "dotnet-basic", "java-quarkus", "java-springboot"],
"git": ["github", "gitlab", "bitbucket"],
"ci": ["tekton", "jenkins", "gitlabci", "githubactions"],
"registry": ["quay", "quay.io", "artifactory", "nexus"],
"acs": ["local", "remote"],
"tpa": ["local", "remote"]
```

3. Export Environment Variables

Copy the template file from `templates/.env` to the root directory of the project:

```bash
cp templates/.env .env
```

Edit the `.env` file to set required environment variables for running automation tests. After that, you can source the file before running tests:

```bash
source .env
```

4. (Optional) Skip TLS verification globally

For testing environments with self-signed certificates or invalid SSL certificates, you can disable TLS verification globally. This is useful in testing environments but should not be used in production:

```bash
# Option 1: Set environment variable before running tests
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Option 2: Add to your .env file
echo "NODE_TLS_REJECT_UNAUTHORIZED=0" >> .env
```

Running Tests

Run All Tests

```
npm run test:tssc
```

Run a Specific Test File

```
npm test -- tests/tssc/full_workflow.test.ts
```

View Test Report

```
npm run test:report
```

## UI Tests

The framework includes UI automation tests that validate the tssc user interface using Playwright. These tests ensure the correct functionality of the web interface and its integration with various plugins and backend services.

### Running UI Tests

Before running the UI test, follow all steps for the backend tests described above. Test expects the component to be created manually or during backend tests and the name should be set as an environment variable. To successfully run the UI test, set also other variables related to UI test in the .env file.

The UI test is using GitHub App to authenticate. Before running a test, make sure that user has authenticated the application manually. This step is not part of the UI tests.

To run UI tests in console:

```bash
npm run test:ui
```

To run UI tests in UI mode:
```bash
npm run ui
```
UI mode opens a Playwright UI interface and allows developer to see the test execution and UI behavior, read the DOM, watch the networking of the page, etc. 

### UI Test Structure

The UI tests are organized in the following structure:

- `src/ui/plugins/` - Contains UI specific automation for UI plugins, e.g. different Git providers, CI providers, image registries, etc.
- `src/ui/page-objects/` - Page Object Models (POMs) for UI elements
- `tests/tsc/ui.test.ts` - The main test file for the UI automation

### UI Test Artifacts

UI tests should save artifacts to another directory then backend E2E tests to prevent overwriting ones or the others. It's currently not implemented though, so please backup your test results if needed before a new test run.

## Development Guide
High Level Digram
![image info](./docs/images/Hight_level_Arch.jpg)

Debug Test

Project Structure

Development Commands

```
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