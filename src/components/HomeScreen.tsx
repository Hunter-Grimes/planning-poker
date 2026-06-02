import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { Button, CenteredScreen, FieldLabel, Input, ModalCard, Panel } from './ui';
import { MAX_NAME_LENGTH } from '../types';

interface Props {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (code: string, name: string) => void;
}

export function HomeScreen({ onCreateRoom, onJoinRoom }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const canCreate = name.trim().length > 0;
  const canJoin = canCreate && code.trim().length === 6;

  return (
    <CenteredScreen topRight={<ThemeToggle />}>
      <ModalCard>
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Planning Poker</h1>
        </div>

        <FieldLabel>Your name</FieldLabel>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Enter your name"
          autoFocus
        />

        <div className="mt-6 flex flex-col gap-3">
          <Panel>
            <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wide font-medium mb-3">
              Create a new room
            </p>
            <Button
              variant="primary"
              size="lg"
              disabled={!canCreate}
              onClick={() => onCreateRoom(name.trim())}
              className="w-full"
            >
              Create Room
            </Button>
          </Panel>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-300 dark:border-gray-700" />
            <span className="text-xs text-gray-500 dark:text-gray-600 uppercase tracking-wide">
              or
            </span>
            <div className="flex-1 border-t border-gray-300 dark:border-gray-700" />
          </div>

          <Panel>
            <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wide font-medium mb-3">
              Join an existing room
            </p>
            <Input
              variant="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
              onKeyDown={(e) =>
                e.key === 'Enter' && canJoin && onJoinRoom(code.trim(), name.trim())
              }
              maxLength={6}
              placeholder="Room code"
              className="mb-3"
            />
            <Button
              variant="success"
              size="lg"
              disabled={!canJoin}
              onClick={() => onJoinRoom(code.trim(), name.trim())}
              className="w-full"
            >
              Join Session
            </Button>
          </Panel>
        </div>
      </ModalCard>
    </CenteredScreen>
  );
}
