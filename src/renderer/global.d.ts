import type { StudioDesktopApi } from '../shared/types';

declare global {
  interface Window {
    readonly studioApi: StudioDesktopApi;
  }
}

export {};

