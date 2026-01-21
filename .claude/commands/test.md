---
description: Run e2e tests with proper environment setup
---

Run the e2e tests by following these steps:

1. Read `./testplan.json` to get available testplans
2. Present the available testplan options to the user with their details:
   - Show each testplan name
   - List templates (e.g., go, python, nodejs)
   - Show TSSC configurations (git, ci, registry, tpa, acs)
   - List test files/patterns
3. Ask the user which testplan they want to use (or "all" to run all testplans)
4. Display the selected testplan configuration for verification
5. Create the `test-logs/` directory if it doesn't exist: `mkdir -p test-logs`
6. Run the tests using bash with environment variables
7. The command should be: `bash -c 'source ./.env && TESTPLAN_NAME=<plan-name> NODE_TLS_REJECT_UNAUTHORIZED=0 npm run test:plan 2>&1 | tee test-logs/<plan-name>-$(date +%Y%m%d-%H%M%S).log'`
    - If user chose "all", use `all-testplans` as the plan name: `test-logs/all-testplans-$(date +%Y%m%d-%H%M%S).log`

After the tests complete, provide a summary of the results.

If tests failed, perform basic troubleshooting:
1. Review the test log for error messages, stack traces, and failed assertions
2. Identify which specific test(s) failed and the error details
3. Examine relevant test source code in this codebase
4. Suggest potential causes and next steps for investigation
