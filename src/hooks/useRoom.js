import { useSyncExternalStore } from 'react';
import { rooms } from '../lib/rooms.js';

/** Snapshot of the active room ({ role, code, status, state, chat, ... }) or null. */
export const useRoom = () => useSyncExternalStore(rooms.subscribe, rooms.getSnapshot);
