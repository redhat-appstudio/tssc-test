import { KubeClient } from '../../src/api/ocp/kubeClient';
import { Git } from '../../src/rhtap/core/integration/git';
import { GithubUiPlugin } from '../../src/ui/plugins/git/githubUi';
import { test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  console.log('Setting up authentication for UI tests');

  // Use KubeClient to get the developer hub URL
  const kubeClient = new KubeClient();
  const routeHostname = await kubeClient.getOpenshiftRoute('backstage-developer-hub', 'tssc-dh');
  const developerHubUrl = `https://${routeHostname}`;

  await page.goto(developerHubUrl);

  // Create GitHubUiPlugin for login (pass empty object as Git since it's not used for login)
  const githubUI = new GithubUiPlugin({} as Git);
  await githubUI.login(page);

  // Wait for successful login - check for welcome message
  await page.getByRole('heading', { name: 'Welcome back!' }).waitFor({
    state: 'visible',
    timeout: 10000,
  });

  // Save signed-in state to 'authFile'
  await page.context().storageState({ path: authFile });

  console.log('Authentication setup completed successfully');
});
