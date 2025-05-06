/**
 * Loads a value from environment variables
 * @param name The name of the environment variable
 * @returns The value or empty string if undefined
 */
export function loadFromEnv(name: string): string {
  const value = process.env[name] || '';
  if (!value) {
    throw new Error(`Environment variable ${name} is not defined`);
  }
  console.log(`Loaded environment variable ${name}: ${value}`);
  return value;
}
