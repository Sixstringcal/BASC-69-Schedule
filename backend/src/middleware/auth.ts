import { Request, Response, NextFunction } from 'express';
import AuthService from '../services/AuthService';
import SessionTokenModel from '../models/SessionToken';

export async function isAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
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
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    
    // Store wcaUserId in request for later use
    (req as any).wcaUserId = wcaUserId;
    req.session.wcaUserId = wcaUserId;
    next();
}

export async function isDelegate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const db = req.app.locals.db;
        const wcaUserId = (req as any).wcaUserId || req.session.wcaUserId;
        
        if (!wcaUserId) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        
        const result = await AuthService.verifyDelegate(db, wcaUserId);
        
        if (!result.isDelegate) {
            res.status(403).json({ error: 'Not authorized. Must be a delegate.' });
            return;
        }
        
        (req as any).accessToken = result.accessToken;
        next();
    } catch (error) {
        console.error('Delegate check error:', error);
        res.status(500).json({ error: 'Failed to verify delegate status' });
    }
}
