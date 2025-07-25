import { CredentialType } from '../enums/jenkins.enums';
import { JenkinsConfig } from '../config/jenkins.config';

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
  <id>${this.escapeXml(credentialId)}</id>
  <description>Secret variable for ${this.escapeXml(credentialId)}</description>
  <secret>${this.escapeXml(secretValue)}</secret>
</org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>`;
  }

  getType(): CredentialType {
    return CredentialType.SECRET_TEXT;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
  <id>${this.escapeXml(credentialId)}</id>
  <description>Credentials for ${this.escapeXml(credentialId)}</description>
  <username>${this.escapeXml(username)}</username>
  <password>${this.escapeXml(password)}</password>
</com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>`;
  }

  getType(): CredentialType {
    return CredentialType.USERNAME_PASSWORD;
  }

  private parseCredentials(secretValue: string): [string, string] {
    const parts = secretValue.split(':');
    if (parts.length < 2) {
      throw new Error('Username/password credentials must be in format "username:password"');
    }
    
    const username = parts[0];
    const password = parts.slice(1).join(':'); // Handle passwords with colons
    
    return [username, password];
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
  <id>${this.escapeXml(credentialId)}</id>
  <description>SSH credentials for ${this.escapeXml(credentialId)}</description>
  <username>${this.escapeXml(username)}</username>
  <privateKeySource class="com.cloudbees.jenkins.plugins.sshcredentials.impl.BasicSSHUserPrivateKey$DirectEntryPrivateKeySource">
    <privateKey>${this.escapeXml(privateKey)}</privateKey>
  </privateKeySource>
  <passphrase>${this.escapeXml(passphrase || '')}</passphrase>
</com.cloudbees.jenkins.plugins.sshcredentials.impl.BasicSSHUserPrivateKey>`;
  }

  getType(): CredentialType {
    return CredentialType.SSH_USERNAME_PRIVATE_KEY;
  }

  private parseCredentials(secretValue: string): [string, string, string?] {
    const parts = secretValue.split('::');
    if (parts.length < 2) {
      throw new Error('SSH credentials must be in format "username::privateKey" or "username::privateKey::passphrase"');
    }
    
    const username = parts[0];
    const privateKey = parts[1];
    const passphrase = parts[2];
    
    return [username, privateKey, passphrase];
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
      throw new Error(`Unsupported credential type: ${type}`);
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