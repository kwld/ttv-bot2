
import { User } from './types';

export const MOCK_USERS: User[] = [
  { 
    id: '1001', 
    username: 'stream_master', 
    displayName: 'StreamMaster', 
    badges: { broadcaster: '1' },
    badgeIcons: [], 
    rank: 0,
    isBroadcaster: true,
    isModerator: true,
    isVip: false,
    isSubscriber: false,
    points: 99999,
    messageCount: 1000,
    onlineMinutes: 5000
  },
  {
    id: '1006',
    username: 'mod_hammer',
    displayName: 'ModHammer',
    badges: { moderator: '1', subscriber: '3' },
    badgeIcons: [], 
    rank: 1,
    isBroadcaster: false,
    isModerator: true,
    isVip: false,
    isSubscriber: true,
    points: 10000,
    messageCount: 500,
    onlineMinutes: 300
  },
  { 
    id: '1002', 
    username: 'fancy_vip', 
    displayName: 'FancyVIP', 
    badges: { vip: '1' },
    badgeIcons: [], 
    rank: 2,
    isBroadcaster: false,
    isModerator: false,
    isVip: true,
    isSubscriber: false,
    points: 5000,
    messageCount: 150,
    onlineMinutes: 120
  },
  {
    id: '1003', 
    username: 'loyal_sub',
    displayName: 'LoyalSub',
    badges: { subscriber: '12' },
    badgeIcons: [], 
    rank: 3, // Regular rank level, but has sub flag
    isBroadcaster: false,
    isModerator: false,
    isVip: false,
    isSubscriber: true,
    points: 2500,
    messageCount: 300,
    onlineMinutes: 600
  },
  {
    id: '1005',
    username: 'golden_member',
    displayName: 'GoldenMember',
    badges: { vip: '1', subscriber: '24' },
    badgeIcons: [], 
    rank: 2,
    isBroadcaster: false,
    isModerator: false,
    isVip: true,
    isSubscriber: true,
    points: 7500,
    messageCount: 400,
    onlineMinutes: 400
  },
  {
    id: '1004',
    username: 'just_regular',
    displayName: 'JustRegular',
    badges: {},
    badgeIcons: [], 
    rank: 3, // Standard User Rank
    isBroadcaster: false,
    isModerator: false,
    isVip: false,
    isSubscriber: false,
    points: 100,
    messageCount: 5,
    onlineMinutes: 10
  },
  {
    id: '1008',
    username: 'new_viewer',
    displayName: 'NewViewer123',
    badges: { turbo: '1' },
    badgeIcons: [], 
    rank: 3,
    isBroadcaster: false,
    isModerator: false,
    isVip: false,
    isSubscriber: false,
    points: 0,
    messageCount: 0,
    onlineMinutes: 1
  }
];
