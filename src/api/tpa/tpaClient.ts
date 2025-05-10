import retry from 'async-retry';
import axios, { AxiosError, AxiosResponse } from 'axios';

// Define interfaces for SBOM search response
interface SBOMSearchResponse {
  result: SBOMResult[];
  total?: number;
}

export interface SBOMResult {
  id: string;
  name: string;
  // Add other SBOM properties as needed
  [key: string]: unknown;
}

export class TPAClient {
  private token: string = '';

  constructor(
    public readonly bombasticApiUrl: string,
    public readonly oidcIssuesUrl: string,
    public readonly oidcclientId: string,
    public readonly oidcclientSecret: string
  ) {}

  public async initAccessToken(): Promise<void> {
    try {
      const tokenEndpoint = `${this.oidcIssuesUrl}/protocol/openid-connect/token`;

      const response = await axios.post(
        tokenEndpoint,
        {
          client_id: this.oidcclientId,
          client_secret: this.oidcclientSecret,
          grant_type: 'client_credentials',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      if (!response.data?.access_token) {
        throw new Error('Access token not found in response');
      }

      this.token = response.data.access_token;
    } catch (error) {
      console.error('Error getting TPA token:', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Finds SBOMs by name using the TPA API with retry capability
   * @param name - The name to search for
   * @param retries - Number of retries before giving up (default: 3)
   * @returns A promise that resolves to an array of SBOM results
   * @throws Error if all retries fail or no token is available
   */
  public async findSBOMsByName(name: string, retries = 10): Promise<SBOMResult[]> {
    if (!this.token) {
      await this.initAccessToken();
    }

    // Define the operation to retry
    const operation = async (): Promise<SBOMResult[]> => {
      try {
        const searchUrl = `${this.bombasticApiUrl}/api/v1/sbom/search`;

        const response: AxiosResponse<SBOMSearchResponse> = await axios.get(searchUrl, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: '*/*',
          },
          params: {
            q: name,
          },
        });

        if (response.status === 200 && Array.isArray(response.data.result)) {
          console.log(
            `SBOM search for '${name}' successful. Found ${response.data.result.length} result(s).`
          );
          return response.data.result;
        }

        return [];
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;

          // Don't retry for 404 (not found) responses - they're expected
          if (axiosError.response?.status === 404) {
            console.log(`No SBOMs found for '${name}'.`);
            // Returning empty array instead of throwing to avoid retries for not found
            return [];
          }

          // Handle auth errors separately - refresh token and continue
          if (axiosError.response?.status === 401) {
            console.log('Token expired. Refreshing...');
            await this.initAccessToken();
            throw axiosError;
          }

          // For server errors (5xx), retry
          if (axiosError.response && axiosError.response.status >= 500) {
            console.error(`Server error (${axiosError.response.status}). Retrying...`);
            throw axiosError;
          }

          // For other error codes, don't retry
          console.error(`Non-retryable error: ${axiosError.message}`);
          throw new Error(axiosError.message);
        }

        // For non-Axios errors, abort retries
        console.error('Unexpected error:', error);
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    };

    try {
      return await retry(operation, {
        retries,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 15000,
        randomize: true,
      });
    } catch (error) {
      console.error(`All ${retries} attempts to find SBOMs for '${name}' have failed:`, error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
