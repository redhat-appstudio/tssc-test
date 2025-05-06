import { ScaffolderScaffoldOptions, ScaffolderTask } from '@backstage/plugin-scaffolder-react';
import axios, { Axios, AxiosResponse } from 'axios';
import * as https from 'https';

// Define the expected response type from the Developer Hub API
interface ComponentIdResponse {
  id: string;
}

export class DeveloperHub {
  private readonly url: string;
  private readonly axios: Axios;

  public constructor(url: string) {
    if (!url) {
      throw new Error('Cannot initialize DeveloperHubClient without a URL');
    }
    this.url = url;
    this.axios = axios.create({
      httpAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });
  }

  public getUrl(): string {
    return this.url;
  }

  /**
   * Creates a component in Developer Hub
   * @param componentScaffoldOptions Options for scaffolding the component
   * @returns Promise resolving to the task ID and status
   * @throws Error if the component creation fails
   */
  public async createComponent(
    componentScaffoldOptions: ScaffolderScaffoldOptions
  ): Promise<ComponentIdResponse> {
    try {
      console.log('Creating component with options:', componentScaffoldOptions);
      const response: AxiosResponse<ComponentIdResponse> = await this.axios.post(
        `${this.url}/api/scaffolder/v2/tasks`,
        componentScaffoldOptions
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to create Developer Hub component: ${error}`);
    }
  }

  /**
   * Retrieves the status of a task from Developer Hub
   * @param taskId ID of the task to retrieve
   * @returns Promise resolving to the task status
   * @throws Error if the task retrieval fails
   */
  public async getComponent(componentId: string): Promise<ScaffolderTask> {
    try {
      const response: AxiosResponse<ScaffolderTask> = await this.axios.get(
        `${this.url}/api/scaffolder/v2/tasks/${componentId}`
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to retrieve Developer Hub task status: ${error}`);
    }
  }

  /**
   * Retrieves the status of a component creation task from Developer Hub
   * @param componentId ID of the component task to retrieve status for
   * @returns Promise resolving to the task status, status: 'failed' | 'completed' | 'processing' | 'open' | 'cancelled'
   * @throws Error if the task status retrieval fails
   */
  public async getComponentStatus(componentId: string): Promise<string> {
    const component = await this.getComponent(componentId);
    return component.status;
  }

  /**
   * Retrieves the logs of a component creation task from Developer Hub
   * @param componentId ID of the component task to retrieve logs for
   * @returns Promise resolving to the task logs
   * @throws Error if the task log retrieval fails
   */
  public async getComponentLogs(componentId: string): Promise<string> {
    try {
      const response: AxiosResponse<string> = await this.axios.get(
        `${this.url}/api/scaffolder/v2/tasks/${componentId}/eventstream`
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to retrieve Developer Hub task logs: ${error}`);
    }
  }

  // wait until the task is completed
  public async waitUntilComponentIsCompleted(taskId: string): Promise<void> {
    let completed = false;
    while (!completed) {
      // Wait for 5 seconds before next status check
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Get the latest task status
      const taskStatus = await this.getComponent(taskId);
      const status = taskStatus.status;
      console.log(`Component creation status: ${status}`);

      // Check if the task has completed or failed
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        completed = true;

        if (status === 'completed') {
          console.log('Component was created successfully!');

          // Optionally get the task results
          const component = await this.getComponent(taskId);
          console.log('Current task status:', component.status);
        } else {
          console.error(`Component creation ${status}.`);

          // Get logs to understand what went wrong
          const logs = await this.getComponentLogs(taskId);
          console.error('Task logs:', logs);
        }
      }
    }
  }
}
