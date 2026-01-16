/**
 * TypeScript declarations for custom Winston log levels
 */

declare module 'winston' {
  interface Logger {
    trace(message: string, ...meta: any[]): Logger;
    trace(message: string, meta?: any): Logger;
    trace(infoObject: object): Logger;
  }
}

export {};
