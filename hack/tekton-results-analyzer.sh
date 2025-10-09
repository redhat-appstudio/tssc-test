#!/bin/bash

# Tekton Results API Analyzer Script
# Usage: ./tekton-results-analyzer.sh <TOKEN>

set -e

# Check if token is provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <TOKEN>"
    echo "Example: $0 your-bearer-token-here"
    exit 1
fi

TOKEN="$1"
# Update this endpoint to match your target cluster's Tekton Results API before running the script.
API_ENDPOINT="https://tekton-results-api-openshift-pipelines.apps.cluster-nmwvx.nmwvx.sandbox1914.opentlc.com"
PARENT="tssc-app-ci"

# Optional: filter by a specific pipeline task label (override with PIPELINE_TASK env)
PIPELINE_TASK="${PIPELINE_TASK:-}"

# Create TaskRuns directory
mkdir -p TaskRuns

# Calculate timestamp for one week ago
if command -v date >/dev/null 2>&1; then
    # For GNU date (Linux)
    ONE_WEEK_AGO=$(date -u -d '1 week ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v-7d '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null)
else
    echo "Error: date command not found"
    exit 1
fi

# Store start date for summary
START_DATE="$ONE_WEEK_AGO"

# Build Tekton Results filter and encode it safely
FILTER="data_type=='tekton.dev/v1.TaskRun' && data.status.startTime > timestamp('$ONE_WEEK_AGO')"
if [ -n "$PIPELINE_TASK" ]; then
    FILTER="$FILTER && data.metadata.labels['tekton.dev/pipelineTask'] == \"$PIPELINE_TASK\""
fi
FILTER_ENC=$(jq -nr --arg filter "$FILTER" '$filter|@uri')

# Construct the API URL
API_URL="${API_ENDPOINT}/apis/results.tekton.dev/v1alpha2/parents/${PARENT}/results/-/records?filter=${FILTER_ENC}&order_by=create_time%20desc&page_size=1000"

# Query the API (silent)
RESPONSE=$(curl -s -k -H "Authorization: Bearer $TOKEN" "$API_URL" 2>/dev/null)

# Check if the response is valid JSON
if ! echo "$RESPONSE" | jq . >/dev/null 2>&1; then
    echo "Error: Invalid response from API" >&2
    exit 1
fi

# Extract records
RECORDS=$(echo "$RESPONSE" | jq -r '.records // empty')

if [ -z "$RECORDS" ] || [ "$RECORDS" = "null" ]; then
    echo "No TaskRuns found for the specified criteria" >&2
    exit 0
fi

# Process each record
# Use process substitution to avoid subshell issues with while read
while IFS= read -r record_b64; do
    # Skip empty lines
    if [ -z "$record_b64" ]; then
        continue
    fi
    
    # Decode the base64 record
    record=$(echo "$record_b64" | base64 -d)
    
    # Extract TaskRun name from the record
    TASKRUN_NAME=$(echo "$record" | jq -r '.data.value' | base64 -d | jq -r '.metadata.name // "unknown"')

    if [ "$TASKRUN_NAME" = "unknown" ] || [ "$TASKRUN_NAME" = "null" ] || [ -z "$TASKRUN_NAME" ]; then
        continue
    fi

    # Save the record JSON
    echo "$record" > "TaskRuns/${TASKRUN_NAME}-record.json"

    # Decode and save the TaskRun data
    echo "$record" | jq -r '.data.value' | base64 -d > "TaskRuns/${TASKRUN_NAME}.json"

    # Extract the logs URL from the record name
    RECORD_NAME=$(echo "$record" | jq -r '.name')
    LOGS_URL=$(echo "$RECORD_NAME" | sed 's|/records/|/logs/|')
    FULL_LOGS_URL="${API_ENDPOINT}/apis/results.tekton.dev/v1alpha2/parents/${LOGS_URL}"

    # Download logs (silent)
    LOGS_RESPONSE=$(curl -s -k -H "Authorization: Bearer $TOKEN" "$FULL_LOGS_URL" 2>/dev/null)

    # Save logs
    echo "$LOGS_RESPONSE" > "TaskRuns/${TASKRUN_NAME}.log"
done < <(echo "$RESPONSE" | jq -r '.records[] | @base64')

echo "All TaskRuns processed. Analyzing test results..."

