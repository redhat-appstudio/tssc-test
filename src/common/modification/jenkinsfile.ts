import { ContentModifications, ContentModificationsContainer } from './contentModification';

/**
 * Interface for Jenkinsfile modifications
 */
export interface JenkinsfileModification {
  /**
   * Returns a ContentModifications object with the necessary changes
   * @param value Optional value parameter for modifications that need a dynamic value
   */
  getModification(value?: string): ContentModifications;
}

/**
 * Concrete implementation for Kubernetes agent configuration
 */
export class KubernetesAgentModification implements JenkinsfileModification {
  private readonly agentImage: string = 'quay.io/jkopriva/rhtap-jenkins-agent:0.2';

  getModification(): ContentModifications {
    return {
      Jenkinsfile: [
        {
          oldContent: 'agent any',
          newContent:
            "agent {\n  kubernetes {\n    label 'jenkins-agent'\n    cloud 'openshift'\n    serviceAccount 'jenkins'\n    podRetention onFailure()\n    idleMinutes '5'\n    containerTemplate {\n     name 'jnlp'\n     image '" +
            this.agentImage +
            "'\n     ttyEnabled true\n     args '${computer.jnlpmac} ${computer.name}'\n   }\n   }\n}",
        },
      ],
    };
  }
}

/**
 * Concrete implementation for registry credentials configuration
 */
export class EnableRegistryUserModification implements JenkinsfileModification {
  getModification(): ContentModifications {
    return {
      Jenkinsfile: [
        {
          oldContent: "/* IMAGE_REGISTRY_USER = credentials('IMAGE_REGISTRY_USER') */",
          newContent: "IMAGE_REGISTRY_USER = credentials('IMAGE_REGISTRY_USER')",
        },
      ],
    };
  }
}

export class EnableRegistryPasswordModification implements JenkinsfileModification {
  getModification(): ContentModifications {
    return {
      Jenkinsfile: [
        {
          oldContent: "/* IMAGE_REGISTRY_PASSWORD = credentials('IMAGE_REGISTRY_PASSWORD') */",
          newContent: "IMAGE_REGISTRY_PASSWORD = credentials('IMAGE_REGISTRY_PASSWORD')",
        },
      ],
    };
  }
}

/**
 * Concrete implementation for Quay credentials configuration
 */
export class DisableQuayIOCredentialsModification implements JenkinsfileModification {
  getModification(): ContentModifications {
    return {
      Jenkinsfile: [
        {
          oldContent: "QUAY_IO_CREDS = credentials('QUAY_IO_CREDS')",
          newContent: "/* QUAY_IO_CREDS = credentials('QUAY_IO_CREDS') */",
        },
      ],
    };
  }
}

// TODO: need to fix, this only is applied to the gitopts repo
export class EnableCosignPublicKeyModification implements JenkinsfileModification {
  getModification(): ContentModifications {
    return {
      Jenkinsfile: [
        {
          oldContent: "/* COSIGN_PUBLIC_KEY = credentials('COSIGN_PUBLIC_KEY') */",
          newContent: "COSIGN_PUBLIC_KEY = credentials('COSIGN_PUBLIC_KEY')",
        },
      ],
    };
  }
}

export class EnableTPAVariablesModification implements JenkinsfileModification {
  getModification(): ContentModifications {
    return {
      Jenkinsfile: [
        {
          oldContent: "/* TRUSTIFICATION_BOMBASTIC_API_URL = credentials('TRUSTIFICATION_BOMBASTIC_API_URL') */",
          newContent: "TRUSTIFICATION_BOMBASTIC_API_URL = credentials('TRUSTIFICATION_BOMBASTIC_API_URL')",
        },
        {
          oldContent: "/* TRUSTIFICATION_OIDC_ISSUER_URL = credentials('TRUSTIFICATION_OIDC_ISSUER_URL') */",
          newContent: "TRUSTIFICATION_OIDC_ISSUER_URL = credentials('TRUSTIFICATION_OIDC_ISSUER_URL')",
        },
        {
          oldContent: "/* TRUSTIFICATION_OIDC_CLIENT_ID = credentials('TRUSTIFICATION_OIDC_CLIENT_ID') */",
          newContent: "TRUSTIFICATION_OIDC_CLIENT_ID = credentials('TRUSTIFICATION_OIDC_CLIENT_ID')",
        },
        {
          oldContent: "/* TRUSTIFICATION_OIDC_CLIENT_SECRET = credentials('TRUSTIFICATION_OIDC_CLIENT_SECRET') */",
          newContent: "TRUSTIFICATION_OIDC_CLIENT_SECRET = credentials('TRUSTIFICATION_OIDC_CLIENT_SECRET')",
        },
        {
          oldContent: "/* TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION = credentials('TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION') */",
          newContent: "TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION = credentials('TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION')",
        },
      ],
    };
  }
}
/**
 * Enum of available Jenkinsfile modification types
 */
