import { Request } from 'express';

export interface WCAUser {
  id: string;
  wca_id: string;
  name: string;
  accessToken: string;
  refreshToken?: string;
}

export interface AuthenticatedRequest extends Request {
  accessToken?: string;
  user?: Express.User;
}

export interface Person {
  registrantId: number;
  name: string;
  wcaId: string;
  wcaUserId: string;
  countryIso2: string;
  gender: string;
  birthdate: string;
  email: string;
  avatar?: {
    url: string;
    thumbUrl: string;
  };
  roles: string[];
  registration?: {
    wcaRegistrationId: number;
    eventIds: string[];
    status: string;
    guests: number;
  };
  assignments: Assignment[];
}

export interface Assignment {
  activityId: number;
  assignmentCode: string;
  stationNumber: number | null;
}

export interface Activity {
  id: number;
  name: string;
  activityCode: string;
  startTime: string;
  endTime: string;
  childActivities?: Activity[];
  scrambleSetId?: number;
  extensions?: any[];
}

export interface Room {
  id: number;
  name: string;
  color: string;
  activities: Activity[];
  extensions?: any[];
}

export interface Venue {
  id: number;
  name: string;
  latitudeMicrodegrees: number;
  longitudeMicrodegrees: number;
  countryIso2: string;
  timezone: string;
  rooms: Room[];
  extensions?: any[];
}

export interface Schedule {
  startDate: string;
  numberOfDays: number;
  venues: Venue[];
}

export interface WCIF {
  formatVersion: string;
  id: string;
  name: string;
  shortName: string;
  persons: Person[];
  events: any[];
  schedule: Schedule;
  competitorLimit: number | null;
  extensions?: any[];
}

export interface GroupConfig {
  numGroups: number;
  maxPerGroup: number;
}

export interface GroupsConfig {
  groupSettings: {
    [activityName: string]: GroupConfig;
  };
}

export interface GroupSelection {
  registrantId: number;
  wcaUserId: string;
  activityId: number;
  activityName: string;
  groupNumber: number;
  selectedAt: Date;
}

export interface GroupInfo {
  activityId: number;
  groupNumber: number;
  startTime: string;
  endTime: string;
  currentCount: number;
  maxCapacity: number;
  isFull: boolean;
  isSelected: boolean;
  isAssigned: boolean;
}

export interface AvailableGroup {
  activityId: number;
  activityName: string;
  eventId: string;
  roundNumber: number;
  room: string;
  startTime: string;
  endTime: string;
  groups: GroupInfo[];
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

declare global {
  namespace Express {
    interface User {
      id: string;
      wcaId: string;
      name: string;
      accessToken: string;
      refreshToken?: string;
    }
    
    interface Request {
      accessToken?: string;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    wcaUserId: string;
    wcaId: string;
    name: string;
  }
}
