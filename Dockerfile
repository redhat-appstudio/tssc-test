# Multi-stage build for tools
FROM registry.redhat.io/openshift4/ose-tools-rhel9@sha256:99ed609a9bf8f1bc34ab63d2e8e49818d90aa7b3b2fc963cfc35a15c2f3cde16 AS ose-tools

# Builder stage for ArgoCD CLI
FROM registry.access.redhat.com/ubi9/ubi:9.7-1763340522 AS builder

# Install ArgoCD CLI
RUN VERSION=$(curl -L -s https://raw.githubusercontent.com/argoproj/argo-cd/stable/VERSION) \
    && curl -sSL -o argocd-linux-amd64 https://github.com/argoproj/argo-cd/releases/download/v$VERSION/argocd-linux-amd64 \
    && install -m 555 argocd-linux-amd64 /usr/local/bin/argocd \
    && rm argocd-linux-amd64 \
    && argocd version --client

# Install yq
ARG YQ_VERSION=4.47.1
RUN curl --proto "=https" --tlsv1.2 -sSf -L "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64" -o /usr/local/bin/yq \
    && chmod +x /usr/local/bin/yq \
    && yq --version

# Final stage
FROM registry.access.redhat.com/ubi9/nodejs-20:9.7-1764046016

LABEL name="tssc-test" \
    maintainers="TSSC Team"

WORKDIR /tssc-test

# Switch to root
USER 0

# Copy tools from ose-tools stage
COPY --from=ose-tools /usr/bin/jq /usr/bin/kubectl /usr/bin/oc /usr/bin/vi /usr/bin/
# Copy required libraries for jq
COPY --from=ose-tools /usr/lib64/libjq.so.1 /usr/lib64/libonig.so.5 /usr/lib64/
# Copy vi libraries
COPY --from=ose-tools /usr/libexec/vi /usr/libexec/
# Copy ArgoCD CLI from builder stage
COPY --from=builder /usr/local/bin/argocd /usr/local/bin/argocd
# Copy yq from builder stage
COPY --from=builder /usr/local/bin/yq /usr/local/bin/yq

# Verify tools installation (fail fast if tools are broken)
RUN echo "=== Verifying tool installations ===" && \
    jq --version && \
    yq --version && \
    kubectl version --client && \
    oc version --client && \
    argocd version --client && \
    echo "=== All tools verified successfully ==="

# Copy application source code
COPY . .

# Install npm packages, system dependencies, and Playwright browsers
RUN npm install && \
    npm cache clean --force && \
    yum install -y --allowerasing \
    wget \
    nss at-spi2-atk libdrm gtk3 mesa-libgbm alsa-lib \
    libXcomposite libXcursor libXdamage libXext libXi \
    libXrandr libXScrnSaver libXtst pango atk cairo-gobject \
    gdk-pixbuf2 \
    && yum clean all && \
    npx playwright install chromium

# Change ownership of all files to the final user
RUN chown -R 1001:0 /tssc-test

# Switch to the non-root user
USER 1001

# Set environment variables for the running application
ENV KUBECONFIG=/tssc-test/.kube/config \
    NPM_CONFIG_CACHE=/tmp/.npm
