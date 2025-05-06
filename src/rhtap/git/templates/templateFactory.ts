import { ContentModifications } from '../../modification/contentModification';

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
      buildTool: 'Maven',
      repoReference: 'https://github.com/xjiangorg/mwpozzk3j-java-springboot',
    });
  }

  public getMainFilePath(): string {
    return 'src/main/java/org/acme/getting/started/GreetingResource.java';
  }

  public getContentModifications(): ContentModifications {
    return {
      'src/main/java/org/acme/getting/started/GreetingResource.java': [
        {
          oldContent: '// Original content will be fetched by GitHub API',
          newContent: `package org.acme.getting.started;

import javax.inject.Inject;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;

@Path("/hello")
public class GreetingResource {

    @Inject
    GreetingService service;

    @GET
    @Produces(MediaType.TEXT_PLAIN)
    public String hello() {
        return "Hello from RESTEasy - Updated";
    }
}`,
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
    return {
      'main.go': [
        {
          oldContent: 'Hello World',
          newContent: `Hello World ${Date.now()}`,
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
      repoReference: 'https://github.com/xjiangorg/kppavexgr-dotnet-basic',
    });
  }

  public getMainFilePath(): string {
    return 'Program.cs';
  }

  public getContentModifications(): ContentModifications {
    return {
      'Program.cs': [
        {
          oldContent: '// Original content will be fetched by GitHub API',
          newContent: `using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/", () => "Hello from .NET - Updated!");

app.Run();`,
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
    return {
      'app.py': [
        {
          oldContent: '// Original content will be fetched by GitHub API',
          newContent: `from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/')
def hello():
    return jsonify(message="Hello from Python Flask - Updated!")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)`,
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
      framework: 'Express',
    });
  }

  public getMainFilePath(): string {
    return 'index.js';
  }

  public getContentModifications(): ContentModifications {
    return {
      'index.js': [
        {
          oldContent: '// Original content will be fetched by GitHub API',
          newContent: `const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello from Node.js Express - Updated!');
});

app.listen(port, () => {
  console.log(\`Server listening at http://localhost:\${port}\`);
});`,
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
      default:
        throw new Error(`Unsupported template type: ${templateType}`);
    }
  }
}
export { ContentModifications };
