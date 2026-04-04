import { Pool } from 'mysql2/promise';
import GroupSelectionModel from '../models/GroupSelection';
import { getWCIF, getGroupsConfig, parseActivityCode, findActivityById, getPersonByWcaUserId } from '../utils/wcif';
import { AvailableGroup, GroupInfo } from '../types';

interface GroupServiceResponse {
    person: {
        registrantId: number;
        name: string;
        wcaId: string;
        eventIds: string[];
    };
    availableGroups: AvailableGroup[];
}

interface SelectGroupResponse {
    success: boolean;
    message?: string;
    selection?: {
        activityId: number;
        groupNumber: number;
        currentCount: number;
        maxCapacity: number;
    };
}

interface ActivityGroupsResponse {
    activityId: number;
    activityName: string;
    groups: Array<{
        groupNumber: number;
        currentCount: number;
        maxCapacity: number;
        isFull: boolean;
    }>;
}

class GroupService {
    static async getAvailableGroups(db: Pool, wcaUserId: string): Promise<GroupServiceResponse> {
        const wcif = await getWCIF();
        const person = await getPersonByWcaUserId(wcif, wcaUserId, db);
        
        if (!person || !person.registration) {
            throw new Error('Not registered for this competition');
        }

        const registeredEvents = person.registration.eventIds || [];
        const groupsConfig = await getGroupsConfig();
        
        const selections = await GroupSelectionModel.findByRegistrantId(db, person.registrantId);
        const userSelections: Record<number, number> = {};
        selections.forEach(sel => {
            userSelections[sel.activityId] = sel.groupNumber;
        });

        const [groupCounts] = await db.query<any[]>(
            'SELECT activity_id, group_number, COUNT(*) as count FROM group_selections GROUP BY activity_id, group_number'
        );
        
        const countMap: Record<number, Record<number, number>> = {};
        groupCounts.forEach((gc: any) => {
            if (!countMap[gc.activity_id]) countMap[gc.activity_id] = {};
            countMap[gc.activity_id][gc.group_number] = gc.count;
        });

        const availableGroups: AvailableGroup[] = [];
        
        for (const venue of wcif.schedule.venues) {
            for (const room of venue.rooms) {
                for (const activity of room.activities) {
                    if (!activity.childActivities || activity.childActivities.length === 0) {
                        continue;
                    }

                    const parsed = parseActivityCode(activity.activityCode);
                    if (!parsed || !registeredEvents.includes(parsed.eventId)) {
                        continue;
                    }

                    const configKey = `${parsed.eventId}-r${parsed.roundNumber}`;
                    const config = groupsConfig.groupSettings[configKey];
                    if (!config) {
                        continue;
                    }

                    const groups: GroupInfo[] = [];
                    for (const groupActivity of activity.childActivities) {
                        const groupParsed = parseActivityCode(groupActivity.activityCode);
                        if (!groupParsed || !groupParsed.groupNumber) continue;

                        const currentCount = (countMap[groupActivity.id]?.[groupParsed.groupNumber]) || 0;
                        const maxCapacity = config.maxPerGroup || 24;

                        groups.push({
                            activityId: groupActivity.id,
                            groupNumber: groupParsed.groupNumber,
                            startTime: groupActivity.startTime,
                            endTime: groupActivity.endTime,
                            currentCount,
                            maxCapacity,
                            isFull: currentCount >= maxCapacity,
                            isSelected: userSelections[groupActivity.id] === groupParsed.groupNumber
                        });
                    }

                    availableGroups.push({
                        activityId: activity.id,
                        activityName: activity.name,
                        eventId: parsed.eventId,
                        roundNumber: parsed.roundNumber,
                        room: room.name,
                        startTime: activity.startTime,
                        endTime: activity.endTime,
                        groups: groups.sort((a, b) => a.groupNumber - b.groupNumber)
                    });
                }
            }
        }

        return {
            person: {
                registrantId: person.registrantId,
                name: person.name,
                wcaId: person.wcaId,
                eventIds: registeredEvents
            },
            availableGroups
        };
    }

    static async selectGroup(db: Pool, wcaUserId: string, activityId: number, groupNumber: number): Promise<SelectGroupResponse> {
        const wcif = await getWCIF();
        const person = await getPersonByWcaUserId(wcif, wcaUserId, db);
        
        if (!person) {
            throw new Error('Not registered for this competition');
        }

        const activityInfo = findActivityById(wcif, activityId);
        if (!activityInfo) {
            throw new Error('Activity not found');
        }

        const groupsConfig = await getGroupsConfig();
        const parentActivity = activityInfo.parent || activityInfo.activity;
        const config = groupsConfig.groupSettings[parentActivity.name];

        if (!config) {
            throw new Error('This activity does not have group selection enabled');
        }

        const maxCapacity = config.maxPerGroup || 24;
        const currentCount = await GroupSelectionModel.countByActivityAndGroup(db, activityId, groupNumber);
        
        if (currentCount >= maxCapacity) {
            throw new Error('Group is full');
        }

        await GroupSelectionModel.createOrUpdate(db, {
            registrantId: person.registrantId,
            wcaUserId: wcaUserId,
            activityId: activityId,
            activityName: activityInfo.activity.name,
            groupNumber: groupNumber
        });

        return {
            success: true,
            message: 'Group selection saved',
            selection: {
                activityId,
                groupNumber,
                currentCount: currentCount + 1,
                maxCapacity
            }
        };
    }

    static async getActivityGroups(db: Pool, activityId: number): Promise<ActivityGroupsResponse> {
        const wcif = await getWCIF();
        const activityInfo = findActivityById(wcif, activityId);

        if (!activityInfo) {
            throw new Error('Activity not found');
        }

        const [groupCounts] = await db.query<any[]>(
            'SELECT group_number, COUNT(*) as count FROM group_selections WHERE activity_id = ? GROUP BY group_number',
            [activityId]
        );

        const groupsConfig = await getGroupsConfig();
        const parentActivity = activityInfo.parent || activityInfo.activity;
        const config = groupsConfig.groupSettings[parentActivity.name];
        const maxCapacity = config ? (config.maxPerGroup || 24) : 24;

        return {
            activityId: activityInfo.activity.id,
            activityName: activityInfo.activity.name,
            groups: groupCounts.map((gc: any) => ({
                groupNumber: gc.group_number,
                currentCount: gc.count,
                maxCapacity,
                isFull: gc.count >= maxCapacity
            }))
        };
    }
}

export default GroupService;
