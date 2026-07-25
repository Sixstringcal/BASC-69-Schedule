import { Pool } from 'mysql2/promise';

export interface GroupSelectionData {
    registrantId: number;
    wcaUserId: string;
    activityId: number;
    activityName: string;
    groupNumber: number;
}

export interface GroupSelectionRow {
    registrantId: number;
    wcaUserId: string;
    activityId: number;
    activityName: string;
    groupNumber: number;
    accepted: boolean;
    selectedAt: Date;
}

export interface GroupSelectionWithCompetitor extends GroupSelectionRow {
    competitorName: string;
    wcaId: string;
}

class GroupSelectionModel {
    static async findByWcaUserId(db: Pool, wcaUserId: string): Promise<GroupSelectionRow[]> {
        const [rows] = await db.query<any[]>(
            'SELECT registrant_id as registrantId, wca_user_id as wcaUserId, activity_id as activityId, activity_name as activityName, group_number as groupNumber, accepted, selected_at as selectedAt FROM group_selections WHERE wca_user_id = ?',
            [wcaUserId]
        );
        return rows;
    }

    static async findByRegistrantId(db: Pool, registrantId: number): Promise<GroupSelectionRow[]> {
        const [rows] = await db.query<any[]>(
            'SELECT registrant_id as registrantId, wca_user_id as wcaUserId, activity_id as activityId, activity_name as activityName, group_number as groupNumber, accepted, selected_at as selectedAt FROM group_selections WHERE registrant_id = ?',
            [registrantId]
        );
        return rows;
    }
    
    static async findByActivity(db: Pool, activityId: number): Promise<GroupSelectionRow[]> {
        const [rows] = await db.query<any[]>(
            'SELECT registrant_id as registrantId, wca_user_id as wcaUserId, activity_id as activityId, activity_name as activityName, group_number as groupNumber, accepted, selected_at as selectedAt FROM group_selections WHERE activity_id = ?',
            [activityId]
        );
        return rows;
    }
    
    static async countByActivityAndGroup(db: Pool, activityId: number, groupNumber: number): Promise<number> {
        const [rows] = await db.query<any[]>(
            'SELECT COUNT(*) as count FROM group_selections WHERE activity_id = ? AND group_number = ?',
            [activityId, groupNumber]
        );
        return rows[0].count;
    }
    
    static async createOrUpdate(db: Pool, data: GroupSelectionData): Promise<void> {
        await db.query(
            `INSERT INTO group_selections (registrant_id, wca_user_id, activity_id, activity_name, group_number)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE group_number = VALUES(group_number), registrant_id = VALUES(registrant_id), accepted = 0, selected_at = CURRENT_TIMESTAMP`,
            [data.registrantId, data.wcaUserId, data.activityId, data.activityName, data.groupNumber]
        );
    }
    
    static async getAllWithCompetitors(db: Pool): Promise<GroupSelectionWithCompetitor[]> {
        const [rows] = await db.query<any[]>(
            `SELECT gs.registrant_id as registrantId, gs.wca_user_id as wcaUserId, gs.activity_id as activityId,
                    gs.activity_name as activityName, gs.group_number as groupNumber, gs.accepted, gs.selected_at as selectedAt,
                    ot.name as competitorName, ot.wca_id as wcaId
             FROM group_selections gs
             JOIN oauth_tokens ot ON gs.wca_user_id = ot.wca_user_id
             WHERE gs.accepted = 0
             ORDER BY gs.activity_id, gs.group_number, gs.selected_at`
        );
        return rows;
    }
    
    static async getAll(db: Pool): Promise<GroupSelectionRow[]> {
        const [rows] = await db.query<any[]>(
            'SELECT registrant_id as registrantId, wca_user_id as wcaUserId, activity_id as activityId, activity_name as activityName, group_number as groupNumber, accepted, selected_at as selectedAt FROM group_selections'
        );
        return rows;
    }

    static async deleteByWcaUserIdAndActivity(db: Pool, wcaUserId: string, activityId: number): Promise<number> {
        const [result]: any = await db.execute(
            'DELETE FROM group_selections WHERE wca_user_id = ? AND activity_id = ? AND accepted = 0',
            [wcaUserId, activityId]
        );
        return result.affectedRows;
    }

    static async isAccepted(db: Pool, wcaUserId: string, activityId: number): Promise<boolean> {
        const [rows] = await db.query<any[]>(
            'SELECT accepted FROM group_selections WHERE wca_user_id = ? AND activity_id = ?',
            [wcaUserId, activityId]
        );
        return rows.length > 0 && rows[0].accepted === 1;
    }

    static async acceptAllAboveThreshold(db: Pool, threshold: number): Promise<number> {
        const [result]: any = await db.execute(
            'UPDATE group_selections SET accepted = 1 WHERE activity_id >= ?',
            [threshold]
        );
        return result.affectedRows;
    }

    static async deleteSiblingSelections(db: Pool, wcaUserId: string, siblingActivityIds: number[]): Promise<number> {
        if (siblingActivityIds.length === 0) return 0;
        const placeholders = siblingActivityIds.map(() => '?').join(', ');
        const [result]: any = await db.execute(
            `DELETE FROM group_selections WHERE wca_user_id = ? AND activity_id IN (${placeholders})`,
            [wcaUserId, ...siblingActivityIds]
        );
        return result.affectedRows;
    }

    static async deleteAll(db: Pool): Promise<number> {
        const [result]: any = await db.execute('DELETE FROM group_selections');
        return result.affectedRows;
    }

    static async deleteAllBelowThreshold(db: Pool, threshold: number): Promise<number> {
        const [result]: any = await db.execute(
            'DELETE FROM group_selections WHERE activity_id < ?',
            [threshold]
        );
        return result.affectedRows;
    }
}

export default GroupSelectionModel;
