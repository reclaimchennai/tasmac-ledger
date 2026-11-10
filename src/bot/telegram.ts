/** Minimal Telegram Bot API client — only the handful of methods this bot uses. */

// Read lazily, not at module load: ESM hoists this import above the caller's
// dotenv calls, so a token captured here would always be empty.
const token = () => process.env.TELEGRAM_BOT_TOKEN ?? '';
const base = () => `https://api.telegram.org/bot${token()}`;

export function assertToken(): void {
  if (!token()) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is not set. Put it in .env.local (see .env.example) — that file is gitignored.',
    );
  }
}

export interface InlineButton { text: string; callback_data?: string; url?: string }
export type Keyboard = InlineButton[][];

export interface TgUser { id: number; first_name?: string; username?: string }
export interface TgLocation { latitude: number; longitude: number }
export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number };
  text?: string;
  location?: TgLocation;
}
export interface TgCallback {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallback;
}

async function call<T>(method: string, payload: unknown, timeoutMs = 70_000): Promise<T> {
  const res = await fetch(`${base()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) throw new Error(`${method}: ${body.description ?? res.status}`);
  return body.result as T;
}

export const tg = {
  getMe: () => call<{ id: number; username: string; first_name: string }>('getMe', {}, 20_000),

  getUpdates: (offset: number) =>
    call<TgUpdate[]>('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, 70_000),

  sendMessage: (
    chatId: number,
    text: string,
    opts: { keyboard?: Keyboard; replyMarkup?: unknown; disablePreview?: boolean } = {},
  ) =>
    call<TgMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: opts.disablePreview ?? true },
      reply_markup: opts.replyMarkup ?? (opts.keyboard ? { inline_keyboard: opts.keyboard } : undefined),
    }),

  editMessage: (chatId: number, messageId: number, text: string, keyboard?: Keyboard) =>
    call<TgMessage>('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    }),

  answerCallback: (id: string, text?: string) =>
    call<boolean>('answerCallbackQuery', { callback_query_id: id, text, cache_time: 0 }, 20_000),

  setMyCommands: (commands: { command: string; description: string }[]) =>
    call<boolean>('setMyCommands', { commands }, 20_000),
};

/** Telegram renders a small HTML subset; everything interpolated must be escaped. */
export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
