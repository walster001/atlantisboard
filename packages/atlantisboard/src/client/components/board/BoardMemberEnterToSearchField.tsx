import { useState } from 'react';
import { TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';

export interface BoardMemberEnterToSearchFieldProps {
  readonly ariaLabel: string;
  readonly placeholder: string;
  readonly onCommit: (trimmed: string) => void;
}

/**
 * Search field used in Board Settings → Users (current members / directory): commit on Enter
 * so list parents do not re-render on every keystroke.
 */
export function BoardMemberEnterToSearchField(props: BoardMemberEnterToSearchFieldProps) {
  const { ariaLabel, placeholder, onCommit } = props;
  const [draft, setDraft] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCommit(draft.trim());
      }}
    >
      <TextInput
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        leftSection={<IconSearch size={18} stroke={1.5} />}
        aria-label={ariaLabel}
      />
    </form>
  );
}
