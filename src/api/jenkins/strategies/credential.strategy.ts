import { CredentialType } from '../enums/jenkins.enums';
import { JenkinsConfig } from '../config/jenkins.config';
import { JenkinsXmlBuilder } from '../utils/jenkins.utils';
import { JenkinsCredentialError } from '../errors/jenkins.errors';

/**
 * Interface for credential creation strategies
 */
export interface CredentialStrategy {
  buildXml(credentialId: string, secretValue: string): string;
  getType(): CredentialType;
}

/**
 * Strategy for creating secret text credentials
 */
export class SecretTextCredentialStrategy implements CredentialStrategy {
  buildXml(credentialId: string, secretValue: string): string {
    return `<org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl plugin="${JenkinsConfig.PLUGINS.PLAIN_CREDENTIALS}">
  <scope>GLOBAL</scope>
  <id>${JenkinsXmlBuilder.escapeXml(credentialId)}</id>
  <description>Secret variable for ${JenkinsXmlBuilder.escapeXml(credentialId)}</description>
  <secret>${JenkinsXmlBuilder.escapeXml(secretValue)}</secret>
</org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>`;
  }

  getType(): CredentialType {
    return CredentialType.SECRET_TEXT;
  }
}

/**
 * Strategy for creating username/password credentials
 */
export class UsernamePasswordCredentialStrategy implements CredentialStrategy {
  buildXml(credentialId: string, secretValue: string): string {
    const [username, password] = this.parseCredentials(secretValue);
    
    return `<com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
  <scope>GLOBAL</scope>
  <id>${JenkinsXmlBuilder.escapeXml(credentialId)}</id>
  <description>Credentials for ${JenkinsXmlBuilder.escapeXml(credentialId)}</description>
  <username>${JenkinsXmlBuilder.escapeXml(username)}</username>
  <password>${JenkinsXmlBuilder.escapeXml(password)}</password>
</com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>`;
  }

  getType(): CredentialType {
    return CredentialType.USERNAME_PASSWORD;
  }

  private parseCredentials(secretValue: string): [string, string] {
    const parts = secretValue.split(':');
    if (parts.length < 2) {
      throw new JenkinsCredentialError('Username/password credentials must be in format "username:password"', 'Invalid format');
    }
    
    const username = parts[0];
    const password = parts.slice(1).join(':'); // Handle passwords with colons
    
    return [username, password];
  }
}

/**
 * Strategy for creating SSH private key credentials
 */
export class SshPrivateKeyCredentialStrategy implements CredentialStrategy {
  buildXml(credentialId: string, secretValue: string): string {
    const [username, privateKey, passphrase] = this.parseCredentials(secretValue);
    
    return `<com.cloudbees.jenkins.plugins.sshcredentials.impl.BasicSSHUserPrivateKey plugin="ssh-credentials">
  <scope>GLOBAL</scope>
  <id>${JenkinsXmlBuilder.escapeXml(credentialId)}</id>
  <description>SSH credentials for ${JenkinsXmlBuilder.escapeXml(credentialId)}</description>
  <username>${JenkinsXmlBuilder.escapeXml(username)}</username>
  <privateKeySource class="com.cloudbees.jenkins.plugins.sshcredentials.impl.BasicSSHUserPrivateKey$DirectEntryPrivateKeySource">
    <privateKey>${JenkinsXmlBuilder.escapeXml(privateKey)}</privateKey>
  </privateKeySource>
  <passphrase>${JenkinsXmlBuilder.escapeXml(passphrase || '')}</passphrase>
</com.cloudbees.jenkins.plugins.sshcredentials.impl.BasicSSHUserPrivateKey>`;
  }

  getType(): CredentialType {
    return CredentialType.SSH_USERNAME_PRIVATE_KEY;
  }

  private parseCredentials(secretValue: string): [string, string, string?] {
    const parts = secretValue.split('::');
    if (parts.length < 2) {
      throw new JenkinsCredentialError('SSH credentials must be in format "username::privateKey" or "username::privateKey::passphrase"', 'Invalid format');
    }
    
    const username = parts[0];
    const privateKey = parts[1];
    const passphrase = parts[2];
    
    return [username, privateKey, passphrase];
  }
}

/**
 * Factory for creating credential strategies
 */
export class CredentialStrategyFactory {
  private static strategies = new Map<CredentialType, CredentialStrategy>([
    [CredentialType.SECRET_TEXT, new SecretTextCredentialStrategy()],
    [CredentialType.USERNAME_PASSWORD, new UsernamePasswordCredentialStrategy()],
    [CredentialType.SSH_USERNAME_PRIVATE_KEY, new SshPrivateKeyCredentialStrategy()],
  ]);

  /**
   * Create a credential strategy for the given type
   */
  static create(type: CredentialType): CredentialStrategy {
    const strategy = this.strategies.get(type);
    
    if (!strategy) {
      throw new JenkinsCredentialError(`Unsupported credential type: ${type}`, 'Unsupported Type');
    }
    
    return strategy;
  }

  /**
   * Get all supported credential types
   */
  static getSupportedTypes(): CredentialType[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Check if a credential type is supported
   */
  static isSupported(type: CredentialType): boolean {
    return this.strategies.has(type);
  }
}