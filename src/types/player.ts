export type AkariPlayerTrack = {
  id: string;
  src: string;
  title: string;
  artist?: string;
  artwork?: string;
};

export type AkariPlayerState = {
  currentId: string | null;
  playing: boolean;
  currentTime: number;
  duration: number;
};

export type AkariPlayerLabels = {
  current: string;
  next: string;
  untitled: string;
  play: string;
  pause: string;
  progress: string;
  expand: string;
  collapse: string;
  close: string;
  error: string;
};

declare global {
  interface WindowEventMap {
    "akari:player:ready": CustomEvent;
    "akari:player:register": CustomEvent<{ tracks: AkariPlayerTrack[] }>;
    "akari:player:request": CustomEvent<{ track: AkariPlayerTrack }>;
    "akari:player:state": CustomEvent<AkariPlayerState>;
    "akari:player:error": CustomEvent<{ message: string }>;
  }
}
