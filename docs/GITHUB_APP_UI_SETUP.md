## Setup Github Application for UI testing
### Configure app URLs
To properly log in the RHADS UI, the GitHub OAuth application has to be prepared. GitHub application has to contain a proper:
* Callback url,
* Homepage url,
* Webhook url.

**Note:** If your application was created during SSC instalation, these URLs are already properly set.

### Opt-out of `User-to-server token expiration` feature
To ensure the tests are not logged out during the test run, the user-to-server token expiration has to be opt-out.

To opt-out of the option, either:

* Settings -> Applications -> Configure <Your Application> -> App Settings -> Optional features

* search for (replace `<app>` with your app name): ``` https://github.com/settings/apps/<app>/beta ```

and choose opt-out for the `User-to-server token expiration` feature.