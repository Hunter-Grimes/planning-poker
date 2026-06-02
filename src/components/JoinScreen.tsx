import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { Button, CenteredScreen, FieldLabel, Input, ModalCard } from './ui';
import { MAX_NAME_LENGTH } from '../types';

interface Props {
  roomId: string;
  onJoin: (name: string) => void;
}

export function JoinScreen({ roomId, onJoin }: Props) {
  const [name, setName] = useState('');

  return (
    <CenteredScreen topRight={<ThemeToggle />}>
      <ModalCard>
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Join Room</h1>
          <p className="text-3xl font-bold font-mono tracking-[0.2em] text-indigo-600 dark:text-indigo-400 mt-2">
            {roomId}
          </p>
        </div>

        <FieldLabel>Your name</FieldLabel>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onJoin(name.trim())}
          placeholder="e.g. Bob"
          maxLength={MAX_NAME_LENGTH}
          className="mb-4"
          autoFocus
        />

        <Button
          variant="primary"
          size="lg"
          disabled={!name.trim()}
          onClick={() => onJoin(name.trim())}
          className="w-full"
        >
          Join Session
        </Button>
      </ModalCard>
    </CenteredScreen>
  );
}
