import { CI } from '../../rhtap/core/integration/ci';
import { Pipeline } from '../../rhtap/core/integration/ci/pipeline';
import { expect } from '@playwright/test';
import { LoggerFactory, Logger } from '../../logger/logger';

const logger: Logger = LoggerFactory.getLogger('utils.test.assertion-helpers');

/**
 * Wraps an expect assertion for pipeline success and prints logs if the assertion fails
 *
 * @param pipeline The pipeline to check for success
 * @param ci The CI provider which can fetch logs for the pipeline
 * @returns Promise that resolves when the assertion is complete
 */
export async function expectPipelineSuccess(pipeline: Pipeline, ci: CI): Promise<void> {
  try {
    expect(pipeline.isSuccessful()).toBe(true);
  } catch (error) {
    // If the assertion failed, get and print the logs
    logger.info('🚨 Pipeline failed! Fetching pipeline logs...');

    try {
      const logs = await ci.getPipelineLogs(pipeline);
      logger.info(`\n----- PIPELINE LOGS (${pipeline.getDisplayName()}) -----`);
      logger.info(logs);
      logger.info('----- END PIPELINE LOGS -----\n');
    } catch (logError) {
      logger.error(`Error retrieving pipeline logs: ${logError}`);
    }

    // Re-throw the original error so the test still fails
    throw error;
  }
}

/**
 * Generic function to wrap any expect assertion with additional error handling
 *
 * @param assertion Function that performs the assertion
 * @param errorHandler Function called if the assertion fails (before re-throwing the error)
 * @returns Promise that resolves when the assertion is complete
 */
export async function expectWithErrorHandler<T>(
  assertion: () => T | Promise<T>,
  errorHandler: (error: Error) => void | Promise<void>
): Promise<T> {
  try {
    return await assertion();
  } catch (error) {
    if (error instanceof Error) {
      await errorHandler(error);
    } else {
      await errorHandler(new Error(String(error)));
    }
    throw error;
  }
}

/**
 * Specifically for Tekton pipelines - checks if a pipeline is successful,
 * and if not, fetches and prints detailed logs
 *
 * @param pipeline The Tekton pipeline to check
 * @param tektonCI The TektonCI instance to use to fetch logs
 * @returns Promise resolving to true if pipeline was successful, false otherwise
 */
export async function checkTektonPipelineWithLogs(
  pipeline: Pipeline,
  tektonCI: any
): Promise<boolean> {
  const isSuccessful = pipeline.isSuccessful();

  if (!isSuccessful) {
    logger.info(`🚨 Tekton pipeline ${pipeline.getDisplayName()} failed!`);
    logger.info(`Status: ${pipeline.status}`);

    try {
      const logsUrl = await tektonCI.getPipelineLogs(pipeline);
      logger.info('\n----- TEKTON PIPELINE DETAILS -----');
      logger.info(`Pipeline name: ${pipeline.name}`);
      logger.info(`Repository: ${pipeline.repositoryName}`);
      logger.info(`Logs URL: ${logsUrl}`);
      if (pipeline.results) {
        logger.info(`Results: ${pipeline.results}`);
      }
      logger.info('----- END PIPELINE DETAILS -----\n');
    } catch (logError) {
      logger.error(`Error retrieving Tekton pipeline logs: ${logError}`);
    }
  }

  return isSuccessful;
}
