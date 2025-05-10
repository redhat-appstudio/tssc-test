import { TektonClient } from '../../../src/api/ci/tektonClient';
import { KubeClient } from '../../../src/api/ocp/kubeClient';
import { expect, test } from '@playwright/test';

const kubeClient = new KubeClient(true);
// Initialize the Tekton client
const tektonClient = new TektonClient(kubeClient);

test.describe('TektonClient Integration Tests', () => {
  // Set timeout for the suite
  test.setTimeout(30000);

  test('Should fetch pipeline runs by Git repository', async () => {
    const namespace = 'rhtap-app-ci';
    const repositoryName = 'go-nvnnqqnl';
    const result = await tektonClient.getPipelineRunsByGitRepository(namespace, repositoryName);

    //loop to print out pipeline runs
    const pipelinesize = result.length;
    console.log(`PipelineRun size: ${pipelinesize}`);
    for (const pipelineRun of result) {
      console.log(`PipelineRun: ${pipelineRun.metadata?.name}`);
    }

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBeTruthy();
  });

  test('Should fetch pipeline run by name', async () => {
    const namespace = 'rhtap-app-ci';
    const pipelineRunName = 'go-fqzzzwtu-on-push-crkfc';
    const result = await tektonClient.getPipelineRunByName(namespace, pipelineRunName);
    console.log(`PipelineRun: ${result?.metadata?.name}`);
    expect(result).toBeDefined();
  });
});
