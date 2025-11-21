import { ContentModifications, ContentModificationsContainer } from './contentModification';

/**
 * Path to the environment configuration file in the repository
 */
const ENV_FILE_PATH = 'tssc/env.sh';

/**
 * Interface for environment variable modifications
 */
export interface EnvModification {
  /**
   * Returns a ContentModifications object with the necessary changes
   * @param value Optional value parameter for modifications that need a dynamic value
   */
  getModification(value?: string): ContentModifications;
}

/**
 * ACS modification - toggles ACS feature on/off
 */
export class DisableACS implements EnvModification {
  getModification(): ContentModifications {
    return {
      [ENV_FILE_PATH]: [
        {
          oldContent: 'export DISABLE_ACS=${DISABLE_ACS-false}',
          newContent: 'export DISABLE_ACS=true',
        },
      ],
    };
  }
}

/**
 * TUF Mirror URL modification
 */
export class UpdateTUFMirrorURL implements EnvModification {
  getModification(tufURL: string): ContentModifications {
    return {
      [ENV_FILE_PATH]: [
        {
          oldContent: 'http://tuf.tssc-tas.svc',
          newContent: tufURL,
        },
      ],
    };
  }
}

/**
 * Rokor Server URL modification
 */
export class UpdateRokorServerURL implements EnvModification {
  getModification(rokorURL: string): ContentModifications {
    return {
      [ENV_FILE_PATH]: [
        {
          oldContent: 'http://rekor-server.tssc-tas.svc',
          newContent: rokorURL,
        },
      ],
    };
  }
}

/**
 * ROX Central endpoint modification
 */
export class UpdateRoxCentralEndpoint implements EnvModification {
  getModification(roxURL: string): ContentModifications {
    return {
      [ENV_FILE_PATH]: [
        {
          oldContent: '# export ROX_CENTRAL_ENDPOINT=central-acs.apps.user.cluster.domain.com:443',
          newContent: 'export ROX_CENTRAL_ENDPOINT="' + roxURL + '"',
        },
      ],
    };
  }
}
//TODO: need to improve it to be more generic
export class UpdateCosignPublicKey implements EnvModification {
  getModification(cosignPublicKey: string): ContentModifications {
    return {
      [ENV_FILE_PATH]: [
        {
          oldContent: '# gather images params', // Use regex to match end of a line
          newContent: '# gather images params\nexport COSIGN_PUBLIC_KEY="' + cosignPublicKey + '"',
        },
      ],
    };
  }
}
//TODO: need to improve it to be more generic
export class UpdateImageRegistryUser implements EnvModification {
  getModification(username: string): ContentModifications {
    return {
      [ENV_FILE_PATH]: [
        {
          oldContent: '# gather images params',
          newContent: '# gather images params\nexport IMAGE_REGISTRY_USER="' + username + '"',
        },
      ],
    };
  }
}

/**
 * Custom Root CA modification
 */
export class UpdateCustomRootCA implements EnvModification {
  getModification(caCert: string): ContentModifications {
    return {
      'rhtap/env.sh': [
        {
          oldContent: '# gather images params',
          newContent: '# gather images params\nexport CUSTOM_ROOT_CA="' + caCert + '"',
        },
      ],
    };
  }
}
/**
 * Enum of available environment modification types
 */
export enum EnvModificationType {
  ACS = 'ACS',
  TUF_MIRROR = 'TUF_MIRROR',
  ROKOR_SERVER = 'ROKOR_SERVER',
  ROX_CENTRAL_ENDPOINT = 'ROX_CENTRAL_ENDPOINT',
  COSIGN_PUBLIC_KEY = 'COSIGN_PUBLIC_KEY',
  IMAGE_REGISTRY_USER = 'IMAGE_REGISTRY_USER',
  CUSTOM_ROOT_CA = 'CUSTOM_ROOT_CA',
}

/**
 * Factory for creating environment modifications
 */
