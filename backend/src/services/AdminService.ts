import axios from 'axios';
import { Pool } from 'mysql2/promise';
import GroupSelectionModel from '../models/GroupSelection';
import { getWCIF, invalidateWCIFCache, WCA_ORIGIN, COMPETITION_ID } from '../utils/wcif';

interface PendingGroupsResponse {
    totalSelections: number;
    activities: Array<{
        activityId: number;
        activityName: string;
        groups: Array<{
            groupNumber: number;
            count: number;
            competitors: Array<{
                registrantId: number;
                name: string;
                wcaId: string;
                selectedAt: Date;
            }>;
        }>;
    }>;
}

interface WriteToWCIFResponse {
    success: boolean;
    message?: string;
    groupsWritten: number;
}

interface DelegateInfo {
    wcaUserId: string;
    name: string;
    accessToken: string;
}

class AdminService {
    static async getPendingGroups(db: Pool, _accessToken?: string): Promise<PendingGroupsResponse> {
        const selections = await GroupSelectionModel.getAllWithCompetitors(db);
        
        const groupedByActivity: Record<number, any> = {};
        
        for (const selection of selections) {
            if (!groupedByActivity[selection.activityId]) {
                groupedByActivity[selection.activityId] = {
                    activityId: selection.activityId,
                    activityName: selection.activityName,
                    groups: {}
                };
            }

            if (!groupedByActivity[selection.activityId].groups[selection.groupNumber]) {
                groupedByActivity[selection.activityId].groups[selection.groupNumber] = [];
            }

            groupedByActivity[selection.activityId].groups[selection.groupNumber].push({
                registrantId: selection.registrantId,
                name: selection.competitorName,
                wcaId: selection.wcaId,
                selectedAt: selection.selectedAt
            });
        }

        const result = Object.values(groupedByActivity).map((activity: any) => ({
            ...activity,
            groups: Object.entries(activity.groups).map(([groupNumber, competitors]) => ({
                groupNumber: parseInt(groupNumber),
                count: (competitors as any[]).length,
                competitors
            }))
        }));

        return {
            totalSelections: selections.length,
            activities: result
        };
    }

    static async writeToWCIF(db: Pool, delegateInfo: DelegateInfo): Promise<WriteToWCIFResponse> {
        const selections = await GroupSelectionModel.getAll(db);
        
        if (selections.length === 0) {
            throw new Error('No group selections to write');
        }

        const wcif = await getWCIF(delegateInfo.accessToken);

        // Build assignments map keyed by registrantId (null is coerced to "null" by JS)
        // Deduplicate: last selection wins per (registrantId, activityId) pair
        const assignmentsToAdd: Record<string, Map<number, any>> = {};

        for (const selection of selections) {
            const key = String(selection.registrantId);
            if (!assignmentsToAdd[key]) {
                assignmentsToAdd[key] = new Map();
            }
            assignmentsToAdd[key].set(selection.activityId, {
                activityId: selection.activityId,
                assignmentCode: 'competitor',
                stationNumber: null
            });
        }

        // Validate that all activityIds exist in the WCIF schedule before sending.
        // Sending invalid activityIds causes WCA to return a 500 with no details.
        const allScheduleActivityIds = new Set<number>();
        for (const venue of (wcif.schedule?.venues || [])) {
            for (const room of venue.rooms) {
                for (const activity of room.activities) {
                    allScheduleActivityIds.add(activity.id);
                    for (const child of (activity.childActivities || [])) {
                        allScheduleActivityIds.add(child.id);
                    }
                }
            }
        }

        const invalidActivityIds: number[] = [];
        for (const [, assignmentMap] of Object.entries(assignmentsToAdd)) {
            for (const activityId of assignmentMap.keys()) {
                if (!allScheduleActivityIds.has(activityId)) {
                    invalidActivityIds.push(activityId);
                }
            }
        }
        if (invalidActivityIds.length > 0) {
            throw new Error(`ActivityIds [${[...new Set(invalidActivityIds)].join(', ')}] do not exist in the WCIF schedule. The schedule may not have group sub-activities set up yet.`);
        }

        // Only send registered competitors (registrantId must be non-null).
        // Delegates/organizers with no registration (registrantId: null) cannot
        // have competitor assignments and including them causes a WCA 500.
        const updatedPersons = wcif.persons
            .filter(person => person.registrantId !== null && assignmentsToAdd[String(person.registrantId)])
            .map(person => {
                const personAssignmentMap = assignmentsToAdd[String(person.registrantId!)];
                const newAssignments = Array.from(personAssignmentMap.values());
                const baseAssignments = person.assignments || [];
                // Remove existing competitor assignments for activities we're overwriting
                const filteredAssignments = baseAssignments.filter(a => {
                    return !(a.assignmentCode === 'competitor' && personAssignmentMap.has(a.activityId));
                });

                return {
                    wcaUserId: Number(person.wcaUserId),
                    registrantId: person.registrantId,
                    assignments: [...filteredAssignments, ...newAssignments]
                };
            });

        const [writeResult] = await db.query<any>(
            'INSERT INTO wcif_writes (delegate_wca_user_id, delegate_name, write_status, groups_written) VALUES (?, ?, ?, ?)',
            [delegateInfo.wcaUserId, delegateInfo.name, 'pending', selections.length]
        );

        const writeId = writeResult.insertId;

        console.log(`[writeToWCIF] Sending ${updatedPersons.length} person(s) to WCA.`);
        console.log('[writeToWCIF] Payload:', JSON.stringify({ persons: updatedPersons }, null, 2).substring(0, 2000));

        try {
            await axios.patch(
                `${WCA_ORIGIN}/api/v0/competitions/${COMPETITION_ID}/wcif`,
                { persons: updatedPersons },
                { 
                    headers: { 
                        'Authorization': `Bearer ${delegateInfo.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            await db.query(
                'UPDATE wcif_writes SET write_status = ? WHERE id = ?',
                ['success', writeId]
            );

            invalidateWCIFCache();

            return { 
                success: true,
                message: 'Groups successfully written to WCIF',
                groupsWritten: selections.length
            };

        } catch (error: any) {
            await db.query(
                'UPDATE wcif_writes SET write_status = ?, error_message = ? WHERE id = ?',
                ['failed', error.message, writeId]
            );

            throw error;
        }
    }

    static async getWriteHistory(db: Pool): Promise<any[]> {
        const [history] = await db.query<any[]>(
            `SELECT id, delegate_name as delegateName, write_status as writeStatus, error_message as errorMessage, groups_written as groupsWritten, written_at as writtenAt 
             FROM wcif_writes 
             ORDER BY written_at DESC 
             LIMIT 50`
        );

        return history;
    }
}

export default AdminService;
