import { Pool } from 'mysql2/promise';

export interface RoomBlockData {
    name: string;
    blurb: string | null;
    hasSignups: boolean;
    maxCapacity: number;
}

export interface RoomBlockRow extends RoomBlockData {
    id: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface RoomBlockStats extends RoomBlockRow {
    registrationCount: number;
    waitlistCount: number;
}

class RoomBlockModel {
    static async getAll(db: Pool): Promise<RoomBlockRow[]> {
        const [rows] = await db.query<any[]>(
            `SELECT id, name, blurb, has_signups as hasSignups, max_capacity as maxCapacity,
                    created_at as createdAt, updated_at as updatedAt
             FROM room_blocks
             ORDER BY id ASC`
        );
        return rows.map(row => ({
            ...row,
            hasSignups: !!row.hasSignups
        }));
    }

    static async getById(db: Pool, id: number): Promise<RoomBlockRow | null> {
        const [rows] = await db.query<any[]>(
            `SELECT id, name, blurb, has_signups as hasSignups, max_capacity as maxCapacity,
                    created_at as createdAt, updated_at as updatedAt
             FROM room_blocks
             WHERE id = ?`,
            [id]
        );
        if (rows.length === 0) return null;
        return {
            ...rows[0],
            hasSignups: !!rows[0].hasSignups
        };
    }

    static async getByName(db: Pool, name: string): Promise<RoomBlockRow | null> {
        const [rows] = await db.query<any[]>(
            `SELECT id, name, blurb, has_signups as hasSignups, max_capacity as maxCapacity,
                    created_at as createdAt, updated_at as updatedAt
             FROM room_blocks
             WHERE LOWER(name) = LOWER(?)`,
            [name]
        );
        if (rows.length === 0) return null;
        return {
            ...rows[0],
            hasSignups: !!rows[0].hasSignups
        };
    }

    static async createOrUpdate(db: Pool, data: RoomBlockData & { id?: number }): Promise<number> {
        if (data.id) {
            await db.query(
                `UPDATE room_blocks
                 SET name = ?, blurb = ?, has_signups = ?, max_capacity = ?
                 WHERE id = ?`,
                [data.name, data.blurb, data.hasSignups ? 1 : 0, data.maxCapacity, data.id]
            );
            return data.id;
        } else {
            const [result]: any = await db.query(
                `INSERT INTO room_blocks (name, blurb, has_signups, max_capacity)
                 VALUES (?, ?, ?, ?)`,
                [data.name, data.blurb, data.hasSignups ? 1 : 0, data.maxCapacity]
            );
            return result.insertId;
        }
    }

    static async delete(db: Pool, id: number): Promise<void> {
        await db.query('DELETE FROM room_blocks WHERE id = ?', [id]);
    }

    static async getStats(db: Pool): Promise<RoomBlockStats[]> {
        const blocks = await this.getAll(db);
        const [regs] = await db.query<any[]>(
            `SELECT room_block_id as roomBlockId, COUNT(*) as totalSignups
             FROM room_block_registrations
             GROUP BY room_block_id`
        );

        const countsMap = new Map<number, number>();
        regs.forEach(r => countsMap.set(r.roomBlockId, r.totalSignups));

        return blocks.map(block => {
            const totalSignups = countsMap.get(block.id) || 0;
            let registrationCount = totalSignups;
            let waitlistCount = 0;

            if (block.hasSignups) {
                registrationCount = Math.min(totalSignups, block.maxCapacity);
                waitlistCount = Math.max(0, totalSignups - block.maxCapacity);
            }

            return {
                ...block,
                registrationCount,
                waitlistCount
            };
        });
    }
}

export default RoomBlockModel;