# Initialize counters
PASSING_RUNS=0
FAILING_RUNS=0
CANCELLED_RUNS=0
FAILED_TESTS=()

# Analyze each TaskRun
for taskrun_file in TaskRuns/*.json; do
    if [ ! -f "$taskrun_file" ]; then
        continue
    fi
    
    # Skip record files (files ending with -record.json)
    if [[ "$taskrun_file" == *"-record.json" ]]; then
        continue
    fi
    
    TASKRUN_NAME=$(basename "$taskrun_file" .json)
    LOG_FILE="TaskRuns/${TASKRUN_NAME}.log"
    
    if [ ! -f "$LOG_FILE" ]; then
        continue
    fi

    # Check for test failures using the specific pattern from the logs
    # Look for "X failed" pattern at the end of the test run
    FAILED_COUNT=$(grep -oE "[0-9]+\s+failed" "$LOG_FILE" | tail -1 | awk '{print $1}' || echo "0")

    # Also check if there are any failed tests by looking for the pattern
    if [ -z "$FAILED_COUNT" ] || [ "$FAILED_COUNT" = "" ]; then
        FAILED_COUNT=0
    fi

    # Convert to integer
    FAILED_COUNT=$((FAILED_COUNT + 0))

    if [ "$FAILED_COUNT" -gt 0 ]; then
        FAILING_RUNS=$((FAILING_RUNS + 1))
        FAILED_TESTS+=("$TASKRUN_NAME")

        echo "Analyzing $TASKRUN_NAME..."
        echo "  ❌ $TASKRUN_NAME: $FAILED_COUNT test(s) failed"

        # Extract specific failed test details
        echo "  Failed test details:"
        grep -E "Error:|expect.*failed|test-failed" "$LOG_FILE" | head -5 | while read -r line; do
            echo "    - $line"
        done
    else
        PASSING_RUNS=$((PASSING_RUNS + 1))
    fi
done

# Capture results output
RESULTS_OUTPUT=$(cat <<EOF

---  RESULTS:
EOF
)

# Calculate total and percentages
TOTAL_RUNS=$((PASSING_RUNS + FAILING_RUNS + CANCELLED_RUNS))

if [ $TOTAL_RUNS -gt 0 ]; then
    # Calculate percentages with proper rounding
    PASSED_PCT=$(awk "BEGIN {printf \"%.0f\", ($PASSING_RUNS * 100.0 / $TOTAL_RUNS)}")
    FAILED_PCT=$(awk "BEGIN {printf \"%.0f\", ($FAILING_RUNS * 100.0 / $TOTAL_RUNS)}")
    CANCELLED_PCT=$(awk "BEGIN {printf \"%.0f\", ($CANCELLED_RUNS * 100.0 / $TOTAL_RUNS)}")

    RESULTS_OUTPUT+=$(cat <<EOF

Passed: ${PASSED_PCT}%
Failed: ${FAILED_PCT}%
EOF
)
    if [ $CANCELLED_RUNS -gt 0 ]; then
        RESULTS_OUTPUT+=$(echo -e "\nCancelled: ${CANCELLED_PCT}%")
    fi
    RESULTS_OUTPUT+=$(cat <<EOF


In total ($TOTAL_RUNS runs from $START_DATE)
EOF
)
fi

RESULTS_OUTPUT+=$(cat <<EOF

---
EOF
)

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    RESULTS_OUTPUT+=$(cat <<EOF


Failed TaskRuns:
EOF
)
    for taskrun in "${FAILED_TESTS[@]}"; do
        RESULTS_OUTPUT+=$(echo -e "\n  - $taskrun")
    done
fi

RESULTS_OUTPUT+=$(cat <<EOF


Detailed logs and data saved in TaskRuns/ directory
EOF
)

# Display results
echo "$RESULTS_OUTPUT"

# Ask user if they want to save results
echo ""
read -p "Do you want to save the results as test_result_from_$(date '+%d_%m_%Y_%H:%M')? (yes/no): " SAVE_CHOICE

if [[ "$SAVE_CHOICE" =~ ^[Yy][Ee][Ss]$|^[Yy]$ ]]; then
    RESULT_FILENAME="test_result_from_$(date '+%d_%m_%Y_%H:%M').txt"
    echo "$RESULTS_OUTPUT" > "$RESULT_FILENAME"
    echo "Results saved to: $RESULT_FILENAME"
else
    echo "Results not saved."
fi