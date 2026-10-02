import { esc } from '../views/layout';

export interface Badge {
  id: number | string;
  name: string;
  icon: string;
  color: string;
  text_color?: string;
  description: string;
  shape?: string;
  status?: 'have' | 'need';
}

export function renderBadgeIcon(icon: string): string {
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(icon)) return `<img src="${esc(icon)}" style="width:16px;height:16px;vertical-align:middle;border-radius:2px;">`;
  return esc(icon);
}
