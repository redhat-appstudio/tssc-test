import { ContentModifications } from '../../../../modification/contentModification';

export enum TemplateType {
  SPRINGBOOT = 'java-springboot',
  QUARKUS = 'java-quarkus',
  GO = 'go',
  DOTNET = 'dotnet-basic',
  PYTHON = 'python',
  NODEJS = 'nodejs',
}

export interface ITemplate {
  /**
   * Get the template type
   */
  getType(): TemplateType;

  /**
   * Get content modifications for the template
   */
  getContentModifications(): ContentModifications;

  /**
   * Get the main file path for the template
   */
  getMainFilePath(): string;

  /**
   * Get template metadata
   */
  getMetadata(): { [key: string]: any };
}

/**
 * Abstract base class for templates
 */
abstract class BaseTemplate implements ITemplate {
  protected type: TemplateType;
  protected metadata: { [key: string]: any };

  constructor(type: TemplateType, metadata: { [key: string]: any } = {}) {
    this.type = type;
    this.metadata = metadata;
  }

  public getType(): TemplateType {
    return this.type;
  }

  public getMetadata(): { [key: string]: any } {
    return this.metadata;
  }

  abstract getContentModifications(): ContentModifications;
  abstract getMainFilePath(): string;
}

/**
 * Spring Boot template implementation
 */
class SpringBootTemplate extends BaseTemplate {
  constructor() {
    super(TemplateType.SPRINGBOOT, {
      language: 'Java',
      framework: 'Spring Boot',
    });
  }

  public getMainFilePath(): string {
    return 'src/main/java/com/example/demo/DemoApplication.java';
  }

  public getContentModifications(): ContentModifications {
    const mainPath = this.getMainFilePath();
    return {
      [mainPath]: [
        {
          oldContent: 'Hello World',
          newContent: `Hello World - Updated! ${Date.now()} `,
        },
      ],
    };
  }
}

/**
 * Go template implementation
 */
class GoTemplate extends BaseTemplate {
  constructor() {
    super(TemplateType.GO, {
      language: 'Go',
    });
  }

  public getMainFilePath(): string {
    return 'main.go';
  }

  public getContentModifications(): ContentModifications {
    const mainPath = this.getMainFilePath();
    return {
      [mainPath]: [
        {
          oldContent: 'Hello World',
          newContent: `Hello World - Updated! ${Date.now()} `,
        },
      ],
    };
  }
}

/**
 * .NET template implementation
 */
class DotNetTemplate extends BaseTemplate {
  constructor() {
    super(TemplateType.DOTNET, {
      language: 'C#',
      framework: '.NET',
    });
  }

  public getMainFilePath(): string {
    return 'Views/Home/Index.cshtml';
  }

  public getContentModifications(): ContentModifications {
    const mainPath = this.getMainFilePath();
    return {
      [mainPath]: [
        {
          oldContent: 'Welcome',
          newContent: `Welcome - Updated! ${Date.now()} `,
        },
      ],
    };
  }
}

/**
 * Python template implementation
 */
class PythonTemplate extends BaseTemplate {
  constructor() {
    super(TemplateType.PYTHON, {
      language: 'Python',
      framework: 'Flask',
    });
  }

  public getMainFilePath(): string {
    return 'app.py';
  }

  public getContentModifications(): ContentModifications {
    const mainPath = this.getMainFilePath();
    return {
      [mainPath]: [
        {
          oldContent: 'Hello World',
          newContent: `Hello World - Updated! ${Date.now()} `,
        },
      ],
    };
  }
}

/**
 * Node.js template implementation
 */
class NodeJSTemplate extends BaseTemplate {
  constructor() {
    super(TemplateType.NODEJS, {
      language: 'JavaScript',
      framework: 'Node.js',
    });
  }

  public getMainFilePath(): string {
    return 'server.js';
  }

  public getContentModifications(): ContentModifications {
    const mainPath = this.getMainFilePath();
    return {
      [mainPath]: [
        {
          oldContent: `res.send('Hello from Node.js Starter Application`,
          newContent: `res.send('Hello from Node.js Starter Application - Updated! ${Date.now()} `,
        },
      ],
    };
  }
}

class QuarkusTemplate extends BaseTemplate {
  constructor() {
    super(TemplateType.QUARKUS, {
      language: 'Java',
      framework: 'Quarkus',
    });
  }

  public getMainFilePath(): string {
    return 'src/main/java/org/acme/GreetingResource.java';
  }

  public getContentModifications(): ContentModifications {
    const mainPath = this.getMainFilePath();
    return {
      [mainPath]: [
        {
          oldContent: 'Hello RESTEasy',
          newContent: `Hello RESTEasy - Updated! ${Date.now()} `,
        },
      ],
    };
  }
}

/**
 * Factory for creating template instances
 */
export class TemplateFactory {
  /**
   * Creates a template instance based on template type
   * @param templateType The template type
   * @returns A template instance
   */
  static createTemplate(templateType: TemplateType): ITemplate {
    switch (templateType) {
      case TemplateType.SPRINGBOOT:
        return new SpringBootTemplate();
      case TemplateType.GO:
        return new GoTemplate();
      case TemplateType.DOTNET:
        return new DotNetTemplate();
      case TemplateType.PYTHON:
        return new PythonTemplate();
      case TemplateType.NODEJS:
        return new NodeJSTemplate();
      case TemplateType.QUARKUS:
        return new QuarkusTemplate();
      default:
        throw new Error(`Unsupported template type: ${templateType}`);
    }
  }
}
export { ContentModifications };
