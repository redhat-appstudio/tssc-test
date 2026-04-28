import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line no-control-regex
const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
function stripAnsiEscapes(str: string): string {
  return str.replace(ansiRegex, '');
}

/**
 * Custom JUnit reporter based on Playwright's built-in JUnit reporter.
 * The only difference is the suite naming: we use the top-level describe block name
 * combined with the project name (e.g. "My Suite - chromium") instead of the file path.
 *
 * Usage in playwright.config.ts:
 *   ['./src/reporters/junit-with-project.ts', { outputFile: 'results.xml', stripANSIControlSequences: true }]
 */

interface JUnitOptions {
  outputFile?: string;
  stripANSIControlSequences?: boolean;
  includeProjectInTestName?: boolean;
}

type XMLEntry = {
  name: string;
  attributes?: { [name: string]: string | number | boolean };
  children?: XMLEntry[];
  text?: string;
};

class JUnitWithProjectReporter implements Reporter {
  private outputFile: string;
  private config!: FullConfig;
  private suite!: Suite;
  private timestamp!: Date;
  private totalTests = 0;
  private totalFailures = 0;
  private totalSkipped = 0;
  private totalErrors = 0;
  private stripANSIControlSequences = false;
  private includeProjectInTestName = false;

  constructor(options: JUnitOptions = {}) {
    this.outputFile = options.outputFile || 'test-results/junit.xml';
    this.stripANSIControlSequences = !!options.stripANSIControlSequences;
    this.includeProjectInTestName = !!options.includeProjectInTestName;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.suite = suite;
    this.timestamp = new Date();
  }

  async onEnd(result: FullResult): Promise<void> {
    const children: XMLEntry[] = [];
    for (const projectSuite of this.suite.suites) {
      for (const fileSuite of projectSuite.suites)
        children.push(await this._buildTestSuite(projectSuite.title, fileSuite));
    }

    const tokens: string[] = [];
    const root: XMLEntry = {
      name: 'testsuites',
      attributes: {
        id: process.env['PLAYWRIGHT_JUNIT_SUITE_ID'] || '',
        name: process.env['PLAYWRIGHT_JUNIT_SUITE_NAME'] || '',
        tests: this.totalTests,
        failures: this.totalFailures,
        skipped: this.totalSkipped,
        errors: this.totalErrors,
        time: result.duration / 1000,
      },
      children,
    };

    serializeXML(root, tokens, this.stripANSIControlSequences);
    const reportString = tokens.join('\n');

    const outputDir = path.dirname(this.outputFile);
    await fs.promises.mkdir(outputDir, { recursive: true });
    await fs.promises.writeFile(this.outputFile, reportString);
  }

  private async _buildTestSuite(projectName: string, suite: Suite): Promise<XMLEntry> {
    let tests = 0;
    let skipped = 0;
    let failures = 0;
    let errors = 0;
    let duration = 0;
    const children: XMLEntry[] = [];
    const testCaseNamePrefix = projectName && this.includeProjectInTestName ? `[${projectName}] ` : '';

    for (const test of suite.allTests()) {
      ++tests;
      if (test.outcome() === 'skipped')
        ++skipped;
      for (const result of test.results)
        duration += result.duration;
      const classification = await this._addTestCase(suite.title, testCaseNamePrefix, test, children);
      if (classification === 'error')
        ++errors;
      else if (classification === 'failure')
        ++failures;
    }

    this.totalTests += tests;
    this.totalSkipped += skipped;
    this.totalFailures += failures;
    this.totalErrors += errors;

    // --- Custom suite name logic ---
    // Use the top-level describe name if available, otherwise fall back to file path.
    // Include project name for differentiation.
    const topLevelDescribe = suite.suites.length > 0 ? suite.suites[0].title : '';
    const suiteLabel = topLevelDescribe || suite.title;
    const suiteName = projectName
      ? `${suiteLabel} - ${projectName}`
      : suiteLabel;

    const entry: XMLEntry = {
      name: 'testsuite',
      attributes: {
        name: suiteName,
        timestamp: this.timestamp.toISOString(),
        hostname: projectName,
        tests,
        failures,
        skipped,
        time: duration / 1000,
        errors,
      },
      children,
    };

    return entry;
  }

