import { CIType } from '../../src/rhtap/core/integration/ci';
import { GitType } from '../../src/rhtap/core/integration/git';
import { TemplateType } from '../../src/rhtap/core/integration/git';
import { ImageRegistryType } from '../../src/rhtap/core/integration/registry';

export class TestItem {
  private name: string;
  private template: TemplateType;
  private registryType: ImageRegistryType;
  private gitType: GitType;
  private ciType: CIType;
  private tpa: string;
  private acs: string;

  constructor(
    name: string,
    template: TemplateType,
    registryType: ImageRegistryType,
    gitType: GitType,
    ciType: CIType,
    tpa: string = '',
    acs: string = ''
  ) {
    this.name = name;
    this.template = template;
    this.registryType = registryType;
    this.gitType = gitType;
    this.ciType = ciType;
    this.tpa = tpa;
    this.acs = acs;
  }

  // Getters
  public getName(): string {
    return this.name;
  }

  public getTemplate(): TemplateType {
    return this.template;
  }

  public getRegistryType(): ImageRegistryType {
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
  public setName(name: string): void {
    this.name = name;
  }

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

  /**
   * Convert the TestItem to a JSON-serializable object
   */
  public toJSON(): object {
    return {
      name: this.name,
      template: this.template,
      registryType: this.registryType,
      gitType: this.gitType,
      ciType: this.ciType,
      tpa: this.tpa,
      acs: this.acs,
    };
  }

  /**
   * Create a TestItem from a JSON object
   */
  public static fromJSON(data: Record<string, unknown>): TestItem {
    return new TestItem(
      data.name as string,
      data.template as TemplateType,
      data.registryType as ImageRegistryType,
      data.gitType as GitType,
      data.ciType as CIType,
      data.tpa as string,
      data.acs as string
    );
  }
}
