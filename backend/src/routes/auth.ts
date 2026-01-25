import express, { Request, Response } from 'express';
import passport from '../config/passport';
import AuthService from '../services/AuthService';
import SessionTokenModel from '../models/SessionToken';

const router = express.Router();

router.get('/wca', passport.authenticate('wca'));

router.get('/wca/callback', 
    passport.authenticate('wca', { failureRedirect: '/login' }),
    async (req: Request, res: Response) => {
        try {
            const db = req.app.locals.db;
            const oauthUser = req.user as any;
            
            const user = await AuthService.handleOAuthCallback(db, oauthUser);
            
            // Generate session token instead of using cookies
            const token = await SessionTokenModel.createToken(db, user.wcaUserId);
            
            console.log('Token generated for user:', user.wcaUserId);
            
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
            res.redirect(`${frontendUrl}?token=${token}&login=success`);
        } catch (error) {
            console.error('OAuth callback error:', error);
            res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8000'}?login=error`);
        }
    }
);

router.get('/me', async (req: Request, res: Response) => {
    // Check for Authorization header first (token-based auth)
    const authHeader = req.headers.authorization;
    let wcaUserId: string | null = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const db = req.app.locals.db;
        wcaUserId = await SessionTokenModel.findByToken(db, token);
    } else if (req.session.wcaUserId) {
        // Fallback to session-based auth
        wcaUserId = req.session.wcaUserId;
    }
    
    if (!wcaUserId) {
        return res.status(401).json({ authenticated: false });
    }
    
    try {
        const db = req.app.locals.db;
        const user = await AuthService.getCurrentUser(db, wcaUserId);
        
        if (!user) {
            return res.status(401).json({ authenticated: false });
        }
        
        res.json({
            authenticated: true,
            user: {
                wcaUserId: user.wcaUserId,
                wcaId: user.wcaId,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

router.post('/logout', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const db = req.app.locals.db;
        await SessionTokenModel.deleteToken(db, token);
    }
    
    if (req.session) {
        req.session.destroy((err: any) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to logout' });
            }
            res.json({ success: true });
        });
    } else {
        res.json({ success: true });
    }
});

export default router;
