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
export UI_TEST=true

# Create a temporary test items file to ensure UI tests run
mkdir -p tmp
cat > tmp/test-items.json << 'EOF'
{
  "testItems": [
    {
      "name": "ui-test-component",
      "gitProvider": "github",
      "ciProvider": "github-actions",
      "namespace": "default"
    }
  ],
  "totalTestItems": 1
}
EOF

echo "Running authentication setup and UI tests..."

# Run authentication setup first, then UI tests
npx playwright test --project=auth-setup --project=ui-ui-test-component

echo "UI tests completed!" 