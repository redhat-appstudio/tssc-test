import { KubeClient } from '../../src/api/ocp/kubeClient';
import { Git, GitType } from '../../src/rhtap/core/integration/git';
import { OidcUi } from '../../src/ui/plugins/auth/oidcUi';
import { GithubUiPlugin } from '../../src/ui/plugins/git/githubUi';
import { getDeveloperHubConfig } from '../../src/utils/util';
import { test as setup, BrowserContext } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';


async function updateGitHubGrantedScope(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  const scopeCookie = cookies.find(c => c.name === 'github-granted-scope');
  
  if (scopeCookie) {
    await context.addCookies([{
      ...scopeCookie,
      value: 'read%3Auser%20repo%20read%3Aorg'
    }]);
    console.log('Updated github-granted-scope cookie to include repo and read:org');
  }
}

setup('authenticate', async ({ page }) => {
  console.log('Setting up authentication for UI tests');

  // Use KubeClient to get the developer hub URL
  const kubeClient = new KubeClient();
  const routeHostname = await kubeClient.getOpenshiftRoute('backstage-developer-hub', 'tssc-dh');
  const developerHubUrl = `https://${routeHostname}`;
  await page.goto(developerHubUrl);

  // Get the sign in page from the Developer Hub config
  const config = await getDeveloperHubConfig();
  const signInPage = config.signInPage;

  // Create GitHubUiPlugin for login (pass empty object as Git since it's not used for login)
  switch (signInPage) {
    case 'oidc':
      { const oidcUI = new OidcUi();
      await oidcUI.login(page);
      break; }
    case GitType.GITHUB:
      { const githubUI = new GithubUiPlugin({} as Git);
      await githubUI.login(page);
      // Update the granted scope cookie to include repo and read:org to omit the Github login page in Github UI plugin
      await updateGitHubGrantedScope(page.context());
      break; }
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
