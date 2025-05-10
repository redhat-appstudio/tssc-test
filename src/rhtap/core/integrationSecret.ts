//TODO: need to implement this interface
export interface IntegrationSecret {
  getIntegrationSecret(): Promise<Record<string, string>>;
}
