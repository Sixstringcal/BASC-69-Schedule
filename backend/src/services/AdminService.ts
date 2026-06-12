import axios from 'axios';
import { Pool } from 'mysql2/promise';
import GroupSelectionModel from '../models/GroupSelection';
import UnofficialRegistrationModel from '../models/UnofficialRegistration';
import { getWCIF, getGroupsConfig, invalidateWCIFCache, WCA_ORIGIN, COMPETITION_ID } from '../utils/wcif';

interface UnofficialEventCutoff {
    numberOfAttempts: number;
    attemptResult: number;
}

interface PendingGroupsResponse {
    totalSelections: number;
    competitionName: string;
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
    unofficialRegistrations: Array<{
        eventId: string;
        eventName: string;
        format: string | null;
        timeLimit: number | null;
        cutoff: UnofficialEventCutoff | null;
        count: number;
        competitors: Array<{ name: string; wcaId: string; registrantId: number | null }>;
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
        const [selections, wcif, config] = await Promise.all([
            GroupSelectionModel.getAllWithCompetitors(db),
            getWCIF(),
            getGroupsConfig()
        ]);
        
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

        const unofficialRows = await UnofficialRegistrationModel.getAllWithCompetitors(db);
        const configEventMap = new Map((config.unofficialEvents || []).map(e => [e.id, e]));
        const unofficialByEvent: Record<string, any> = {};
        for (const row of unofficialRows) {
            if (!unofficialByEvent[row.eventId]) {
                const eventConfig = configEventMap.get(row.eventId);
                unofficialByEvent[row.eventId] = {
                    eventId: row.eventId,
                    eventName: row.eventName,
                    format: eventConfig?.format ?? null,
                    timeLimit: eventConfig?.timeLimit ?? null,
                    cutoff: eventConfig?.cutoff ?? null,
                    competitors: []
                };
            }
            unofficialByEvent[row.eventId].competitors.push({
                name: row.competitorName,
                wcaId: row.wcaId,
                registrantId: row.registrantId
            });
        }
        const unofficialRegistrations = Object.values(unofficialByEvent).map((e: any) => ({
            ...e,
            count: e.competitors.length
        }));

        return {
            totalSelections: selections.length,
            competitionName: wcif.name,
            activities: result,
            unofficialRegistrations
        };
    }

