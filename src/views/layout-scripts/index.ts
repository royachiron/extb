// The layout.ts inline <script> body, split by concern into byte-identical
// string slices and re-concatenated here in the ORIGINAL order. Rules:
// - ONE <script> tag only (CSP + layout-script-syntax test + handler ordering).
// - Order is load-bearing: definitions (uploads/forms/ui/batch) precede the
//   boot slice that calls them; changing order changes behavior.
// - Slices are static strings - no ${} interpolation existed in the original
//   block and none may be introduced.
import { SCRIPT_UPLOADS } from './uploads';
import { SCRIPT_FORMS } from './forms';
import { SCRIPT_UI } from './ui';
import { SCRIPT_BATCH } from './batch';
import { SCRIPT_BOOT } from './boot';
import { SCRIPT_UNFURL } from './unfurl';
import { SCRIPT_PUSH } from './push';
import { SCRIPT_DM_MOD } from './dm-mod';
import { SCRIPT_CROPPER } from './cropper';

export const LAYOUT_SCRIPT =
  SCRIPT_UPLOADS +
  SCRIPT_FORMS +
  SCRIPT_UI +
  SCRIPT_BATCH +
  SCRIPT_BOOT +
  SCRIPT_UNFURL +
  SCRIPT_PUSH +
  SCRIPT_DM_MOD +
  SCRIPT_CROPPER;