export class EnvModificationFactory {
  /**
   * Creates an environment modification instance based on the type
   * @param type The type of environment modification to create
   * @returns An instance of the requested EnvModification
   */
  static create(type: EnvModificationType): EnvModification {
    switch (type) {
      case EnvModificationType.ACS:
        return new DisableACS();
      case EnvModificationType.TUF_MIRROR:
        return new UpdateTUFMirrorURL();
      case EnvModificationType.ROKOR_SERVER:
        return new UpdateRokorServerURL();
      case EnvModificationType.ROX_CENTRAL_ENDPOINT:
        return new UpdateRoxCentralEndpoint();
      case EnvModificationType.COSIGN_PUBLIC_KEY:
        return new UpdateCosignPublicKey();
      case EnvModificationType.IMAGE_REGISTRY_USER:
        return new UpdateImageRegistryUser();
      case EnvModificationType.CUSTOM_ROOT_CA:
        return new UpdateCustomRootCA();
      default:
        throw new Error(`Unknown environment modification type: ${type}`);
    }
  }
}

/**
 * RhtapEnvModifier class to manage environment modifications
 * Example usage:
 * const modifier = RhtapEnvModifier.create()
 *   .enableACS()
 *   .updateTUFMirrorURL('http://new-tuf-url')
 *   .updateRokorServerURL('http://new-rekor-url')
 *   .updateRoxCentralEndpoint('http://new-rox-url');
 * const modifications = modifier.getModifications();
 * console.log(modifications);
 * This will create a ContentModifications object with the specified changes.
 * The modifications can then be applied to the relevant files.
 * Note: The methods are chainable, allowing for a fluent interface.
 */
export class RhtapEnvModifier {
  private container: ContentModificationsContainer;

  private constructor() {
    this.container = new ContentModificationsContainer();
  }

  disableACS(): RhtapEnvModifier {
    const modification = EnvModificationFactory.create(EnvModificationType.ACS).getModification();
    this.container.merge(modification);
    return this;
  }

  updateTUFMirrorURL(tufURL: string): RhtapEnvModifier {
    const modification = EnvModificationFactory.create(
      EnvModificationType.TUF_MIRROR
    ).getModification(tufURL);
    this.container.merge(modification);
    return this;
  }

  updateRokorServerURL(rokorURL: string): RhtapEnvModifier {
    const modification = EnvModificationFactory.create(
      EnvModificationType.ROKOR_SERVER
    ).getModification(rokorURL);
    this.container.merge(modification);
    return this;
  }

  updateRoxCentralEndpoint(roxURL: string): RhtapEnvModifier {
    const modification = EnvModificationFactory.create(
      EnvModificationType.ROX_CENTRAL_ENDPOINT
    ).getModification(roxURL);
    this.container.merge(modification);
    return this;
  }

  updateCosignPublicKey(cosignPublicKey: string): RhtapEnvModifier {
    const modification = EnvModificationFactory.create(
      EnvModificationType.COSIGN_PUBLIC_KEY
    ).getModification(cosignPublicKey);
    this.container.merge(modification);
    return this;
  }

  updateImageRegistryUser(username: string): RhtapEnvModifier {
    const modification = EnvModificationFactory.create(
      EnvModificationType.IMAGE_REGISTRY_USER
    ).getModification(username);
    this.container.merge(modification);
    return this;
  }

  updateCustomRootCA(caCert: string): RhtapEnvModifier {
    const modification = EnvModificationFactory.create(
      EnvModificationType.CUSTOM_ROOT_CA
    ).getModification(caCert);
    this.container.merge(modification);
    return this;
  }

  getModifications(): ContentModifications {
    return this.container.getModifications();
  }

  // Updated to align with the latest ContentModificationsContainer usage
  applyModifications(content: string): string {
    return this.container.applyToContent(ENV_FILE_PATH, content);
  }

  // Static factory method for easy creation
  static create(): RhtapEnvModifier {
    return new RhtapEnvModifier();
  }
}
