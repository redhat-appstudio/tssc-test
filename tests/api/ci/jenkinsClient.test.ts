import { JenkinsClient } from '../../../src/api/ci/jenkinsClient';
import * as dotenv from 'dotenv';
import { test, expect } from '@playwright/test';

// Load environment variables from .env file
dotenv.config();

// Test configuration - use environment variables
const JENKINS_URL =
  process.env.JENKINS_URL ||
  'https://jenkins-jenkins.apps.rosa.rhtap-services.xmdt.p3.openshiftapps.com';
const JENKINS_USERNAME = process.env.JENKINS_USERNAME;
const JENKINS_TOKEN = process.env.JENKINS_TOKEN ;

// Test constants - change these as needed
const TEST_FOLDER_NAME = 'test-folder-xjiang';
const TEST_JOB_NAME = 'test-job';
const TEST_REPO_URL = 'https://github.com/username/repo.git';
const TEST_CREDENTIAL_ID = 'test-credential';

// Initialize the Jenkins client
const jenkins = new JenkinsClient({
  baseUrl: JENKINS_URL,
  username: JENKINS_USERNAME,
  token: JENKINS_TOKEN,
});

test.describe('JenkinsClient Integration Tests', () => {
  // Set timeout for tests (Jenkins operations can be slow)
  test.setTimeout(30000);

  test('Should create a folder successfully', async () => {
    const result = await jenkins.createFolder({
      name: TEST_FOLDER_NAME,
      description: 'A test subfolder',
    });
    console.log('Folder creation result:', result);

    expect(result.success).toBe(true);
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);
  });

  test('Should create a job under a folder', async () => {
    const result = await jenkins.createJob(TEST_JOB_NAME, TEST_FOLDER_NAME, TEST_REPO_URL);
    console.log('Job creation result:', result);
    expect(result.success).toBe(true);
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);
  });

  test('Should create a secret text credential', async () => {
    const result = await jenkins.createCredential(
      TEST_FOLDER_NAME,
      TEST_CREDENTIAL_ID,
      'test-secret-value',
      'Secret text'
    );

    expect(result.success).toBe(true);
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);
  });

  test('Should create a username-password credential', async () => {
    const credentialId = `${TEST_CREDENTIAL_ID}-userpass`;
    const result = await jenkins.createCredential(
      TEST_FOLDER_NAME,
      credentialId,
      'testuser:testpassword',
      'Username with password'
    );

    expect(result.success).toBe(true);
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);
  });

  test('Should get job information', async () => {
    // const jobPath = `${TEST_FOLDER_NAME}/${TEST_JOB_NAME}`;
    const testFolderName = 'a2zhytown-java-quarkus'; // Adjusted for root folder
    const testJobName = 'a2zhytown-java-quarkus';
    const jobPath = `${testFolderName}/${testJobName}`; // Adjusted for root folder
    const jobInfo = await jenkins.getJob(jobPath);
    console.log('Job information:', jobInfo);
    console.log('builds:', jobInfo.builds);
    console.log('lastBuild:', jobInfo.lastBuild);
    expect(jobInfo).toBeDefined();
    expect(jobInfo.name).toBe(testJobName);
  });

  test('Should trigger a build and get build information', async () => {
    // Trigger a build
    const buildResult = await jenkins.build(TEST_JOB_NAME, TEST_FOLDER_NAME);
    expect(buildResult.success).toBe(true);

    // Wait a bit for the build to start
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get the latest build number (assume it's 1 for the first build)
    const buildNumber = 1;
    const buildInfo = await jenkins.getBuild(TEST_JOB_NAME, buildNumber, TEST_FOLDER_NAME);

    expect(buildInfo).toBeDefined();
    expect(buildInfo.number).toBe(buildNumber);
  });
});