    static async writeToWCIF(db: Pool, delegateInfo: DelegateInfo): Promise<WriteToWCIFResponse> {
        // Synthetic activity IDs (>= 1000000) are for unofficial events and cannot
        // be written to the WCA WCIF — skip them.
        const SYNTHETIC_ID_THRESHOLD = 1000000;
        const selections = (await GroupSelectionModel.getAll(db))
            .filter(s => s.activityId < SYNTHETIC_ID_THRESHOLD);

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

        // Build a map from child activityId → set of all sibling activityIds
        // (all children sharing the same parent round), used to remove stale
        // competitor assignments when a person is moved to a different group.
        const siblingGroups = new Map<number, Set<number>>();
        for (const venue of (wcif.schedule?.venues || [])) {
            for (const room of venue.rooms) {
                for (const activity of room.activities) {
                    if (activity.childActivities && activity.childActivities.length > 0) {
                        const siblingIds = new Set<number>(activity.childActivities.map((c: any) => c.id as number));
                        for (const child of activity.childActivities) {
                            siblingGroups.set(child.id, siblingIds);
                        }
                    }
                }
            }
        }

        // Only send registered competitors (registrantId must be non-null).
        // Delegates/organizers with no registration (registrantId: null) cannot
        // have competitor assignments and including them causes a WCA 500.
        const conflictWarnings: string[] = [];
        const updatedPersons = wcif.persons
            .filter(person =>
                person.registrantId !== null &&
                assignmentsToAdd[String(person.registrantId)]
            )
            .map(person => {
                const personAssignmentMap = assignmentsToAdd[String(person.registrantId!)];
                const baseAssignments = person.assignments || [];

                // Build a lookup of existing WCA assignments by activityId.
                const existingByActivityId = new Map<number, any>();
                for (const a of baseAssignments) {
                    existingByActivityId.set(a.activityId, a);
                }

                const finalAssignments: any[] = [];

                // Collect sibling activityIds to evict: any group that shares a
                // parent round with one of our new assignments but isn't itself
                // being written. Only competitor assignments are removed so that
                // staff/judge assignments in other groups are left intact.
                const activityIdsToEvict = new Set<number>();
                for (const activityId of personAssignmentMap.keys()) {
                    const siblings = siblingGroups.get(activityId);
                    if (siblings) {
                        for (const sibId of siblings) {
                            if (!personAssignmentMap.has(sibId)) {
                                activityIdsToEvict.add(sibId);
                            }
                        }
                    }
                }

                // 1. Keep all existing assignments for activityIds NOT in our selection,
                //    except stale competitor assignments for sibling groups being replaced.
                for (const existing of baseAssignments) {
                    const isStaleGroupAssignment =
                        activityIdsToEvict.has(existing.activityId) &&
                        existing.assignmentCode === 'competitor';
                    if (!personAssignmentMap.has(existing.activityId) && !isStaleGroupAssignment) {
                        finalAssignments.push(existing);
                    }
                }

                // 2. Handle activityIds we want to write.
                //
                // WCA's update_persons_wcif! uses wcif_equal? (checks activityId,
                // stationNumber, AND assignmentCode) to find existing assignments.
                // If the codes DIFFER, WCA calls .build() which creates a new AR
                // object with id: nil. upsert_all then issues INSERT ... id=NULL which
                // violates PostgreSQL's NOT NULL constraint → 500.
                //
                // Workaround: if an existing WCA assignment has a DIFFERENT code for
                // an activityId we want (e.g., staff-delegate vs competitor), preserve
                // the existing assignment unchanged rather than creating a nil-id record.
                // For fresh competitions where all assignments are new this path is
                // never hit — all assignments build cleanly and upsert_all succeeds.
                for (const [activityId, newAssignment] of personAssignmentMap.entries()) {
                    const existing = existingByActivityId.get(activityId);
                    if (existing && existing.assignmentCode !== newAssignment.assignmentCode) {
                        // Conflicting: preserve existing assignment to avoid nil-id bug.
                        finalAssignments.push(existing);
                        conflictWarnings.push(
                            `Person ${person.wcaUserId} (registrantId ${person.registrantId}): ` +
                            `activityId ${activityId} already has '${existing.assignmentCode}' in WCA — ` +
                            `keeping existing assignment (cannot change to '${newAssignment.assignmentCode}')`
                        );
                    } else {
                        // No conflict: add our new assignment.
                        // If existing has the SAME code, wcif_equal? will match in WCA
                        // and update in-place (real id, no nil-id problem).
                        // If no existing assignment, WCA builds a new one (id: nil) — this
                        // works correctly when there are no real-id records in the same batch.
                        finalAssignments.push(newAssignment);
                    }
                }

                // Skip persons whose assignments are completely unchanged.
                const assignmentsChanged =
                    finalAssignments.length !== baseAssignments.length ||
                    finalAssignments.some(fa =>
                        !baseAssignments.some(ba =>
                            ba.activityId === fa.activityId &&
                            ba.assignmentCode === fa.assignmentCode &&
                            ba.stationNumber === fa.stationNumber
                        )
                    );

                if (!assignmentsChanged) {
                    console.log(`[writeToWCIF] Person ${person.wcaUserId} (registrantId ${person.registrantId}): all assignments unchanged, skipping from payload.`);
                    return null;
                }

                return {
                    wcaUserId: Number(person.wcaUserId),
                    registrantId: person.registrantId,
                    assignments: finalAssignments
                };
            })
            .filter(p => p !== null);

        if (conflictWarnings.length > 0) {
            console.warn('[writeToWCIF] Skipped conflicting assignments (existing non-competitor roles preserved):');
            for (const w of conflictWarnings) {
                console.warn('[writeToWCIF]  -', w);
            }
        }

        if (updatedPersons.length === 0) {
            console.log('[writeToWCIF] All persons\' assignments are already up-to-date in WCA — no PATCH needed.');
            const deleted = await GroupSelectionModel.deleteAllBelowThreshold(db, SYNTHETIC_ID_THRESHOLD);
            console.log(`[writeToWCIF] Cleared ${deleted} group selection(s) (already up-to-date).`);
            return {
                success: true,
                message: 'All assignments are already up-to-date in WCA (no changes to write)',
                groupsWritten: 0
            };
        }

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

            const deleted = await GroupSelectionModel.deleteAllBelowThreshold(db, SYNTHETIC_ID_THRESHOLD);
            console.log(`[writeToWCIF] Cleared ${deleted} group selection(s) after successful write.`);

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
