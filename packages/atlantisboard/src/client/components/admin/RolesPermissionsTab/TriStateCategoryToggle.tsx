import type { CategoryStatus } from './types.js';

export function TriStateCategoryToggle(props: {
  readonly status: CategoryStatus;
  readonly disabled?: boolean;
  readonly onToggleAllOn: () => void;
  readonly onToggleAllOff: () => void;
}) {
  const { status, disabled, onToggleAllOn, onToggleAllOff } = props;

  const isAll = status === 'all';
  const isSome = status === 'some';
  const ariaChecked: boolean | 'mixed' = isSome ? 'mixed' : isAll;
  const thumbLeft = status === 'none' ? 2 : isSome ? 13 : 24;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={ariaChecked}
      aria-label="Toggle all permissions in category"
      disabled={disabled === true}
      onClick={() => {
        if (disabled === true) return;
        if (status === 'all') onToggleAllOff();
        else onToggleAllOn();
      }}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: '1px solid var(--mantine-color-gray-4)',
        background:
          status === 'all'
            ? 'var(--mantine-color-blue-6)'
            : status === 'some'
              ? 'var(--mantine-color-orange-6)'
              : 'var(--mantine-color-gray-2)',
        position: 'relative',
        overflow: 'hidden',
        cursor: disabled === true ? 'not-allowed' : 'pointer',
        opacity: disabled === true ? 0.6 : 1,
        padding: 0,
        outline: 'none',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          left: thumbLeft,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: 'white',
          boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
          transition: 'left 120ms ease',
        }}
      />
    </button>
  );
}
