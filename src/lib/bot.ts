import type { AppContext } from '../types';
import { getSetting, getAllSettings } from '../db';
import { helperConfigFromSettings } from './bot-copy';

// Bot settings readers, moved verbatim from api/bot.ts so api/chat.ts stops
// importing across api files.

/** Missing setting = enabled; only an explicit '0' turns the bot off. */
export async function botEnabled(ctx: AppContext): Promise<boolean> {
  const s = await getSetting(ctx.env, 'bot_enabled');
  return s?.value !== '0';
}

export async function botName(ctx: AppContext): Promise<string> {
  return helperConfigFromSettings(await getAllSettings(ctx.env), ctx.locale).name;
}
