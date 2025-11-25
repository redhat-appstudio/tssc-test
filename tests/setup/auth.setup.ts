import { KubeClient } from '../../src/api/ocp/kubeClient';
import { Git, GitType } from '../../src/rhtap/core/integration/git';
import { GithubUiPlugin } from '../../src/ui/plugins/git/githubUi';
import { test as setup } from '@playwright/test';
import yaml from 'js-yaml';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  console.log('Setting up authentication for UI tests');

  // Use KubeClient to get the developer hub URL
  const kubeClient = new KubeClient();
  const routeHostname = await kubeClient.getOpenshiftRoute('backstage-developer-hub', 'tssc-dh');
  const developerHubUrl = `https://${routeHostname}`;
  await page.goto(developerHubUrl);

  // Get the sign in page from the config map
  const configMap = await kubeClient.getConfigMap('tssc-developer-hub-app-config', 'tssc-dh');
  const raw = configMap['app-config.tssc.yaml'];
  const cfg = yaml.load(raw) as any;
  const signInPage = cfg?.signInPage;

  // Create GitHubUiPlugin for login (pass empty object as Git since it's not used for login)
  const githubUI = new GithubUiPlugin({} as Git);

  switch (signInPage) {
    case GitType.GITHUB:
      await githubUI.login(page);
      break;
    default:
      setup.skip(true, `Unsupported sign in page: ${String(signInPage)}`);
      return;
  }

  // Wait for successful login - check for welcome message
  await page.getByRole('heading', { name: 'Welcome back!' }).waitFor({
    state: 'visible',
    timeout: 10000,
  });

  // Save signed-in state to 'authFile'
  await page.context().storageState({ path: authFile });

  console.log('Authentication setup completed successfully');
});
