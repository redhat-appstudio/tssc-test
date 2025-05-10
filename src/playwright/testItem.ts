import { CIType } from '../../src/rhtap/core/integration/ci';
import { GitType } from '../../src/rhtap/core/integration/git';
import { TemplateType } from '../../src/rhtap/core/integration/git';
import { ImageRegistryType } from '../../src/rhtap/core/integration/registry';

export class TestItem {
  private template: TemplateType;
  private registryType: ImageRegistryType;
  private gitType: GitType;
  private ciType: CIType;
  private tpa: string;
  private acs: string;

  constructor(
    template: TemplateType,
    registryType: ImageRegistryType,
    gitType: GitType,
    ciType: CIType,
    tpa: string = '',
    acs: string = ''
  ) {
    this.template = template;
    this.registryType = registryType;
    this.gitType = gitType;
    this.ciType = ciType;
    this.tpa = tpa;
    this.acs = acs;
  }

  // Getters
  public getTemplate(): TemplateType {
    return this.template;
  }

  public getregistryType(): ImageRegistryType {
    return this.registryType;
  }

  public getGitType(): GitType {
    return this.gitType;
  }

  public getCIType(): CIType {
    return this.ciType;
  }

  public getTPA(): string {
    return this.tpa;
  }

  public getACS(): string {
    return this.acs;
  }

  // Setters
  public setTemplate(template: TemplateType): void {
    this.template = template;
  }

  public setRegistryType(registryType: ImageRegistryType): void {
    this.registryType = registryType;
  }

  public setGitType(gitType: GitType): void {
    this.gitType = gitType;
  }

  public setCIType(ciType: CIType): void {
    this.ciType = ciType;
  }

  public setTPA(tpa: string): void {
    this.tpa = tpa;
  }

  public setACS(acs: string): void {
    this.acs = acs;
  }
}
