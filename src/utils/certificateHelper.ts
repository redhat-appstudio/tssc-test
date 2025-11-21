import * as https from 'https';
import { URL } from 'url';

export interface CertificateInfo {
  isTrusted: boolean;
  error?: string;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
}

/**
 * Check if a URL has a trusted certificate
 */
export async function checkCertificateTrust(url: string): Promise<CertificateInfo> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    
    if (!isHttps) {
      resolve({
        isTrusted: true,
        error: 'Not an HTTPS URL - no certificate to check'
      });
      return;
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      // This will cause the request to fail if certificate is not trusted
      rejectUnauthorized: true,
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      // If we get here, the certificate is trusted
      const cert = (res.socket as any).getPeerCertificate();
      resolve({
        isTrusted: true,
        subject: cert.subject?.CN || 'Unknown',
        issuer: cert.issuer?.CN || 'Unknown',
        validFrom: cert.valid_from,
        validTo: cert.valid_to
      });
    });

    req.on('error', (error: any) => {
      // Check if it's a certificate error
      if (error.message.includes('certificate') || 
          error.message.includes('CERT') ||
          error.message.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') ||
          error.message.includes('self signed certificate')) {
        resolve({
          isTrusted: false,
          error: error.message
        });
      } else {
        resolve({
          isTrusted: false,
          error: `Connection error: ${error.message}`
        });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        isTrusted: false,
        error: 'Request timeout'
      });
    });

    req.end();
  });
}

/**
 * Check if a cluster uses self-signed certificates
 * @param clusterUrl - The URL to test (e.g., Developer Hub URL)
 * @returns Promise<boolean> - true if self-signed certificates detected
 */
export async function isSelfSignedCluster(clusterUrl: string): Promise<boolean> {
  try {
    const certInfo = await checkCertificateTrust(clusterUrl);
    return !certInfo.isTrusted;
  } catch (error) {
    console.warn(`Failed to check certificate trust for ${clusterUrl}:`, error);
    return false; // Assume trusted if we can't determine
  }
}



