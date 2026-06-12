import { Pool } from 'mysql2/promise';
import GroupSelectionModel from '../models/GroupSelection';
import UnofficialRegistrationModel from '../models/UnofficialRegistration';
import { getWCIF, getGroupsConfig, parseActivityCode, findActivityById, getPersonByWcaUserId, refreshAccessToken } from '../utils/wcif';
import UserModel from '../models/User';
import { AvailableGroup, GroupInfo } from '../types';

interface GroupServiceResponse {
    person: {
        registrantId: number;
        name: string;
        wcaId: string;
        eventIds: string[];
    } | null;
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

async function getWCIFForUser(db: Pool, wcaUserId: string) {
    const user = await UserModel.findByWcaUserId(db, wcaUserId);
    if (!user?.accessToken) return getWCIF();
    try {
        return await getWCIF(user.accessToken);
    } catch {
        try {
            const newToken = await refreshAccessToken(db, wcaUserId);
            return await getWCIF(newToken);
        } catch {
            return getWCIF();
        }
    }
}

class GroupService {
    static async getAvailableGroups(db: Pool, wcaUserId: string): Promise<GroupServiceResponse> {
        const wcif = await getWCIFForUser(db, wcaUserId);
        const person = await getPersonByWcaUserId(wcif, wcaUserId, db);

        if (!person || !person.registration) {
            return {
                person: null,
                availableGroups: []
            };
        }

        const registeredEvents = person.registration.eventIds || [];
        const unofficialRegs = await UnofficialRegistrationModel.findByWcaUserId(db, wcaUserId);
        const allRegisteredEvents = [...registeredEvents, ...unofficialRegs.map(r => r.eventId)];
        const groupsConfig = await getGroupsConfig();

        // Activity IDs the logged-in person is assigned to as a competitor in the WCIF
        const assignedActivityIds = new Set<number>(
            (person.assignments || [])
                .filter(a => a.assignmentCode === 'competitor')
                .map(a => a.activityId)
        );

        const selections = await GroupSelectionModel.findByRegistrantId(db, person.registrantId!);
        const userSelections: Record<number, number> = {};
        const acceptedActivityIds = new Set<number>();
        selections.forEach(sel => {
            userSelections[sel.activityId] = sel.groupNumber;
            if (sel.accepted) acceptedActivityIds.add(sel.activityId);
        });

        // How many pending selections exist per group
        const [groupCounts] = await db.query<any[]>(
            'SELECT activity_id, group_number, COUNT(*) as count FROM group_selections GROUP BY activity_id, group_number'
        );
        const countMap: Record<number, Record<number, number>> = {};
        groupCounts.forEach((gc: any) => {
            if (!countMap[gc.activity_id]) countMap[gc.activity_id] = {};
            countMap[gc.activity_id][gc.group_number] = gc.count;
        });

        // How many competitors are already assigned in the WCIF per child activity
        const wcifAssignmentCounts: Record<number, number> = {};
        for (const p of wcif.persons) {
            for (const assignment of (p.assignments || [])) {
                if (assignment.assignmentCode === 'competitor') {
                    wcifAssignmentCounts[assignment.activityId] = (wcifAssignmentCounts[assignment.activityId] || 0) + 1;
                }
            }
        }

        const availableGroups: AvailableGroup[] = [];

        // WCIF schedule activities
        for (const venue of wcif.schedule.venues) {
            for (const room of venue.rooms) {
                for (const activity of room.activities) {
                    if (!activity.childActivities || activity.childActivities.length === 0) continue;

                    const parsed = parseActivityCode(activity.activityCode);
                    if (!parsed || !allRegisteredEvents.includes(parsed.eventId)) continue;
                    if (groupsConfig.disabledEvents?.includes(parsed.eventId)) continue;

                    const configKey = `${parsed.eventId}-r${parsed.roundNumber}`;
                    const config = groupsConfig.groupSettings[configKey];
                    const maxPerGroup = config?.maxPerGroup ?? 9999;

                    const groups: GroupInfo[] = [];
                    for (const groupActivity of activity.childActivities) {
                        const groupParsed = parseActivityCode(groupActivity.activityCode);
                        if (!groupParsed || !groupParsed.groupNumber) continue;

                        const selectionCount = (countMap[groupActivity.id]?.[groupParsed.groupNumber]) || 0;
                        const currentCount = selectionCount + (wcifAssignmentCounts[groupActivity.id] || 0);

                        groups.push({
                            activityId: groupActivity.id,
                            groupNumber: groupParsed.groupNumber,
                            startTime: groupActivity.startTime,
                            endTime: groupActivity.endTime,
                            currentCount,
                            maxCapacity: maxPerGroup,
                            isFull: currentCount >= maxPerGroup,
                            isSelected: userSelections[groupActivity.id] === groupParsed.groupNumber,
                            isAccepted: acceptedActivityIds.has(groupActivity.id),
                            isAssigned: assignedActivityIds.has(groupActivity.id)
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

        // Unofficial events with explicitly configured timeslots
        const unofficialGroupSettings = groupsConfig.unofficialGroupSettings || {};
        for (const [eventId, settings] of Object.entries(unofficialGroupSettings)) {
            if (!unofficialRegs.some(r => r.eventId === eventId)) continue;
            if (groupsConfig.disabledEvents?.includes(eventId)) continue;

            const groups: GroupInfo[] = [];
            for (const groupDef of settings.groups) {
                const selectionCount = (countMap[groupDef.id]?.[groupDef.groupNumber]) || 0;
                const maxCapacity = settings.maxPerGroup ?? 9999;

                groups.push({
                    activityId: groupDef.id,
                    groupNumber: groupDef.groupNumber,
                    startTime: groupDef.startTime,
                    endTime: groupDef.endTime,
                    currentCount: selectionCount,
                    maxCapacity,
                    isFull: selectionCount >= maxCapacity,
                    isSelected: userSelections[groupDef.id] === groupDef.groupNumber,
                    isAccepted: acceptedActivityIds.has(groupDef.id),
                    isAssigned: false
                });
            }

            if (groups.length > 0) {
                availableGroups.push({
                    activityId: settings.id,
                    activityName: settings.name,
                    eventId,
                    roundNumber: 1,
                    room: '',
                    startTime: settings.groups[0].startTime,
                    endTime: settings.groups[settings.groups.length - 1].endTime,
                    groups: groups.sort((a, b) => a.groupNumber - b.groupNumber)
                });
            }
        }

        return {
            person: {
                registrantId: person.registrantId!,
                name: person.name,
                wcaId: person.wcaId,
                eventIds: registeredEvents
            },
            availableGroups
        };
    }

    static async selectGroup(db: Pool, wcaUserId: string, activityId: number, groupNumber: number): Promise<SelectGroupResponse> {
        const wcif = await getWCIFForUser(db, wcaUserId);
        const person = await getPersonByWcaUserId(wcif, wcaUserId, db);

        if (!person) {
            throw new Error('Not registered for this competition');
        }

        const groupsConfig = await getGroupsConfig();
        const activityInfo = findActivityById(wcif, activityId);

        if (!activityInfo) {
            // Check if this is a synthetic activity from unofficialGroupSettings
            const unofficialGroupSettings = groupsConfig.unofficialGroupSettings || {};
            for (const [eventId, settings] of Object.entries(unofficialGroupSettings)) {
                const groupDef = settings.groups.find(g => g.id === activityId);
                if (!groupDef) continue;

                if (groupsConfig.disabledEvents?.includes(eventId)) {
                    throw new Error('Group selection is not available for this event');
                }
                const unofficialRegs = await UnofficialRegistrationModel.findByWcaUserId(db, wcaUserId);
                if (!unofficialRegs.some(r => r.eventId === eventId)) {
                    throw new Error('Not registered for this event');
                }
                const alreadyAccepted = await GroupSelectionModel.isAccepted(db, wcaUserId, activityId);
                if (alreadyAccepted) {
                    throw new Error('This group selection has been accepted and can no longer be changed');
                }

                const maxCapacity = settings.maxPerGroup ?? 9999;
                const currentCount = await GroupSelectionModel.countByActivityAndGroup(db, activityId, groupNumber);
                if (currentCount >= maxCapacity) {
                    throw new Error('Group is full');
                }

                const siblingIds = settings.groups.map(g => g.id).filter(id => id !== activityId);
                await GroupSelectionModel.deleteSiblingSelections(db, wcaUserId, siblingIds);

                await GroupSelectionModel.createOrUpdate(db, {
                    registrantId: person.registrantId!,
                    wcaUserId,
                    activityId,
                    activityName: `${settings.name} Group ${groupDef.groupNumber}`,
                    groupNumber
                });

                return {
                    success: true,
                    message: 'Group selection saved',
                    selection: { activityId, groupNumber, currentCount: currentCount + 1, maxCapacity }
                };
            }
            throw new Error('Activity not found');
        }

        // WCIF activity
        const parentActivity = activityInfo.parent || activityInfo.activity;
        const parsed = parseActivityCode(parentActivity.activityCode);

        if (!parsed) {
            throw new Error('Not registered for this event');
        }

        const unofficialRegs = await UnofficialRegistrationModel.findByWcaUserId(db, wcaUserId);
        const inWcif = person.registration?.eventIds?.includes(parsed.eventId) ?? false;
        const inUnofficial = unofficialRegs.some(r => r.eventId === parsed.eventId);
        if (!inWcif && !inUnofficial) {
            throw new Error('Not registered for this event');
        }

        if (groupsConfig.disabledEvents?.includes(parsed.eventId)) {
            throw new Error('Group selection is not available for this event');
        }

        const configKey = `${parsed.eventId}-r${parsed.roundNumber}`;
        const config = groupsConfig.groupSettings[configKey];
        const maxCapacity = config?.maxPerGroup ?? 9999;

        const selectionCount = await GroupSelectionModel.countByActivityAndGroup(db, activityId, groupNumber);
        const wcifCount = wcif.persons.filter(p =>
            (p.assignments || []).some(a => a.activityId === activityId && a.assignmentCode === 'competitor')
        ).length;
        const currentCount = selectionCount + wcifCount;

        if (currentCount >= maxCapacity) {
            throw new Error('Group is full');
        }

        const siblingIds = (parentActivity.childActivities || [])
            .map((c: any) => c.id as number)
            .filter((id: number) => id !== activityId);
        await GroupSelectionModel.deleteSiblingSelections(db, wcaUserId, siblingIds);

        await GroupSelectionModel.createOrUpdate(db, {
            registrantId: person.registrantId!,
            wcaUserId,
            activityId,
            activityName: activityInfo.activity.name,
            groupNumber
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

    static async deselectGroup(db: Pool, wcaUserId: string, activityId: number): Promise<{ success: boolean }> {
        const accepted = await GroupSelectionModel.isAccepted(db, wcaUserId, activityId);
        if (accepted) {
            throw new Error('This group selection has been accepted and can no longer be changed');
        }
        await GroupSelectionModel.deleteByWcaUserIdAndActivity(db, wcaUserId, activityId);
        return { success: true };
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

        const parentActivity = activityInfo.parent || activityInfo.activity;
        const parsed = parseActivityCode(parentActivity.activityCode);
        const groupsConfig = await getGroupsConfig();
        const configKey = parsed ? `${parsed.eventId}-r${parsed.roundNumber}` : null;
        const config = configKey ? groupsConfig.groupSettings[configKey] : null;
        const maxCapacity = config?.maxPerGroup ?? 24;

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
