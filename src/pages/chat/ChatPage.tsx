import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, Loader2, MessageCircle, RotateCcw, Send, ShieldAlert, UserRound } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { buildChatContext, sendChatMessage, type ChatTurn } from '../../utils/chat';

const suggestions = [
  'How many installation records are there?',
  'Summarize installations by zone.',
  'Which installations have no scheduled exam candidates?',
];

export default function ChatPage() {
  const { currentUser, data } = useAuth();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || isSending) return;

    const history = messages.slice(-10);
    setMessages(previous => [...previous, { role: 'user', text: question }]);
    setInput('');
    setError('');
    setIsSending(true);

    try {
      const answer = await sendChatMessage(question, buildChatContext(data), history);
      setMessages(previous => [...previous, { role: 'model', text: answer }]);
    } catch (cause) {
      setMessages(previous => previous.slice(0, -1));
      setError(cause instanceof Error ? cause.message : 'Unable to get a response from the chat service.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Chat with your app data</h1>
          <p className="mt-1 text-sm text-gray-600">
            Ask questions about the current requirements, vendors, installations, and exam schedules.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setMessages([]); setError(''); }}
          disabled={messages.length === 0 || isSending}
        >
          <RotateCcw size={14} /> New chat
        </Button>
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <p>
          Demo mode: this browser sends structured operational records and your chat messages to the configured Gemini service.
          User accounts, password hashes, audit logs, and quotation file contents are excluded. The current app login is
          browser-only and does not securely restrict API access; do not use this demo with sensitive or confidential data.
        </p>
      </div>

      <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-xs text-gray-600">
        Signed in as <span className="font-medium text-gray-800">{currentUser?.name}</span>.
        {' '}The current shared dataset has {data.requirements.length} requirements, {data.vendors.length} vendors,{' '}
        {data.installations.length} installations, and {data.examDates.length} exam dates.
      </div>

      <div className="flex min-h-[26rem] flex-col rounded-xl border bg-white shadow-sm">
        <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 ? (
            <div className="flex min-h-[22rem] flex-col items-center justify-center text-center">
              <div className="mb-3 rounded-full bg-blue-50 p-3 text-blue-700">
                <MessageCircle size={24} />
              </div>
              <h2 className="font-semibold text-gray-900">Ask about the data in this app</h2>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                Answers use the latest data currently loaded in this browser. The chat does not save conversation history.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="rounded-full border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'model' && (
                <span className="mt-1 rounded-full bg-blue-50 p-2 text-blue-700"><Bot size={16} /></span>
              )}
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-4 py-3 text-sm ${
                  message.role === 'user'
                    ? 'bg-blue-700 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {message.text}
              </div>
              {message.role === 'user' && (
                <span className="mt-1 rounded-full bg-gray-100 p-2 text-gray-600"><UserRound size={16} /></span>
              )}
            </div>
          ))}
          {isSending && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" /> Gemini is checking the current data…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div role="alert" className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={submitMessage} className="flex items-end gap-2 border-t p-3">
          <label className="sr-only" htmlFor="chat-message">Your question</label>
          <textarea
            id="chat-message"
            rows={2}
            maxLength={2000}
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="Ask a question about your app data…"
            className="min-h-11 flex-1 resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            disabled={isSending}
          />
          <Button type="submit" disabled={isSending || !input.trim()} aria-label="Send message">
            {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
        <p className="px-4 pb-3 text-xs text-gray-400">Up to 2,000 characters per message. Verify important answers against the app records.</p>
      </div>
    </section>
  );
}
