import { GithubClient } from '../../../src/api/github/github.client';
import test from '@playwright/test';

// Initialize the GitHub client
const githubClient = new GithubClient({
  token: '',
});

// Set timeout for tests (Tekton operations can be slow)

test.describe('TektonClient Integration Tests', () => {
  // Run before all tests
  test.beforeAll(async () => {
    // // Create a test folder for all tests to use
    // try {
    //   console.log('Setting up test folder...');
    //   await jenkins.createFolder({
    //     name: TEST_FOLDER_NAME,
    //     description: 'Folder created for integration testing',
    //   });
    // } catch (error) {
    //   console.error('Failed to set up test folder:', error);
    //   throw error;
    // }
  });

  // Run after all tests
  test.afterAll(async () => {
    // Clean up test resources
    // Note: You may want to implement a deleteFolder and deleteJob method in JenkinsClient
    // For now, we'll leave this commented out since the methods don't exist yet
    /*
    try {
      console.log('Cleaning up test resources...');
      await jenkins.deleteJob(TEST_JOB_NAME, TEST_FOLDER_NAME);
      await jenkins.deleteFolder(TEST_FOLDER_NAME);
    } catch (error) {
      console.error('Failed to clean up test resources:', error);
    }
    */
  });

  test.only('Should extract image from deployment-patch.yaml', async () => {
    const repoOwner = 'xjiangorg';
    const gitOpsRepoName = 'nodejs-nojcsoue-gitops';
    const filePath = `components/nodejs-nojcsoue/overlays/development/deployment-patch.yaml`;

    const imagePattern = /(?:^|\s+)-\s+image:(?:\s+(.+)$)?|(^\s+.+$)/gm;

    try {
      const matches = await githubClient.repository.extractContentByRegex(
        repoOwner,
        gitOpsRepoName,
        filePath,
        imagePattern
      );

      if (!matches || matches.length === 0) {
        throw new Error(`No image value found in file: ${filePath}`);
      }

      // Process the matches to extract the actual image URL
      let imageValue = '';

      // Check if we have a direct match with '- image: value'
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        if (match.includes('- image:')) {
          // This is a line with "- image:" that might have the value directly
          const parts = match.split('- image:');
          if (parts.length > 1 && parts[1].trim()) {
            imageValue = parts[1].trim();
            break;
          } else if (i + 1 < matches.length && !matches[i + 1].includes('- image:')) {
            // If this line just has "- image:" and next line doesn't have "- image:",
            // assume next line is the image value
            imageValue = matches[i + 1].trim();
            break;
          }
        }
      }

      if (!imageValue) {
        throw new Error(`Could not parse image value from matches in file: ${filePath}`);
      }

      console.log(`Extracted image from ${filePath}: ${imageValue}`);
      // Additional assertion to ensure the extracted value matches expectations
    } catch (error) {
      console.error('Error during test execution:', error);
      throw error;
    }
  });

  // test configWebhook
  test('Should configure webhook for GitHub repository', async () => {
    const repoOwner = 'xjiangorg';
    const repoName = 'nodejs-ufflmxra';
    const webhookUrl =
      'https://jenkins-jenkins.apps.rosa.rhtap-services.xmdt.p3.openshiftapps.com/github-webhookaa/'; // Replace with your actual webhook URL

    try {
      await githubClient.webhooks.configWebhook(repoOwner, repoName, {
        url: webhookUrl,
        secret: 'test-secret',
        contentType: 'json',
        insecureSSL: false,
        events: ['push', 'pull_request'],
        active: true
      });
      console.log(`Webhook configured successfully`);
    } catch (error) {
      console.error('Error during webhook configuration:', error);
      throw error;
    }
  });
});
