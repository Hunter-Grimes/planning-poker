import { useState } from 'react';

interface Props {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (code: string) => void;
}

export function HomeScreen({ onCreateRoom, onJoinRoom }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-gray-800">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-2xl font-bold text-white">Planning Poker</h1>
          <p className="text-gray-400 text-sm mt-1">Free • Peer-to-peer • No account needed</p>
        </div>

        <label className="block text-sm font-medium text-gray-300 mb-1">Your name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onCreateRoom(name.trim())}
          placeholder="e.g. Alice"
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:outline-none focus:border-indigo-500 mb-4"
          autoFocus
        />

        <button
          disabled={!name.trim()}
          onClick={() => onCreateRoom(name.trim())}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg py-3 transition-colors"
        >
          Create Room
        </button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-700" />
          </div>
          <div className="relative flex justify-center text-xs text-gray-500 uppercase tracking-wide">
            <span className="bg-gray-900 px-3">or join existing</span>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-300 mb-1">Room code</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && code.trim().length === 6 && onJoinRoom(code.trim())}
          placeholder="e.g. ABC123"
          maxLength={6}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:outline-none focus:border-emerald-500 mb-4 font-mono tracking-widest text-center uppercase"
        />
        <button
          disabled={code.trim().length !== 6}
          onClick={() => onJoinRoom(code.trim())}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg py-3 transition-colors"
        >
          Join Session
        </button>
      </div>
    </div>
  );
}
