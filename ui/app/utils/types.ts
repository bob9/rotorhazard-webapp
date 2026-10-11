// Loose shapes of the server payloads (see src/server/RHUI.py emit_* functions).
export type Json = any

export interface RHState {
  [event: string]: Json
}

export const RaceStatus = {
  READY: 0,
  RACING: 1,
  DONE: 2,
  STAGING: 3
} as const
