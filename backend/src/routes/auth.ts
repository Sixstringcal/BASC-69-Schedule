import express, { Request, Response } from 'express';
import passport from '../config/passport';
import AuthService from '../services/AuthService';

const router = express.Router();

router.get('/wca', passport.authenticate('wca'));

router.get('/wca/callback', 
    passport.authenticate('wca', { failureRedirect: '/login' }),
    async (req: Request, res: Response) => {
        try {
            const db = req.app.locals.db;
            const oauthUser = req.user as any;
            
            const user = await AuthService.handleOAuthCallback(db, oauthUser);
            
            req.session.wcaUserId = user.wcaUserId;
            req.session.wcaId = user.wcaId;
            req.session.name = user.name;
            
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
            res.redirect(`${frontendUrl}?login=success`);
        } catch (error) {
            console.error('OAuth callback error:', error);
            res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8000'}?login=error`);
        }
    }
);

router.get('/me', async (req: Request, res: Response) => {
    if (!req.session.wcaUserId) {
        return res.status(401).json({ authenticated: false });
    }
    
    try {
        const db = req.app.locals.db;
        const user = await AuthService.getCurrentUser(db, req.session.wcaUserId);
        
        if (!user) {
            return res.status(401).json({ authenticated: false });
        }
        
        res.json({
            authenticated: true,
            user: {
                id: user.wcaUserId,
                wcaId: user.wcaId,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

router.post('/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.json({ success: true });
    });
});

export default router;
