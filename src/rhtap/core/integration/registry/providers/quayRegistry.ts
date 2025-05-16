import { BaseImageRegistry, ImageRegistryType } from '../imageRegistry';

export class QuayRegistry extends BaseImageRegistry {
  constructor(organization: string, imageName: string) {
    super(organization, imageName);
    // Hardcode the secret name and namespace
    this.secretName = 'tssc-quay-integration';
    this.secretNamespace = 'tssc';
  }

  public getRegistryType(): ImageRegistryType {
    //if registry host is quay.io, return QUAYIO
    if (this.getRegistryHost() === 'quay.io') {
      return ImageRegistryType.QUAYIO;
    }
    return ImageRegistryType.QUAY;
  }

  public getUrl(): string {
    return this.secret.url;
  }

  public getToken(): string {
    return this.secret.token;
  }
}
