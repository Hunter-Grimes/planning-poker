import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeScreen } from '../../src/components/HomeScreen';

function setup() {
  const onCreateRoom = vi.fn();
  const onJoinRoom = vi.fn();
  render(<HomeScreen onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />);
  return {
    onCreateRoom,
    onJoinRoom,
    nameInput: screen.getByPlaceholderText('Enter your name'),
    codeInput: screen.getByPlaceholderText('Room code'),
    createBtn: screen.getByRole('button', { name: 'Create Room' }),
    joinBtn: screen.getByRole('button', { name: 'Join Session' }),
  };
}

describe('HomeScreen', () => {
  it('disables Create until a name is entered', async () => {
    const user = userEvent.setup();
    const { nameInput, createBtn, onCreateRoom } = setup();
    expect(createBtn).toBeDisabled();

    await user.type(nameInput, '  Alice  ');
    expect(createBtn).toBeEnabled();

    await user.click(createBtn);
    expect(onCreateRoom).toHaveBeenCalledWith('Alice'); // trimmed
  });

  it('disables Join until both a name and a 6-char code are present', async () => {
    const user = userEvent.setup();
    const { nameInput, codeInput, joinBtn } = setup();
    expect(joinBtn).toBeDisabled();

    await user.type(nameInput, 'Bob');
    expect(joinBtn).toBeDisabled();

    await user.type(codeInput, 'ABC23'); // only 5 valid chars
    expect(joinBtn).toBeDisabled();

    await user.type(codeInput, '4');
    expect(joinBtn).toBeEnabled();
  });

  it('uppercases the code and strips disallowed characters', async () => {
    const user = userEvent.setup();
    const { codeInput } = setup();
    await user.type(codeInput, 'a1b-0c!9');
    // lowercased→upper, '1' and '0' disallowed (only A-Z and 2-9), punctuation stripped
    expect(codeInput).toHaveValue('ABC9');
  });

  it('joins on Enter when the form is valid', async () => {
    const user = userEvent.setup();
    const { nameInput, codeInput, onJoinRoom } = setup();
    await user.type(nameInput, 'Bob');
    await user.type(codeInput, 'ABC234');
    await user.type(codeInput, '{Enter}');
    expect(onJoinRoom).toHaveBeenCalledWith('ABC234', 'Bob');
  });

  it('does not join on Enter while invalid', async () => {
    const user = userEvent.setup();
    const { codeInput, onJoinRoom } = setup();
    await user.type(codeInput, 'ABC234{Enter}'); // no name
    expect(onJoinRoom).not.toHaveBeenCalled();
  });
});
