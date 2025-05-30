import { CIType } from '../../src/rhtap/core/integration/ci';
import { GitType } from '../../src/rhtap/core/integration/git';
import { TemplateType } from '../../src/rhtap/core/integration/git';
import { ImageRegistryType } from '../../src/rhtap/core/integration/registry';
import { TestItem } from './testItem';

export class TestPlan {
  templates: string[];
  tssc: {
    git: GitType;
    ci: CIType;
    registry: ImageRegistryType;
    tpa: string;
    acs: string;
  };
  tests: string[];

  constructor(data: any) {
    this.templates = data.templates || [];
    this.tssc = {
      git: data.tssc?.git || '',
      ci: data.tssc?.ci || '',
      registry: data.tssc?.registry || '',
      tpa: data.tssc?.tpa || '',
      acs: data.tssc?.acs || '',
    };
    this.tests = data.tests || [];
  }

  hasTemplate(name: string): boolean {
    return this.templates.includes(name);
  }

  hasTest(name: string): boolean {
    return this.tests.includes(name);
  }
  getTestItems(): TestItem[] {
    return this.templates.map((template: string) => {
      return new TestItem(
        template as unknown as TemplateType,
        this.tssc.registry,
        this.tssc.git,
        this.tssc.ci,
        this.tssc.tpa,
        this.tssc.acs
      );
    });
  }
}
