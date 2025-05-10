import { ArgoCDClient } from '../../../src/api/cd/argocdClient';
import { KubeClient } from '../../../src/api/ocp/kubeClient';
import { expect, test } from '@playwright/test';

const kubeClient = new KubeClient(true);
// Initialize the ArgoCD client
const tektonClient = new ArgoCDClient(kubeClient);

test.describe('ArgoCDClient Integration Tests', () => {
  // Set timeout for tests (ArgoCD operations can be slow)
  test.setTimeout(30000);

  // test getArgoCDInstanceName
  test('Should get ArgoCD instance name', async () => {
    const instanceName = await tektonClient.getArgoCDInstanceName('rhtap-gitops');
    expect(instanceName).toBeDefined();
    console.log(`ArgoCD instance name: ${instanceName}`);
  });

  // test getArgoCDServerRoute
  test('Should get ArgoCD server route', async () => {
    const route = await tektonClient.getArgoCDServerRoute('rhtap-gitops', 'rhtap-gitops-server');
    expect(route).toBeDefined();
    console.log(`ArgoCD server route: ${route}`);
  });

  test('Should get application successfully', async () => {
    const applicationName = 'go-nvnnqqnl';
    const namespace = 'rhtap-app-cd';
    const result = await tektonClient.getApplicationStatus(applicationName, namespace);
    expect(result).toBeDefined();
    expect(result).toBe(true);
    console.log(`Application status: ${result}`);
  });

  test('Should trigger application successfully', async () => {
    const applicationName = 'go-nvnnqqnl';
    const namespace = 'rhtap-app-cd';
    const result = await tektonClient.syncApplication(applicationName, namespace);
    expect(result).toBeDefined();
    expect(result).toBe(true);
    console.log(`Trigger application result: ${result}`);
  });
});
