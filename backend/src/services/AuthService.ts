import { Pool } from 'mysql2/promise';
import UserModel, { UserData, User } from '../models/User';
import { getWCIF, getPersonByWcaUserId } from '../utils/wcif';

interface OAuthUser {
    id: string;
    wca_id: string;
    name: string;
    email?: string;
    accessToken: string;
    refreshToken?: string;
}

interface DelegateVerification {
    isDelegate: boolean;
    accessToken?: string;
    wcaId?: string;
    name?: string;
}

class AuthService {
    static async handleOAuthCallback(db: Pool, oauthUser: OAuthUser): Promise<UserData> {
        const userData: UserData = {
            wcaUserId: oauthUser.id,
            wcaId: oauthUser.wca_id,
            name: oauthUser.name,
            email: oauthUser.email,
            accessToken: oauthUser.accessToken,
            refreshToken: oauthUser.refreshToken
        };
        
        await UserModel.createOrUpdate(db, userData);
        return userData;
    }

    static async getCurrentUser(db: Pool, wcaUserId: string): Promise<User | null> {
        return await UserModel.findByWcaUserId(db, wcaUserId);
    }

    static async verifyDelegate(db: Pool, wcaUserId: string): Promise<DelegateVerification> {
        const user = await UserModel.findByWcaUserId(db, wcaUserId);
        
        if (!user) {
            return { isDelegate: false };
        }

        try {
            const wcif = await getWCIF(user.accessToken);
            
            const person = await getPersonByWcaUserId(wcif, wcaUserId, db);
            if (!person || !person.roles || !person.roles.includes('delegate')) {
                return { isDelegate: false };
            }

            return { 
                isDelegate: true,
                accessToken: user.accessToken,
                wcaId: user.wcaId,
                name: user.name
            };
        } catch (error) {
            console.error('Error verifying delegate:', error);
            return { isDelegate: false };
        }
    }
}

export default AuthService;
