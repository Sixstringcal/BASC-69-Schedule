import { Pool, RowDataPacket } from 'mysql2/promise';
import crypto from 'crypto';

class SessionTokenModel {
    static async createToken(db: Pool, wcaUserId: string): Promise<string> {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        await db.execute(
            'INSERT INTO session_tokens (token, wca_user_id, expires_at) VALUES (?, ?, ?)',
            [token, wcaUserId, expiresAt]
        );
        
        return token;
    }
    
    static async findByToken(db: Pool, token: string): Promise<string | null> {
        const [rows] = await db.execute<RowDataPacket[]>(
            'SELECT wca_user_id FROM session_tokens WHERE token = ? AND expires_at > NOW()',
            [token]
        );
        
        if (rows.length === 0) return null;
        return rows[0].wca_user_id.toString();
    }
    
    static async deleteToken(db: Pool, token: string): Promise<void> {
        await db.execute('DELETE FROM session_tokens WHERE token = ?', [token]);
    }
    
    static async cleanupExpired(db: Pool): Promise<void> {
        await db.execute('DELETE FROM session_tokens WHERE expires_at < NOW()');
    }
}

export default SessionTokenModel;
