import express, { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import GroupService from '../services/GroupService';

const router = express.Router();

router.get('/', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = req.session.wcaUserId!;
        
        const result = await GroupService.getAvailableGroups(db, wcaUserId);
        res.json(result);
        
    } catch (error: any) {
        console.error('Get groups error:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

router.post('/select', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = req.session.wcaUserId!;
        const { activityId, groupNumber } = req.body;
        
        if (!activityId || !groupNumber) {
            return res.status(400).json({ error: 'Missing activityId or groupNumber' });
        }
        
        const result = await GroupService.selectGroup(db, wcaUserId, activityId, groupNumber);
        res.json(result);
        
    } catch (error: any) {
        console.error('Select group error:', error);
        
        if (error.message.includes('not registered') || error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        
        if (error.message.includes('full') || error.message.includes('not have group selection')) {
            return res.status(400).json({ error: error.message });
        }
        
        res.status(500).json({ error: 'Failed to select group' });
    }
});

router.delete('/select', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = req.session.wcaUserId!;
        const { activityId } = req.body;

        if (!activityId) {
            return res.status(400).json({ error: 'Missing activityId' });
        }

        const result = await GroupService.deselectGroup(db, wcaUserId, activityId);
        res.json(result);

    } catch (error: any) {
        console.error('Deselect group error:', error);
        res.status(500).json({ error: 'Failed to deselect group' });
    }
});

router.get('/:activityId', async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const { activityId } = req.params;
        
        const result = await GroupService.getActivityGroups(db, parseInt(activityId));
        res.json(result);
        
    } catch (error: any) {
        console.error('Get activity groups error:', error);
        
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        
        res.status(500).json({ error: 'Failed to fetch activity groups' });
    }
});

export default router;
