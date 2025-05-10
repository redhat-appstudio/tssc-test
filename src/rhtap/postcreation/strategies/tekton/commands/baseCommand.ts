import { Component } from '../../../../core/component';
import { CI } from '../../../../core/integration/ci';
import { GitlabProvider } from '../../../../core/integration/git';

/**
 * Abstract base class for all GitLab post-creation action commands
 */
export abstract class BaseCommand {
  protected component: Component;
  protected gitlab: GitlabProvider;
  protected ci: CI;

  /**
   * Constructor
   * @param component The component being created
   */
  constructor(component: Component) {
    this.component = component;
    this.gitlab = component.getGit() as GitlabProvider;
    this.ci = component.getCI();
  }

  /**
   * Execute the command
   */
  public abstract execute(): Promise<void>;

  /**
   * Log the start of a command execution
   * @param actionName The name of the action being performed
   */
  protected logStart(actionName: string): void {
    console.log(`Starting ${actionName} for ${this.component.getName()}...`);
  }

  /**
   * Log the completion of a command execution
   * @param actionName The name of the action being performed
   */
  protected logComplete(actionName: string): void {
    console.log(`Completed ${actionName} for ${this.component.getName()}`);
  }
}
