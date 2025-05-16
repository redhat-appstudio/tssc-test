import { BaseImageRegistry, ImageRegistryType } from '../imageRegistry';

export class ArtifactoryRegistry extends BaseImageRegistry {
  constructor(organization: string, imageName: string) {
    super(organization, imageName);
    // Hardcode the secret name and namespace
    this.secretName = 'tssc-artifactory-integration';
    this.secretNamespace = 'tssc';
  }

  public getRegistryType(): ImageRegistryType {
    return ImageRegistryType.ARTIFACTORY;
  }

  public getUrl(): string {
    return this.secret.url || this.getRegistryHost();
  }
}
