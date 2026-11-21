import { AppState } from '../types';

export function createSeedState(): AppState {
  return {
    users: [],
    currentUserId: null,
    customers: [],
    followUps: [],
    expiryActions: {},
  };
}
