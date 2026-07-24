import { Pool } from 'mysql2/promise';

export interface TShirtSelectionData {
    wcaUserId: number;
    tshirtSize: string;
}

export interface TShirtSelectionRow extends TShirtSelectionData {
    id: number;
    selectedAt: Date;
}

export interface TShirtSizeCount {
    tshirtSize: string;
    count: number;
}

export interface TShirtSelectionWithDetails extends TShirtSelectionRow {
    competitorName: string;
    wcaId: string | null;
}

class TShirtSelectionModel {
    static async findByWcaUserId(db: Pool, wcaUserId: number): Promise<TShirtSelectionRow | null> {
        const [rows] = await db.query<any[]>(
            `SELECT id, wca_user_id as wcaUserId, tshirt_size as tshirtSize, selected_at as selectedAt
             FROM tshirt_selections
             WHERE wca_user_id = ?`,
            [wcaUserId]
        );
        if (rows.length === 0) return null;
        return rows[0];
    }

    static async createOrUpdate(db: Pool, data: TShirtSelectionData): Promise<void> {
        await db.query(
            `INSERT INTO tshirt_selections (wca_user_id, tshirt_size)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE tshirt_size = VALUES(tshirt_size)`,
            [data.wcaUserId, data.tshirtSize]
        );
    }

    static async getSummary(db: Pool): Promise<TShirtSizeCount[]> {
        const [rows] = await db.query<any[]>(
            `SELECT tshirt_size as tshirtSize, COUNT(*) as count
             FROM tshirt_selections
             GROUP BY tshirt_size
             ORDER BY count DESC`
        );
        return rows;
    }

    static async getAllWithUserDetails(db: Pool): Promise<TShirtSelectionWithDetails[]> {
        const [rows] = await db.query<any[]>(
            `SELECT ts.id, ts.wca_user_id as wcaUserId, ts.tshirt_size as tshirtSize, ts.selected_at as selectedAt,
                    ot.name as competitorName, ot.wca_id as wcaId
             FROM tshirt_selections ts
             JOIN oauth_tokens ot ON ts.wca_user_id = ot.wca_user_id
             ORDER BY ts.selected_at DESC`
        );
        return rows;
    }
}

export default TShirtSelectionModel;
