import retry from 'async-retry';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { LoggerFactory } from '../../logger/factory/loggerFactory';
import { Logger } from '../../logger/logger';

/**
 * Custom error class for TPA API errors
 */
export class TPAError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TPAError';
  }
}

/**
 * Interface for a component described in an SBOM
 */
export interface SBOMComponent {
  id: string;
  name: string;
  group: string | null;
  version: string;
  purl: string[];
  cpe: string[];
}

/**
 * Interface for the SBOM result returned by TPA API
 */
export interface SBOMResult {
  id: string;
  document_id: string;
  labels?: {
    type: string;
  };
  published: string;
  name: string;
  number_of_packages?: number;
  sha256: string;
  sha384?: string;
  sha512?: string;
  size?: number;
  ingested?: string;
  described_by?: SBOMComponent[];
}

/**
 * Configuration options for TPAClient
 */
export interface TPAClientConfig {
  bombasticApiUrl: string;
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcClientSecret: string;
  retryOptions?: {
    retries: number;
    factor: number;
    minTimeout: number;
    maxTimeout: number;
    randomize: boolean;
  };
}

/**
 * Client for interacting with the Trusted Package Analysis (TPA) API
 */
export class TPAClient {
  private token: string = '';
  private readonly axiosInstance: AxiosInstance;
  private readonly retryOptions: Required<TPAClientConfig>['retryOptions'];
  private readonly logger: Logger;

  /**
   * Creates a new TPAClient instance
   *
   * @param config - Configuration options for the client
   */
  constructor(private readonly config: TPAClientConfig) {
    this.logger = LoggerFactory.getLogger('tpa.client');
    this.axiosInstance = axios.create({
      headers: {
        Accept: '*/*',
      },
    });

    this.retryOptions = config.retryOptions ?? {
      retries: 10,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 15000,
      randomize: true,
    };
  }

