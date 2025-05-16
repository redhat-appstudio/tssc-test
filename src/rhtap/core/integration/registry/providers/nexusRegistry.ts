import { BaseImageRegistry, ImageRegistryType } from '../imageRegistry';

export class NexusRegistry extends BaseImageRegistry {
  constructor(organization: string, imageName: string) {
    super(organization, imageName);
    // Hardcode the secret name and namespace
    this.secretName = 'tssc-nexus-integration';
    this.secretNamespace = 'tssc';
  }

  public getRegistryType(): ImageRegistryType {
    return ImageRegistryType.NEXUS;
  }

  public getUrl(): string {
    return this.secret.endpoint || this.getRegistryHost();
  }
}
