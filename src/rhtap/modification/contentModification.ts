/**
 * Represents a single content modification for a file
 */
export interface ContentModification {
  oldContent: string;
  newContent: string;
}

/**
 * Maps file paths to their content modifications
 */
export type ContentModifications = { [filePath: string]: ContentModification[] };

/**
 * Container to collect and manage multiple ContentModifications
 */
export class ContentModificationsContainer {
  private modifications: ContentModifications = {};

  /**
   * Adds a single modification to the container
   * @param filePath The file path to modify
   * @param oldContent The content to replace
   * @param newContent The new content
   * @returns This container instance for chaining
   */
  public add(
    filePath: string,
    oldContent: string,
    newContent: string
  ): ContentModificationsContainer {
    if (!this.modifications[filePath]) {
      this.modifications[filePath] = [];
    }

    // Add the new modification to the array
    this.modifications[filePath].push({
      oldContent,
      newContent,
    });

    return this;
  }

  /**
   * Applies all modifications to a file's content
   * @param filePath The file path
   * @param fileContent The original file content
   * @returns The modified file content
   */
  public applyToContent(filePath: string, fileContent: string): string {
    if (!this.modifications[filePath]) {
      return fileContent;
    }

    let result = fileContent;
    for (const mod of this.modifications[filePath]) {
      result = result.replace(mod.oldContent, mod.newContent);
    }

    return result;
  }

  /**
   * Merges another ContentModifications object into this container
   * @param modifications The modifications to merge
   * @returns This container instance for chaining
   */
  public merge(modifications: ContentModifications): ContentModificationsContainer {
    for (const [filePath, modificationArray] of Object.entries(modifications)) {
      if (!this.modifications[filePath]) {
        this.modifications[filePath] = [...modificationArray];
      } else {
        // Append the new modifications to the existing array
        this.modifications[filePath] = [...this.modifications[filePath], ...modificationArray];
      }
    }
    return this;
  }

  /**
   * Returns all collected modifications as a ContentModifications object
   * @returns The combined ContentModifications
   */
  public getModifications(): ContentModifications {
    return { ...this.modifications };
  }

  /**
   * Clears all modifications in the container
   * @returns This container instance for chaining
   */
  public clear(): ContentModificationsContainer {
    this.modifications = {};
    return this;
  }

  /**
   * Returns true if the container has no modifications
   * @returns boolean indicating if the container is empty
   */
  public isEmpty(): boolean {
    return Object.keys(this.modifications).length === 0;
  }

  /**
   * Gets the total number of modifications across all files
   * @returns The total modification count
   */
  public getTotalModificationsCount(): number {
    return Object.values(this.modifications).reduce((sum, mods) => sum + mods.length, 0);
  }

  /**
   * Creates a new ContentModificationsContainer with the given modifications
   * @param modifications Initial modifications to include
   * @returns A new ContentModificationsContainer
   */
  public static from(modifications: ContentModifications): ContentModificationsContainer {
    const container = new ContentModificationsContainer();
    return container.merge(modifications);
  }
}
