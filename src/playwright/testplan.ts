import { CIType } from '../rhtap/ci';
import { GitType } from '../rhtap/git';
import { TemplateType } from '../rhtap/git/templates/templateFactory';
import { ImageRegistryType } from '../rhtap/registry';
import { TestItem } from './testItem';

export class TestPlan {
  templates: string[];
  rhtap: {
    git: GitType;
    ci: CIType;
    registry: ImageRegistryType;
    tpa: string;
    acs: string;
  };
  tests: string[];

  constructor(data: any) {
    this.templates = data.templates || [];
    this.rhtap = {
      git: data.rhtap?.git || '',
      ci: data.rhtap?.ci || '',
      registry: data.rhtap?.registry || '',
      tpa: data.rhtap?.tpa || '',
      acs: data.rhtap?.acs || '',
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
        this.rhtap.registry,
        this.rhtap.git,
        this.rhtap.ci,
        this.rhtap.tpa,
        this.rhtap.acs
      );
    });
  }
}