export enum JenkinsfileModificationType {
  KUBERNETES_AGENT = 'KUBERNETES_AGENT',
  REGISTRY_USER = 'REGISTRY_USER',
  REGISTRY_PASSWORD = 'REGISTRY_PASSWORD',
  DISABLE_QUAY_CREDENTIALS = 'DISABLE_QUAY_CREDENTIALS',
  ENABLE_COSIGN_PUBLIC_KEY = 'ENABLE_COSIGN_PUBLIC_KEY',
  ENABLE_TPA_VARIABLES = 'ENABLE_TPA_VARIABLES',
}

/**
 * Factory for creating Jenkinsfile modifications
 */
export class JenkinsfileModificationFactory {
  /**
   * Creates a Jenkinsfile modification instance based on the type
   * @param type The type of Jenkinsfile modification to create
   * @returns An instance of the requested JenkinsfileModification
   */
  static create(type: JenkinsfileModificationType): JenkinsfileModification {
    switch (type) {
      case JenkinsfileModificationType.KUBERNETES_AGENT:
        return new KubernetesAgentModification();
      case JenkinsfileModificationType.REGISTRY_USER:
        return new EnableRegistryUserModification();
      case JenkinsfileModificationType.REGISTRY_PASSWORD:
        return new EnableRegistryPasswordModification();
      case JenkinsfileModificationType.DISABLE_QUAY_CREDENTIALS:
        return new DisableQuayIOCredentialsModification();
      case JenkinsfileModificationType.ENABLE_COSIGN_PUBLIC_KEY:
        return new EnableCosignPublicKeyModification();
      case JenkinsfileModificationType.ENABLE_TPA_VARIABLES:
        return new EnableTPAVariablesModification();
      default:
        throw new Error(`Unknown Jenkinsfile modification type: ${type}`);
    }
  }
}

/**
 * JenkinsfileModifier class to manage Jenkinsfile modifications
 * Example usage:
 * const modifier = JenkinsfileModifier.create()
 *   .updateKubernetesAgentConfig()
 *   .enableRegistryUser()
 *   .enableRegistryPassword()
 *   .disableQuayCredentials();
 * const modifications = modifier.getModifications();
 * This will create a ContentModifications object with the specified changes.
 * The modifications can then be applied to the relevant files.
 * Note: The methods are chainable, allowing for a fluent interface.
 */
export class JenkinsfileModifier {
  private container: ContentModificationsContainer;

  private constructor() {
    this.container = new ContentModificationsContainer();
  }

  updateKubernetesAgentConfig(): JenkinsfileModifier {
    const modification = JenkinsfileModificationFactory.create(
      JenkinsfileModificationType.KUBERNETES_AGENT
    ).getModification();
    this.container.merge(modification);
    return this;
  }

  enableRegistryUser(): JenkinsfileModifier {
    const modification = JenkinsfileModificationFactory.create(
      JenkinsfileModificationType.REGISTRY_USER
    ).getModification();
    this.container.merge(modification);
    return this;
  }

  enableRegistryPassword(): JenkinsfileModifier {
    const modification = JenkinsfileModificationFactory.create(
      JenkinsfileModificationType.REGISTRY_PASSWORD
    ).getModification();
    this.container.merge(modification);
    return this;
  }

  disableQuayCredentials(): JenkinsfileModifier {
    const modification = JenkinsfileModificationFactory.create(
      JenkinsfileModificationType.DISABLE_QUAY_CREDENTIALS
    ).getModification();
    this.container.merge(modification);
    return this;
  }

  enableCosignPublicKey(): JenkinsfileModifier {
    const modification = JenkinsfileModificationFactory.create(
      JenkinsfileModificationType.ENABLE_COSIGN_PUBLIC_KEY
    ).getModification();
    this.container.merge(modification);
    return this;
  }

  enableTPAVariables(): JenkinsfileModifier {
    const modification = JenkinsfileModificationFactory.create(
      JenkinsfileModificationType.ENABLE_TPA_VARIABLES
    ).getModification();
    this.container.merge(modification);
    return this;
  }

  getModifications(): ContentModifications {
    return this.container.getModifications();
  }

  // Apply modifications directly to content
  applyModifications(content: string): string {
    return this.container.applyToContent('Jenkinsfile', content);
  }

  // Static factory method for easy creation
  static create(): JenkinsfileModifier {
    return new JenkinsfileModifier();
  }

  getAllJenkinsfileModifications(): ContentModifications {
    return JenkinsfileModifier.create()
      .updateKubernetesAgentConfig()
      .enableRegistryUser()
      .enableRegistryPassword()
      .disableQuayCredentials()
      .enableCosignPublicKey()
      .getModifications();
  }

  static applyModification(content: string, modification: ContentModifications): string {
    let modifiedContent = content;

    // Apply each modification to the content
    for (const [filePath, changes] of Object.entries(modification)) {
      if (filePath === 'Jenkinsfile') {
        for (const change of changes) {
          modifiedContent = modifiedContent.replace(change.oldContent, change.newContent);
        }
      }
    }

    return modifiedContent;
  }
}

// Export JenkinsfileModifier as default
export default JenkinsfileModifier;
