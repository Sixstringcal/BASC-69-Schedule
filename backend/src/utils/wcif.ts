import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'mysql2/promise';
import { WCIF, GroupsConfig, Activity, Person } from '../types';

const WCA_ORIGIN = process.env.WCA_ORIGIN || 'https://www.worldcubeassociation.org';
const COMPETITION_ID = process.env.COMPETITION_ID || '';

let wcifCache: WCIF | null = null;
let wcifCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

let groupsConfigCache: GroupsConfig | null = null;

export async function getWCIF(accessToken: string | null = null): Promise<WCIF> {
    const now = Date.now();
    if (wcifCache && (now - wcifCacheTime) < CACHE_DURATION) {
        return wcifCache;
    }
    
    try {
        const url = accessToken 
            ? `${WCA_ORIGIN}/api/v0/competitions/${COMPETITION_ID}/wcif`
            : `${WCA_ORIGIN}/api/v0/competitions/${COMPETITION_ID}/wcif/public`;
            
        const config = accessToken 
            ? { headers: { Authorization: `Bearer ${accessToken}` } }
            : {};
            
        const response = await axios.get<WCIF>(url, config);
        wcifCache = response.data;
        wcifCacheTime = now;
        return wcifCache;
    } catch (error: any) {
        console.error('Failed to fetch WCIF:', error.message);
        throw error;
    }
}

export async function getGroupsConfig(): Promise<GroupsConfig> {
    if (groupsConfigCache !== null) {
        return groupsConfigCache as GroupsConfig;
    }
    
    try {
        const configPath = path.join(__dirname, '../../../groups-config.json');
        const data = await fs.readFile(configPath, 'utf8');
        groupsConfigCache = JSON.parse(data);
        return groupsConfigCache as GroupsConfig;
    } catch (error: any) {
        console.error('Failed to load groups config:', error.message);
        return { groupSettings: {} };
    }
}

export interface ParsedActivityCode {
    eventId: string;
    roundNumber: number;
    groupNumber: number | null;
}

export function parseActivityCode(activityCode: string): ParsedActivityCode | null {
    const match = activityCode.match(/^(\w+)-r(\d+)(?:-g(\d+))?$/);
    if (!match) return null;
    
    return {
        eventId: match[1],
        roundNumber: parseInt(match[2]),
        groupNumber: match[3] ? parseInt(match[3]) : null
    };
}

export interface ActivityInfo {
    activity: Activity;
    parent?: Activity;
    room?: any;
    venue?: any;
}

export function findActivityById(wcif: WCIF, activityId: number): ActivityInfo | null {
    for (const venue of wcif.schedule.venues) {
        for (const room of venue.rooms) {
            for (const activity of room.activities) {
                if (activity.id === activityId) {
                    return { activity, room, venue };
                }
                
                if (activity.childActivities) {
                    for (const child of activity.childActivities) {
                        if (child.id === activityId) {
                            return { activity: child, parent: activity, room, venue };
                        }
                    }
                }
            }
        }
    }
    return null;
}

export async function getPersonByWcaUserId(wcif: WCIF, wcaUserId: string, db: Pool): Promise<Person | null> {
    const [rows] = await db.query<any[]>(
        'SELECT wca_id FROM oauth_tokens WHERE wca_user_id = ?',
        [wcaUserId]
    );
    
    if (rows.length === 0) return null;
    
    const wcaId = rows[0].wca_id;
    const person = wcif.persons.find(p => p.wcaId === wcaId);
    return person || null;
}

export function invalidateWCIFCache(): void {
    wcifCache = null;
    wcifCacheTime = 0;
}

export { WCA_ORIGIN, COMPETITION_ID };
