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

        const assignmentsToAdd: Record<number, any[]> = {};
        
        for (const selection of selections) {
            if (!assignmentsToAdd[selection.registrantId]) {
                assignmentsToAdd[selection.registrantId] = [];
            }

            assignmentsToAdd[selection.registrantId].push({
                activityId: selection.activityId,
                assignmentCode: 'competitor',
                stationNumber: null
            });
        }

        const updatedPersons = wcif.persons.map(person => {
            // Strip private/read-only fields that WCA rejects in PATCH requests
            const { birthdate, email, personalBests, avatar, ...patchablePerson } = person as any;

            if (assignmentsToAdd[person.registrantId]) {
                const existingAssignments = (person.assignments || []).filter(a => {
                    const isCompetitorForSelectedActivity = 
                        a.assignmentCode === 'competitor' && 
                        assignmentsToAdd[person.registrantId].some(newA => newA.activityId === a.activityId);
                    return !isCompetitorForSelectedActivity;
                });

                return {
                    ...patchablePerson,
                    assignments: [...existingAssignments, ...assignmentsToAdd[person.registrantId]]
                };
            }
            return patchablePerson;
        });

        const [writeResult] = await db.query<any>(
            'INSERT INTO wcif_writes (delegate_wca_user_id, delegate_name, write_status, groups_written) VALUES (?, ?, ?, ?)',
            [delegateInfo.wcaUserId, delegateInfo.name, 'pending', selections.length]
        );

        const writeId = writeResult.insertId;

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
