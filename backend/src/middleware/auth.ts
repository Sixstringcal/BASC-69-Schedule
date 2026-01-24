import { Request, Response, NextFunction } from 'express';
import AuthService from '../services/AuthService';

export function isAuthenticated(req: Request, res: Response, next: NextFunction): void {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Not authenticated' });
}

export async function isDelegate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const db = req.app.locals.db;
        const wcaUserId = req.session.wcaUserId;
        
        if (!wcaUserId) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        
        const result = await AuthService.verifyDelegate(db, wcaUserId);
        
        if (!result.isDelegate) {
            res.status(403).json({ error: 'Not authorized. Must be a delegate.' });
            return;
        }
        
        req.accessToken = result.accessToken;
        next();
    } catch (error) {
        console.error('Delegate check error:', error);
        res.status(500).json({ error: 'Failed to verify delegate status' });
    }
}
