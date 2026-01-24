import express, { Request, Response } from 'express';
import { isAuthenticated, isDelegate } from '../middleware/auth';
import AdminService from '../services/AdminService';
import AuthService from '../services/AuthService';

const router = express.Router();

router.get('/check', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = req.session.wcaUserId!;
        
        const result = await AuthService.verifyDelegate(db, wcaUserId);
        res.json(result);
        
    } catch (error) {
        console.error('Check delegate error:', error);
        res.status(500).json({ error: 'Failed to check delegate status' });
    }
});

router.get('/pending-groups', isAuthenticated, isDelegate, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const result = await AdminService.getPendingGroups(db, req.accessToken);
        res.json(result);
        
    } catch (error) {
        console.error('Get pending groups error:', error);
        res.status(500).json({ error: 'Failed to fetch pending groups' });
    }
});

router.post('/write-wcif', isAuthenticated, isDelegate, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const delegateInfo = {
            wcaUserId: req.session.wcaUserId!,
            name: req.session.name!,
            accessToken: req.accessToken!
        };
        
        const result = await AdminService.writeToWCIF(db, delegateInfo);
        res.json(result);
        
    } catch (error: any) {
        console.error('Write WCIF error:', error.response?.data || error.message);
        
        if (error.message.includes('No group selections')) {
            return res.status(400).json({ error: error.message });
        }
        
        res.status(500).json({ 
            error: 'Failed to write groups to WCIF',
            details: error.response?.data || error.message
        });
    }
});

router.get('/write-history', isAuthenticated, isDelegate, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const history = await AdminService.getWriteHistory(db);
        res.json({ history });
        
    } catch (error) {
        console.error('Get write history error:', error);
        res.status(500).json({ error: 'Failed to fetch write history' });
    }
});

export default router;
