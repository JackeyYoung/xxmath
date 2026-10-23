/* core/ui/bus-ui.js */
import { on, emit } from '../events.js';

export const UI_EVT = {
  CORRECT:    'ui:correct',
  WRONG:      'ui:wrong',
  THUMB:      'ui:thumb',
  TIMER_START:'ui:timer:start',
  TIMER_END:  'ui:timer:end',
};

export function emitUI(type, payload) { emit('ui:' + type, payload); }
export function onUI(type, fn) { return on('ui:' + type, fn); }