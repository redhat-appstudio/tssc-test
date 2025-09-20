import { JenkinsHttpClient } from '../http/jenkins-http.client';
import { JenkinsApiResponse } from '../types/jenkins.types';
import { CredentialType } from '../enums/jenkins.enums';
import { JenkinsConfig } from '../config/jenkins.config';
import { JenkinsPathBuilder } from '../utils/jenkins.utils';
import { CredentialStrategyFactory } from '../strategies/credential.strategy';
import { JenkinsCredentialError } from '../errors/jenkins.errors';

/**
 * Service for Jenkins credential-related operations
 */
export class JenkinsCredentialService {
  constructor(private httpClient: JenkinsHttpClient) {}

  /**
   * Create a credential in Jenkins
   */
  async createCredential(
    folderName: string,
    credentialId: string,
    secretValue: string,
    credentialType: CredentialType = CredentialType.SECRET_TEXT
  ): Promise<JenkinsApiResponse> {
    try {
      // Get the appropriate strategy for the credential type
      const strategy = CredentialStrategyFactory.create(credentialType);
      
      // Build the credential XML using the strategy
      const credentialXml = strategy.buildXml(credentialId, secretValue);
      
      // Determine the path based on whether folder is specified
      const path = JenkinsPathBuilder.buildCredentialPath(folderName);

      const response = await this.httpClient.postRaw(path, credentialXml, { headers: JenkinsConfig.HEADERS.XML });

      return {
        success: response.status >= 200 && response.status < 300,
        status: response.status,
        data: response.data,
        location: response.headers['location']
      };
    } catch (error) {
      throw new JenkinsCredentialError(
        credentialId,
        error instanceof Error ? error.message : 'Unknown error creating credential'
      );
    }
  }

  /**
   * Update an existing credential
   */
  async updateCredential(
    folderName: string,
    credentialId: string,
    secretValue: string,
    credentialType: CredentialType = CredentialType.SECRET_TEXT
  ): Promise<JenkinsApiResponse> {
    try {
      // Get the appropriate strategy for the credential type
      const strategy = CredentialStrategyFactory.create(credentialType);
      
      // Build the credential XML using the strategy
      const credentialXml = strategy.buildXml(credentialId, secretValue);
      
      // Build path for updating credential
      const basePath = folderName
        ? `job/${encodeURIComponent(folderName)}/credentials/store/folder/domain/_/credential/${encodeURIComponent(credentialId)}`
        : `credentials/store/system/domain/_/credential/${encodeURIComponent(credentialId)}`;
      
      const path = `${basePath}/config.xml`;

      const response = await this.httpClient.postRaw(path, credentialXml, { headers: JenkinsConfig.HEADERS.XML });

      return {
        success: response.status >= 200 && response.status < 300,
        status: response.status,
        data: response.data,
        location: response.headers['location']
      };
    } catch (error) {
      throw new JenkinsCredentialError(
        credentialId,
        error instanceof Error ? error.message : 'Unknown error updating credential'
      );
    }
  }

  /**
   * Delete a credential
   */
  async deleteCredential(folderName: string, credentialId: string): Promise<JenkinsApiResponse> {
    try {
      // Build path for deleting credential
      const basePath = folderName
        ? `job/${encodeURIComponent(folderName)}/credentials/store/folder/domain/_/credential/${encodeURIComponent(credentialId)}`
        : `credentials/store/system/domain/_/credential/${encodeURIComponent(credentialId)}`;
      
      const path = `${basePath}/doDelete`;

      const response = await this.httpClient.postRaw(path, '', { headers: JenkinsConfig.HEADERS.JSON });

      return {
        success: response.status >= 200 && response.status < 300,
        status: response.status,
        data: response.data,
        location: response.headers['location']
      };
    } catch (error) {
      throw new JenkinsCredentialError(
        credentialId,
        error instanceof Error ? error.message : 'Unknown error deleting credential'
      );
    }
  }

  /**
   * Check if a credential exists
   */
  async credentialExists(folderName: string, credentialId: string): Promise<boolean> {
    try {
      await this.getCredential(folderName, credentialId);
      return true;
    } catch (error) {
      if (error instanceof JenkinsCredentialError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get credential information (without sensitive data)
   */
  async getCredential(folderName: string, credentialId: string): Promise<any> {
    try {
      // Build path for getting credential info
      const basePath = folderName
        ? `job/${encodeURIComponent(folderName)}/credentials/store/folder/domain/_/credential/${encodeURIComponent(credentialId)}`
        : `credentials/store/system/domain/_/credential/${encodeURIComponent(credentialId)}`;
      
      const path = `${basePath}/${JenkinsConfig.ENDPOINTS.API_JSON}`;

      const response = await this.httpClient.getRaw(path, { headers: JenkinsConfig.HEADERS.JSON });

      return {
        success: response.status >= 200 && response.status < 300,
        status: response.status,
        data: response.data,
        location: response.headers['location']
      };
    } catch (error) {
      throw new JenkinsCredentialError(
        credentialId,
        'Credential not found or not accessible'
      );
    }
  }

  /**
   * List all credentials in a domain
   */
  async listCredentials(folderName?: string): Promise<any[]> {
    try {
      // Build path for listing credentials
      const basePath = folderName
        ? `job/${encodeURIComponent(folderName)}/credentials/store/folder/domain/_`
        : `credentials/store/system/domain/_`;
      
      const path = `${basePath}/${JenkinsConfig.ENDPOINTS.API_JSON}`;

      const response = await this.httpClient.get<{ credentials: any[] }>(
        path + '?tree=credentials[id,description,typeName]',
        { headers: JenkinsConfig.HEADERS.JSON }
      );

      return response.credentials || [];
    } catch (error) {
      throw new JenkinsCredentialError(
        'list',
        error instanceof Error ? error.message : 'Unknown error listing credentials'
      );
    }
  }

  /**
   * Create secret text credential (convenience method)
   */
  async createSecretTextCredential(
    folderName: string,
    credentialId: string,
    secretValue: string
  ): Promise<JenkinsApiResponse> {
    return this.createCredential(folderName, credentialId, secretValue, CredentialType.SECRET_TEXT);
  }

  /**
   * Create username/password credential (convenience method)
   */
  async createUsernamePasswordCredential(
    folderName: string,
    credentialId: string,
    username: string,
    password: string
  ): Promise<JenkinsApiResponse> {
    const secretValue = `${username}:${password}`;
    return this.createCredential(folderName, credentialId, secretValue, CredentialType.USERNAME_PASSWORD);
  }

  /**
   * Create SSH private key credential (convenience method)
   */
  async createSshPrivateKeyCredential(
    folderName: string,
    credentialId: string,
    username: string,
    privateKey: string,
    passphrase?: string
  ): Promise<JenkinsApiResponse> {
    const secretValue = passphrase 
      ? `${username}::${privateKey}::${passphrase}`
      : `${username}::${privateKey}`;
    return this.createCredential(folderName, credentialId, secretValue, CredentialType.SSH_USERNAME_PRIVATE_KEY);
  }

  /**
   * Get supported credential types
   */
  getSupportedCredentialTypes(): CredentialType[] {
    return CredentialStrategyFactory.getSupportedTypes();
  }

  /**
   * Check if a credential type is supported
   */
  isCredentialTypeSupported(type: CredentialType): boolean {
    return CredentialStrategyFactory.isSupported(type);
  }
} 