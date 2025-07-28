#!/bin/bash

# Set environment variables
export QUAY_REGISTRY_ORG="tssc"
export IMAGE_REGISTRY_ORG="tssc"
export GITHUB_ORGANIZATION="rhtap-qe-jsmid"
export BITBUCKET_WORKSPACE="rhtap-test"
export BITBUCKET_PROJECT="RHTAP"
export GH_USERNAME="rhtap-qe-acc"
export GH_PASSWORD="MJ6y2RHaK98bxT@"
export GH_SECRET="3NEU4KJTLH5736ME"
export NODE_TLS_REJECT_UNAUTHORIZED=0

echo "Step 1: Running authentication setup..."
npx playwright test tests/setup/auth.setup.ts

if [ $? -eq 0 ]; then
    echo "Authentication setup completed successfully!"
    echo "Step 2: Running UI tests with shared authentication..."
    
    # Run UI tests using the authenticated state
    npx playwright test tests/ui/ui.test.ts --project=default
else
    echo "Authentication setup failed! UI tests will not run."
    exit 1
fi

echo "Both tests completed!" 