# DELETE THIS BEFORE SENDING PR

# Current state
* New project config is generated *before* tests execution
  * Project config is basically a list of TestItems
  * We know everything before running tests, so we can generate config before tests execution and share the config (project-configs.json)
* Both e2e and UI tests are using this project config. 

# Benefits and Drawbacks of this refactor:

Benefits:
* Easier execution 
  * Just single command - everything is defined in package.json
  * Controlled by flags
* UI tests are dependent on E2E tests
  * When e2e(backend) fails, UI tests are not run
* Possibility for the UI tests to either depend on all e2e(backend) tests, or just single one
  * If dependent on all, no UI test will run, when any of e2e(backend) fails - good for PR checks?
  * If dependent on single one, UI tests will run, when *corresponding* e2e(backend) fails - good for nightlies?
* Consolidated test report
  * No need for https://github.com/redhat-appstudio/tssc-test/pull/25


Drawbacks:
* Not so straightforward to separate UI and E2E tests into separate tekton tasks - though not impossible (we will lose the dependency from UI tests to e2e tests)
* If we ever want to generate info to ProjectConfig on the fly, it would probably be doable, but not straightforward

# Notes
With this approach it is still possible to run for example:
* UI tests only
* full suite once (to create components in RHDH) and then use the same config for quickly iterating on UI tests locally.