  /**
   * Initializes or refreshes the access token for API calls
   *
   * @throws {TPAError} if token acquisition fails
   */
  public async initAccessToken(): Promise<void> {
    try {
      const tokenEndpoint = `${this.config.oidcIssuerUrl}/protocol/openid-connect/token`;

      const response = await this.axiosInstance.post(
        tokenEndpoint,
        {
          client_id: this.config.oidcClientId,
          client_secret: this.config.oidcClientSecret,
          grant_type: 'client_credentials',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      if (!response.data?.access_token) {
        throw new TPAError('Access token not found in response');
      }

      this.token = response.data.access_token;
    } catch (error) {
      const message = 'Error getting TPA token';
      this.logger.error('{}: {}', message, error);
      throw new TPAError(message, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Ensures a valid token is available, obtaining a new one if needed
   *
   * @private
   */
  private async ensureTokenAvailable(): Promise<void> {
    if (!this.token) {
      await this.initAccessToken();
    }
  }

  /**
   * Makes an authenticated request to the TPA API
   *
   * @private
   * @param config - Axios request configuration
   * @returns The response data
   * @throws {TPAError} if the request fails
   */
  private async makeAuthenticatedRequest<T>(config: AxiosRequestConfig): Promise<T> {
    await this.ensureTokenAvailable();

    try {
      const response = await this.axiosInstance.request<T>({
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${this.token}`,
        },
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        // Handle auth errors - refresh token and throw to allow retry
        if (axiosError.response?.status === 401) {
          this.logger.info('Token expired. Refreshing...');
          await this.initAccessToken();
          throw axiosError;
        }

        // For other errors, provide context
        throw new TPAError(`API request failed: ${axiosError.message}`, axiosError);
      }

      throw new TPAError(
        'Unexpected error during API request',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Normalizes an SBOM result from the API
   *
   * @private
   * @param result - Raw result from the API
   * @returns Normalized SBOM result
   */
  private normalizeSBOMResult(result: any): SBOMResult {
    return {
      ...result,
      labels: result.labels || { type: 'unknown' },
      described_by: result.described_by || [],
    };
  }

  /**
   * Finds SBOMs by name using the TPA API with retry capability
   *
   * @param name - The name to search for (empty string returns all SBOMs)
   * @returns A promise that resolves to an array of SBOM results
   * @throws {TPAError} if all retries fail
   */
  public async findSBOMsByName(name: string): Promise<SBOMResult[]> {
    const searchUrl = `${this.config.bombasticApiUrl}/api/v2/sbom`;
    this.logger.info('Searching for SBOM with name: {} at {}', name, searchUrl);

    // Define the operation to retry
    const operation = async (): Promise<SBOMResult[]> => {
      try {
        const allItems: any[] = [];
        const limit = 100;  // Number of items to fetch per API request (page size)
        let offset = 0;     // Starting index for pagination; increases by 'limit' each loop
        let moreItems = true;

        interface SearchResponse {
          total: number;
          items: any[];
        }

        while (moreItems) {
          const searchParams = {
            ...(name ? { q: name } : {}),
            limit,
            offset,
          };
          const response = await this.makeAuthenticatedRequest<SearchResponse>({
            method: 'GET',
            url: `${this.config.bombasticApiUrl}/api/v2/sbom`,
            params: searchParams,
          });

          allItems.push(...response.items);

          if (response.items.length < limit) {
            moreItems = false;
            break;
          };
          offset += limit;
        }
        allItems.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
        if (allItems.length > 0) {
          this.logger.info('SBOM search for \'{}\' successful. Found {} result(s).', name, allItems.length);
          const sbomResponse = allItems.map(item => this.normalizeSBOMResult(item));
          return sbomResponse;
        }
        this.logger.info('No SBOMs found for \'{}\'.', name);
        return [];
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;

          // Don't retry for 404 (not found) responses - they're expected
          if (axiosError.response?.status === 404) {
            this.logger.info('No SBOMs found for \'{}\'.', name);
            return [];
          }

          // For server errors (5xx), retry by re-throwing
          if (axiosError.response && axiosError.response.status >= 500) {
            this.logger.error('Server error ({}). Retrying...', axiosError.response.status);
            throw axiosError;
          }
        }

        // Re-throw to allow retry mechanism to work
        throw error;
      }
    };

    try {
      return await retry(operation, this.retryOptions);
    } catch (error) {
      const message = `All ${this.retryOptions.retries} attempts to find SBOMs for '${name}' have failed`;
      this.logger.error('{}: {}', message, error);
      throw new TPAError(message, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Finds all available SBOMs
   *
   * @returns A promise that resolves to an array of all SBOM results
   * @throws {TPAError} if all retries fail
   */
  public async findAllSBOMs(): Promise<SBOMResult[]> {
    this.logger.info('Finding all SBOMs...');
    const sboms = await this.findSBOMsByName('');
    this.logger.info('Found {} SBOM(s).', sboms.length);
    return sboms;
  }

  /**
   * Finds an SBOM by its SHA256 hash
   *
   * @param sha256 - The SHA256 hash to search for
   * @returns A promise that resolves to the matching SBOM or null if not found
   * @throws {TPAError} if all retries fail
   */
  public async findSBOMBySha256(sha256: string): Promise<SBOMResult | null> {
    this.logger.info('Searching for SBOM with SHA256: {}', sha256);
    if (!sha256) {
      throw new TPAError('SHA256 cannot be empty');
    }
    const allSBOMs = await this.findAllSBOMs();
    const sbom = allSBOMs.find(sbom =>
      sbom.described_by?.some(component => component.version.includes(sha256))
    );
    if (!sbom) {
      this.logger.info('No SBOM found with SHA256: {}', sha256);
    }

    return sbom || null;
  }

  /**
   * Searches for an SBOM by name and document ID.
   *
   * @param name The name of the SBOM to search for.
   * @param documentId The document ID to filter by.
   * @returns A promise that resolves to the matching SBOM or null if not found.
   * @throws {TPAError} if the search fails.
   */
  public async findSBOMsByNameAndDocID(
    name: string,
    documentId: string,
  ): Promise<SBOMResult | null> {
    this.logger.info(
      'Searching for SBOM with name: {} and document ID: {}',
      name,
      documentId
    );

    const sboms = await this.findSBOMsByName(name);
    if (sboms.length === 0) {
      throw new Error(`SBOM with name ${name} not found!!`);
    }
    const sbom = sboms.find(s => s.document_id === documentId);

    if (!sbom) {
      this.logger.info(
        'No SBOM found with name: {} and document ID: {}',
        name,
        documentId
      );
    }
    return sbom || null;
  }
}
