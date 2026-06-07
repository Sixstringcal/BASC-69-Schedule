import { Pool } from 'mysql2/promise';

export interface UnofficialRegistrationData {
    wcaUserId: string;
    registrantId: number | null;
    eventId: string;
    eventName: string;
}

export interface UnofficialRegistrationRow extends UnofficialRegistrationData {
    id: number;
    registeredAt: Date;
}

export interface UnofficialRegistrationWithCompetitor extends UnofficialRegistrationRow {
    competitorName: string;
    wcaId: string;
}

class UnofficialRegistrationModel {
    static async findByWcaUserId(db: Pool, wcaUserId: string): Promise<UnofficialRegistrationRow[]> {
        const [rows] = await db.query<any[]>(
            `SELECT id, wca_user_id as wcaUserId, registrant_id as registrantId,
                    event_id as eventId, event_name as eventName, registered_at as registeredAt
             FROM unofficial_registrations WHERE wca_user_id = ?`,
            [wcaUserId]
        );
        return rows;
    }

    static async createOrIgnore(db: Pool, data: UnofficialRegistrationData): Promise<void> {
        await db.query(
            `INSERT IGNORE INTO unofficial_registrations (wca_user_id, registrant_id, event_id, event_name)
             VALUES (?, ?, ?, ?)`,
            [data.wcaUserId, data.registrantId, data.eventId, data.eventName]
        );
    }

    static async deleteByWcaUserIdAndEvent(db: Pool, wcaUserId: string, eventId: string): Promise<void> {
        await db.query(
            'DELETE FROM unofficial_registrations WHERE wca_user_id = ? AND event_id = ?',
            [wcaUserId, eventId]
        );
    }

    static async getAllWithCompetitors(db: Pool): Promise<UnofficialRegistrationWithCompetitor[]> {
        const [rows] = await db.query<any[]>(
            `SELECT ur.id, ur.wca_user_id as wcaUserId, ur.registrant_id as registrantId,
                    ur.event_id as eventId, ur.event_name as eventName, ur.registered_at as registeredAt,
                    ot.name as competitorName, ot.wca_id as wcaId
             FROM unofficial_registrations ur
             JOIN oauth_tokens ot ON ur.wca_user_id = ot.wca_user_id
             ORDER BY ur.event_id, ot.name`
        );
        return rows;
    }

    static async getAll(db: Pool): Promise<UnofficialRegistrationRow[]> {
        const [rows] = await db.query<any[]>(
            `SELECT id, wca_user_id as wcaUserId, registrant_id as registrantId,
                    event_id as eventId, event_name as eventName, registered_at as registeredAt
             FROM unofficial_registrations`
        );
        return rows;
    }

    static async deleteAll(db: Pool): Promise<number> {
        const [result]: any = await db.execute('DELETE FROM unofficial_registrations');
        return result.affectedRows;
    }
}

export default UnofficialRegistrationModel;
