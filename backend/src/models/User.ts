import { Pool } from 'mysql2/promise';

export interface UserData {
    wcaUserId: string;
    wcaId: string;
    name: string;
    email?: string;
    accessToken: string;
    refreshToken?: string;
}

export interface User {
    wcaUserId: string;
    wcaId: string;
    name: string;
    email?: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
}

class UserModel {
    static async findByWcaUserId(db: Pool, wcaUserId: string): Promise<User | null> {
        const [rows] = await db.query<any[]>(
            'SELECT wca_user_id as wcaUserId, wca_id as wcaId, name, email, access_token as accessToken, refresh_token as refreshToken, expires_at as expiresAt FROM oauth_tokens WHERE wca_user_id = ?',
            [wcaUserId]
        );
        
        return rows.length > 0 ? rows[0] : null;
    }
    
    static async createOrUpdate(db: Pool, userData: UserData): Promise<void> {
        await db.query(
            `INSERT INTO oauth_tokens (wca_user_id, wca_id, name, email, access_token, refresh_token, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))
             ON DUPLICATE KEY UPDATE 
             access_token = VALUES(access_token),
             refresh_token = VALUES(refresh_token),
             expires_at = VALUES(expires_at),
             name = VALUES(name),
             email = VALUES(email),
             wca_id = VALUES(wca_id)`,
            [userData.wcaUserId, userData.wcaId, userData.name, userData.email || null, userData.accessToken, userData.refreshToken || null]
        );
    }
}

export default UserModel;
