import { CIType } from '../../core/integration/ci';
import { ComponentActionStrategy } from '../../postcreation/strategies/componentActionStrategy';
import { AzureCICleanupActionStrategy } from './azureCICleanupActionStrategy';
import { DummyCleanupActionStrategy } from './dummyStrategy';

export class CleanupActionStrategyFactory {
  /**
   * Creates a post-create action strategy based on CI type
   * @param ciType Type of CI system
   * @returns An appropriate strategy implementation for the CI type
   */
  //Rules:
  //1. tekton + github ==> no post-creation actions
  //2. tekton + gitlab ==>
  //2. gitlab + gitlabci do not require any post-creation actions
  //3. jenkins requires a webhook to be created in the repository
  public static createStrategy(ciType: CIType): ComponentActionStrategy {
    switch (ciType) {
      case CIType.AZURE:
        return new AzureCICleanupActionStrategy();
      default:
        return new DummyCleanupActionStrategy();
    }
  }
}
