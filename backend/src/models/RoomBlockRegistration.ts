import { Pool } from 'mysql2/promise';

export interface RoomBlockRegistrationData {
    wcaUserId: number;
    email: string;
    roomBlockId: number;
}

export interface RoomBlockRegistrationRow extends RoomBlockRegistrationData {
    id: number;
    registeredAt: Date;
}

export interface RoomBlockRegistrationWithDetails extends RoomBlockRegistrationRow {
    competitorName: string;
    wcaId: string | null;
    roomBlockName: string;
    maxCapacity: number;
    hasSignups: boolean;
    status: 'registered' | 'waitlist';
    waitlistPosition: number;
}

class RoomBlockRegistrationModel {
    static async findByWcaUserId(db: Pool, wcaUserId: number): Promise<RoomBlockRegistrationWithDetails | null> {
        const [rows] = await db.query<any[]>(
            `SELECT rbr.id, rbr.wca_user_id as wcaUserId, rbr.email, rbr.room_block_id as roomBlockId, rbr.registered_at as registeredAt,
                    ot.name as competitorName, ot.wca_id as wcaId,
                    rb.name as roomBlockName, rb.max_capacity as maxCapacity, rb.has_signups as hasSignups
             FROM room_block_registrations rbr
             JOIN oauth_tokens ot ON rbr.wca_user_id = ot.wca_user_id
             JOIN room_blocks rb ON rbr.room_block_id = rb.id
             WHERE rbr.wca_user_id = ?`,
            [wcaUserId]
        );
        if (rows.length === 0) return null;

        const reg = rows[0];
        // Calculate status and waitlist position
        const allRegsInBlock = await this.getAllForBlock(db, reg.roomBlockId);
        const index = allRegsInBlock.findIndex(r => r.wcaUserId === wcaUserId);

        let status: 'registered' | 'waitlist' = 'registered';
        let waitlistPosition = 0;

        if (reg.hasSignups) {
            if (index >= reg.maxCapacity) {
                status = 'waitlist';
                waitlistPosition = index - reg.maxCapacity + 1;
            }
        }

        return {
            ...reg,
            hasSignups: !!reg.hasSignups,
            status,
            waitlistPosition
        };
    }

    static async getAllForBlock(db: Pool, roomBlockId: number): Promise<RoomBlockRegistrationRow[]> {
        const [rows] = await db.query<any[]>(
            `SELECT id, wca_user_id as wcaUserId, email, room_block_id as roomBlockId, registered_at as registeredAt
             FROM room_block_registrations
             WHERE room_block_id = ?
             ORDER BY registered_at ASC`,
            [roomBlockId]
        );
        return rows;
    }

    static async register(db: Pool, data: RoomBlockRegistrationData): Promise<void> {
        // Use REPLACE or INSERT ON DUPLICATE KEY UPDATE to allow switching
        await db.query(
            `INSERT INTO room_block_registrations (wca_user_id, email, room_block_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE email = VALUES(email), room_block_id = VALUES(room_block_id), registered_at = CURRENT_TIMESTAMP`,
            [data.wcaUserId, data.email, data.roomBlockId]
        );
    }

    static async unregister(db: Pool, wcaUserId: number): Promise<void> {
        await db.query(
            'DELETE FROM room_block_registrations WHERE wca_user_id = ?',
            [wcaUserId]
        );
    }

    static async getAllWithUserDetails(db: Pool): Promise<RoomBlockRegistrationWithDetails[]> {
        const [rows] = await db.query<any[]>(
            `SELECT rbr.id, rbr.wca_user_id as wcaUserId, rbr.email, rbr.room_block_id as roomBlockId, rbr.registered_at as registeredAt,
                    ot.name as competitorName, ot.wca_id as wcaId,
                    rb.name as roomBlockName, rb.max_capacity as maxCapacity, rb.has_signups as hasSignups
             FROM room_block_registrations rbr
             JOIN oauth_tokens ot ON rbr.wca_user_id = ot.wca_user_id
             JOIN room_blocks rb ON rbr.room_block_id = rb.id
             ORDER BY rbr.room_block_id, rbr.registered_at ASC`
        );

        // Group by roomBlockId to calculate statuses
        const groups = new Map<number, typeof rows>();
        rows.forEach(r => {
            if (!groups.has(r.roomBlockId)) {
                groups.set(r.roomBlockId, []);
            }
            groups.get(r.roomBlockId)!.push(r);
        });

        const result: RoomBlockRegistrationWithDetails[] = [];
        groups.forEach((groupRows) => {
            groupRows.forEach((r, index) => {
                let status: 'registered' | 'waitlist' = 'registered';
                let waitlistPosition = 0;

                if (r.hasSignups) {
                    if (index >= r.maxCapacity) {
                        status = 'waitlist';
                        waitlistPosition = index - r.maxCapacity + 1;
                    }
                }

                result.push({
                    ...r,
                    hasSignups: !!r.hasSignups,
                    status,
                    waitlistPosition
                });
            });
        });

        return result;
    }
}

export default RoomBlockRegistrationModel;
