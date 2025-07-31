/**
 * Represents a single modification to be made to a file's content.
 */
export interface ContentModification {
  oldContent: string;
  newContent: string;
}

/**
 * A map where keys are file paths and values are arrays of ContentModification objects.
 * This allows multiple modifications to be specified for each file.
 */
export type ContentModifications = { [filePath: string]: ContentModification[] };

/**
 * Container to collect and manage multiple ContentModifications
 * This class provides a fluent API for adding, merging, and retrieving modifications.
 */
export class ContentModificationsContainer {
  private modifications: ContentModifications = {};

  /**
   * Adds a new modification for a specific file.
   * If the file path already exists, the new modification is appended.
   *
   * @param filePath - The path to the file to be modified
   * @param modification - The ContentModification object
   * @returns The current instance of the container for chaining
   */
  public add(
    filePath: string,
    modification: ContentModification,
  ): ContentModificationsContainer {
    if (!this.modifications[filePath]) {
      this.modifications[filePath] = [];
    }
    this.modifications[filePath].push(modification);
    return this;
  }

  /**
   * Adds multiple modifications for a specific file.
   *
   * @param filePath - The path to the file to be modified
   * @param modifications - An array of ContentModification objects
   * @returns The current instance of the container for chaining
   */
  public addAll(
    filePath: string,
    modifications: ContentModification[],
  ): ContentModificationsContainer {
    if (!this.modifications[filePath]) {
      this.modifications[filePath] = [];
    }
    this.modifications[filePath].push(...modifications);
    return this;
  }

  /**
   * Merges another ContentModifications object into this container
   *
   * @param modifications - The ContentModifications object to merge
   * @returns The current instance of the container for chaining
   */
  public merge(modifications: ContentModifications): ContentModificationsContainer {
    for (const [filePath, mods] of Object.entries(modifications)) {
      this.addAll(filePath, mods);
    }
    return this;
  }

  /**
   * Returns all collected modifications as a ContentModifications object
   * @returns The combined ContentModifications
   */
  public getModifications(): ContentModifications {
    return this.modifications;
  }

  /**
   * Clears all stored modifications
   * @returns The current instance of the container for chaining
   */
  public clear(): ContentModificationsContainer {
    this.modifications = {};
    return this;
  }

  /**
   * Checks if the container is empty
   * @returns True if no modifications are stored, false otherwise
   */
  public isEmpty(): boolean {
    return Object.keys(this.modifications).length === 0;
  }

  /**
   * Applies modifications for a specific file to the given content.
   * @param filePath - The path to the file for which to apply modifications.
   * @param content - The original content of the file.
   * @returns The content with modifications applied.
   */
  public applyToContent(filePath: string, content: string): string {
    const fileModifications = this.modifications[filePath];

    if (!fileModifications || fileModifications.length === 0) {
      return content;
    }

    let modifiedContent = content;
    for (const modification of fileModifications) {
      modifiedContent = modifiedContent.replace(modification.oldContent, modification.newContent);
    }

    return modifiedContent;
  }

  /**
   * Creates a new ContentModificationsContainer with the given modifications
   * @param modifications - An initial ContentModifications object
   * @returns A new ContentModificationsContainer
   */
  public static from(modifications: ContentModifications): ContentModificationsContainer {
    const container = new ContentModificationsContainer();
    container.merge(modifications);
    return container;
  }
}
