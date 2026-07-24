import { Pool } from 'mysql2/promise';

export interface PanelSubmissionData {
    wcaUserId: number;
    email: string;
    panelName: string;
    description: string;
}

export interface PanelSubmissionRow extends PanelSubmissionData {
    id: number;
    submittedAt: Date;
}

export interface PanelSubmissionWithDetails extends PanelSubmissionRow {
    competitorName: string;
    wcaId: string | null;
}

class PanelSubmissionModel {
    static async findByWcaUserId(db: Pool, wcaUserId: number): Promise<PanelSubmissionRow[]> {
        const [rows] = await db.query<any[]>(
            `SELECT id, wca_user_id as wcaUserId, email, panel_name as panelName, description, submitted_at as submittedAt
             FROM panel_submissions
             WHERE wca_user_id = ?
             ORDER BY submitted_at DESC`,
            [wcaUserId]
        );
        return rows;
    }

    static async create(db: Pool, data: PanelSubmissionData): Promise<number> {
        const [result]: any = await db.query(
            `INSERT INTO panel_submissions (wca_user_id, email, panel_name, description)
             VALUES (?, ?, ?, ?)`,
            [data.wcaUserId, data.email, data.panelName, data.description]
        );
        return result.insertId;
    }

    static async delete(db: Pool, id: number, wcaUserId?: number): Promise<void> {
        if (wcaUserId !== undefined) {
            await db.query(
                'DELETE FROM panel_submissions WHERE id = ? AND wca_user_id = ?',
                [id, wcaUserId]
            );
        } else {
            await db.query(
                'DELETE FROM panel_submissions WHERE id = ?',
                [id]
            );
        }
    }

    static async getAllWithUserDetails(db: Pool): Promise<PanelSubmissionWithDetails[]> {
        const [rows] = await db.query<any[]>(
            `SELECT ps.id, ps.wca_user_id as wcaUserId, ps.email, ps.panel_name as panelName, ps.description, ps.submitted_at as submittedAt,
                    ot.name as competitorName, ot.wca_id as wcaId
             FROM panel_submissions ps
             JOIN oauth_tokens ot ON ps.wca_user_id = ot.wca_user_id
             ORDER BY ps.submitted_at DESC`
        );
        return rows;
    }
}

export default PanelSubmissionModel;