  private async _addTestCase(suiteName: string, namePrefix: string, test: TestCase, entries: XMLEntry[]): Promise<'failure' | 'error' | null> {
    const entry: XMLEntry = {
      name: 'testcase',
      attributes: {
        // Skip root, project, file
        name: namePrefix + test.titlePath().slice(3).join(' › '),
        // filename
        classname: suiteName,
        time: test.results.reduce((acc, value) => acc + value.duration, 0) / 1000,
      },
      children: [],
    };
    entries.push(entry);

    const properties: XMLEntry = {
      name: 'properties',
      children: [],
    };

    for (const annotation of test.annotations) {
      const property: XMLEntry = {
        name: 'property',
        attributes: {
          name: annotation.type,
          value: annotation?.description ? annotation.description : '',
        },
      };
      properties.children!.push(property);
    }

    if (properties.children!.length)
      entry.children!.push(properties);

    if (test.outcome() === 'skipped') {
      entry.children!.push({ name: 'skipped' });
      return null;
    }

    let classification: 'failure' | 'error' | null = null;
    if (!test.ok()) {
      const errorInfo = classifyError(test);
      if (errorInfo) {
        classification = errorInfo.elementName;
        entry.children!.push({
          name: errorInfo.elementName,
          attributes: {
            message: errorInfo.message,
            type: errorInfo.type,
          },
          text: stripAnsiEscapes(formatFailure(test)),
        });
      } else {
        classification = 'failure';
        entry.children!.push({
          name: 'failure',
          attributes: {
            message: `${path.basename(test.location.file)}:${test.location.line}:${test.location.column} ${test.title}`,
            type: 'FAILURE',
          },
          text: stripAnsiEscapes(formatFailure(test)),
        });
      }
    }

    const systemOut: string[] = [];
    const systemErr: string[] = [];
    for (const result of test.results) {
      for (const item of result.stdout)
        systemOut.push(item.toString());
      for (const item of result.stderr)
        systemErr.push(item.toString());
      for (const attachment of result.attachments) {
        if (!attachment.path)
          continue;

        let attachmentPath = path.relative(this.config.rootDir, attachment.path);
        try {
          attachmentPath = path.relative(path.dirname(this.outputFile), attachment.path);
        } catch {
          systemOut.push(`\nWarning: Unable to make attachment path ${attachment.path} relative to report output file ${this.outputFile}`);
        }

        try {
          await fs.promises.access(attachment.path);
          systemOut.push(`\n[[ATTACHMENT|${attachmentPath}]]\n`);
        } catch {
          systemErr.push(`\nWarning: attachment ${attachmentPath} is missing`);
        }
      }
    }

    if (systemOut.length)
      entry.children!.push({ name: 'system-out', text: systemOut.join('') });
    if (systemErr.length)
      entry.children!.push({ name: 'system-err', text: systemErr.join('') });
    return classification;
  }
}

function classifyError(test: TestCase): { elementName: 'failure' | 'error'; type: string; message: string } | null {
  for (const result of test.results) {
    const error = result.error;
    if (!error)
      continue;

    const rawMessage = stripAnsiEscapes(error.message || error.value || '');

    // Parse "ErrorName: message" format from serialized error.
    const nameMatch = rawMessage.match(/^(\w+): /);
    const errorName = nameMatch ? nameMatch[1] : '';
    const messageBody = nameMatch ? rawMessage.slice(nameMatch[0].length) : rawMessage;
    const firstLine = messageBody.split('\n')[0].trim();

    // Check for expect/assertion failure pattern.
    const matcherMatch = rawMessage.match(/expect\(.*?\)\.(not\.)?(\w+)/);
    if (matcherMatch) {
      const matcherName = `expect.${matcherMatch[1] || ''}${matcherMatch[2]}`;
      return {
        elementName: 'failure',
        type: matcherName,
        message: firstLine,
      };
    }

    // Thrown error.
    return {
      elementName: 'error',
      type: errorName || 'Error',
      message: firstLine,
    };
  }
  return null;
}

function formatFailure(test: TestCase): string {
  const lines: string[] = [];
  for (const result of test.results) {
    if (result.status === 'passed')
      continue;
    for (const error of result.errors) {
      const stack = error.stack || error.message || error.value || '';
      lines.push(stack);
    }
  }
  return lines.join('\n');
}

// See https://en.wikipedia.org/wiki/Valid_characters_in_XML
const discouragedXMLCharacters = /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f-\u0084\u0086-\u009f]/g;

function serializeXML(entry: XMLEntry, tokens: string[], stripANSI: boolean): void {
  const attrs: string[] = [];
  for (const [name, value] of Object.entries(entry.attributes || {}))
    attrs.push(`${name}="${escape(String(value), stripANSI, false)}"`);
  tokens.push(`<${entry.name}${attrs.length ? ' ' : ''}${attrs.join(' ')}>`);
  for (const child of entry.children || [])
    serializeXML(child, tokens, stripANSI);
  if (entry.text)
    tokens.push(escape(entry.text, stripANSI, true));
  tokens.push(`</${entry.name}>`);
}

function escape(text: string, stripANSI: boolean, isCharacterData: boolean): string {
  if (stripANSI)
    text = stripAnsiEscapes(text);

  if (isCharacterData) {
    text = '<![CDATA[' + text.replace(/]]>/g, ']]&gt;') + ']]>';
  } else {
    const escapeRe = /[&"'<>]/g;
    text = text.replace(escapeRe, c => ({ '&': '&amp;', '"': '&quot;', "'": '&apos;', '<': '&lt;', '>': '&gt;' }[c]!));
  }

  text = text.replace(discouragedXMLCharacters, '');
  return text;
}

export default JUnitWithProjectReporter;
