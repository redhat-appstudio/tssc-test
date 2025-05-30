import {
  CredentialType,
  JenkinsBuildTrigger,
  JenkinsClient,
} from '../../../src/api/ci/jenkinsClient';
import { expect, test } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Test configuration - use environment variables
const JENKINS_URL =
  process.env.JENKINS_URL ||
  'https://jenkins-jenkins.apps.rosa.rhtap-services.xmdt.p3.openshiftapps.com';
const JENKINS_USERNAME = 'cluster-admin-admin-edit-view';
const JENKINS_TOKEN = '';

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

  // test('Should create a folder successfully', async () => {
  //   const result = await jenkins.createFolder({
  //     name: TEST_FOLDER_NAME,
  //     description: 'A test subfolder',
  //   });
  //   console.log('Folder creation result:', result);

  //   expect(result.success).toBe(true);
  //   expect(result.status).toBeGreaterThanOrEqual(200);
  //   expect(result.status).toBeLessThan(300);
  // });

  // test('Should create a job under a folder', async () => {
  //   const result = await jenkins.createJob(TEST_JOB_NAME, TEST_FOLDER_NAME, TEST_REPO_URL);
  //   console.log('Job creation result:', result);
  //   expect(result.success).toBe(true);
  //   expect(result.status).toBeGreaterThanOrEqual(200);
  //   expect(result.status).toBeLessThan(300);
  // });

  // test('Should create a secret text credential', async () => {
  //   const result = await jenkins.createCredential(
  //     TEST_FOLDER_NAME,
  //     TEST_CREDENTIAL_ID,
  //     'test-secret-value',
  //     CredentialType.SECRET_TEXT
  //   );

  //   expect(result.success).toBe(true);
  //   expect(result.status).toBeGreaterThanOrEqual(200);
  //   expect(result.status).toBeLessThan(300);
  // });

  // test('Should create a username-password credential', async () => {
  //   const credentialId = `${TEST_CREDENTIAL_ID}-userpass`;
  //   const result = await jenkins.createCredential(
  //     TEST_FOLDER_NAME,
  //     credentialId,
  //     'testuser:testpassword',
  //     CredentialType.USERNAME_PASSWORD
  //   );

  //   expect(result.success).toBe(true);
  //   expect(result.status).toBeGreaterThanOrEqual(200);
  //   expect(result.status).toBeLessThan(300);
  // });

  // test('Should get job information', async () => {
  //   // const jobPath = `${TEST_FOLDER_NAME}/${TEST_JOB_NAME}`;
  //   const testFolderName = 'b6cybvqqx-dotnet-basic'; // Adjusted for root folder
  //   const testJobName = 'b6cybvqqx-dotnet-basic';
  //   const jobPath = `${testFolderName}/${testJobName}`; // Adjusted for root folder
  //   const jobInfo = await jenkins.getJob(jobPath);
  //   console.log('Job information:', jobInfo);
  //   console.log('builds:', jobInfo.builds);
  //   console.log('lastBuild:', jobInfo.lastBuild);
  //   expect(jobInfo).toBeDefined();
  //   expect(jobInfo.name).toBe(testJobName);
  // });

  test.only('Should trigger a build and get build information', async () => {
    // Trigger a build
    // const buildResult = await jenkins.build(TEST_JOB_NAME, TEST_FOLDER_NAME);
    // expect(buildResult.success).toBe(true);

    // // Wait a bit for the build to start
    // await new Promise(resolve => setTimeout(resolve, 5000));

    // Get the latest build number (assume it's 1 for the first build)
    const buildNumber = 1;
    const buildInfo = await jenkins.getBuild('b6cybvqqx-dotnet-basic', 1, 'b6cybvqqx-dotnet-basic');

    expect(buildInfo).toBeDefined();
    expect(buildInfo.number).toBe(buildNumber);
  });

  test('Should detect build trigger type', async () => {
    // Get a build with trigger detection
    const buildInfo = await jenkins.getBuild(
      'b6cybvqqx-dotnet-basic',
      1,
      'b6cybvqqx-dotnet-basic',
      true
    );

    // Verify trigger type is populated
    expect(buildInfo.triggerType).toBeDefined();

    // Log the detected trigger type
    console.log('Detected build trigger type:', buildInfo.triggerType);

    // Directly use the convenience methods
    const isPR = await jenkins.isBuildTriggeredByPullRequest(
      'b6cybvqqx-dotnet-basic',
      1,
      'b6cybvqqx-dotnet-basic'
    );
    const isPush = await jenkins.isBuildTriggeredByPush(
      'b6cybvqqx-dotnet-basic',
      1,
      'b6cybvqqx-dotnet-basic'
    );

    console.log('Is PR build?', isPR);
    console.log('Is Push build?', isPush);

    // We can't make specific assertions about the trigger type in this test
    // as it depends on how the build was actually triggered in Jenkins
    expect([
      JenkinsBuildTrigger.PUSH,
      JenkinsBuildTrigger.PULL_REQUEST,
      JenkinsBuildTrigger.MANUAL,
      JenkinsBuildTrigger.API,
      JenkinsBuildTrigger.SCHEDULED,
      JenkinsBuildTrigger.UNKNOWN,
    ]).toContain(buildInfo.triggerType);
  });
});
