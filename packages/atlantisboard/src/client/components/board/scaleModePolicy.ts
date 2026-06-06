export type ScaleMode = 'normal' | 'large' | 'extreme';

export interface ScaleModePolicy {
  readonly mode: ScaleMode;
  readonly listWindowOverscan: number;
  readonly maxMountedListsTarget: number;
  readonly cardVirtualizeThreshold: number;
  readonly enableRichCardPreview: boolean;
  readonly enableCardAssigneeTooltips: boolean;
  readonly hydrateDescriptions: 'all' | 'viewport';
  readonly bootstrapListLimit?: number;
}

export interface ScaleModeInput {
  readonly listCount: number;
  readonly hasServerHintExtreme?: boolean;
}

const LARGE_LIST_COUNT_THRESHOLD = 120;
const EXTREME_LIST_COUNT_THRESHOLD = 300;

export function resolveScaleMode(input: ScaleModeInput): ScaleModePolicy {
  const { listCount, hasServerHintExtreme = false } = input;
  if (hasServerHintExtreme || listCount >= EXTREME_LIST_COUNT_THRESHOLD) {
    return {
      mode: 'extreme',
      listWindowOverscan: 3,
      maxMountedListsTarget: 36,
      cardVirtualizeThreshold: 0,
      enableRichCardPreview: false,
      enableCardAssigneeTooltips: false,
      hydrateDescriptions: 'viewport',
      bootstrapListLimit: 240,
    };
  }
  if (listCount >= LARGE_LIST_COUNT_THRESHOLD) {
    return {
      mode: 'large',
      listWindowOverscan: 4,
      maxMountedListsTarget: 48,
      cardVirtualizeThreshold: 8,
      enableRichCardPreview: false,
      enableCardAssigneeTooltips: true,
      hydrateDescriptions: 'viewport',
      bootstrapListLimit: 400,
    };
  }
  return {
    mode: 'normal',
    listWindowOverscan: 6,
    maxMountedListsTarget: 120,
    cardVirtualizeThreshold: 20,
    enableRichCardPreview: true,
    enableCardAssigneeTooltips: true,
    hydrateDescriptions: 'all',
  };
}
