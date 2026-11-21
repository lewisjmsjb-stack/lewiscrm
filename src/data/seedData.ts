import { AppState } from '../types';

export function createSeedState(): AppState {
  return {
    userProfile: {
      fullName: 'Lewis Lee',
      title: 'Area Manager',
      companyName: 'Alpha Refrigeration Engineering Pte Ltd',
      phone: '+601170718928',
      email: 'lewis.jmsjb@gmail.com',
    },
    users: [],
    currentUserId: null,
    customers: [],
    followUps: [],
    expiryActions: {},
  };
}
