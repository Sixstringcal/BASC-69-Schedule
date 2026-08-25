import express, { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import UnofficialEventService from '../services/UnofficialEventService';

const router = express.Router();

router.get('/', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = req.session.wcaUserId!;
        const result = await UnofficialEventService.getForUser(db, wcaUserId);
        res.json(result);
    } catch (error: any) {
        console.error('Get unofficial events error:', error);
        res.status(500).json({ error: 'Failed to fetch unofficial events' });
    }
});

import { FEATURE_FLAGS } from '../config/features';

router.post('/register', isAuthenticated, async (req: Request, res: Response) => {
    if (!FEATURE_FLAGS.IS_UNOFFICIAL_REGISTRATION_OPEN) {
        return res.status(403).json({
            error: `Competition is coming up soon! You cannot register for unofficial events anymore. If you have a conflict, please contact ${FEATURE_FLAGS.CONTACT_NAME} at ${FEATURE_FLAGS.CONTACT_EMAIL}`
        });
    }

    try {
        const db = req.app.locals.db;
        const wcaUserId = req.session.wcaUserId!;
        const { eventId } = req.body;
        if (!eventId) {
            return res.status(400).json({ error: 'Missing eventId' });
        }
        await UnofficialEventService.register(db, wcaUserId, eventId);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Register unofficial event error:', error);
        if (error.message.includes('Unknown unofficial event')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to register for event' });
    }
});

router.delete('/register', isAuthenticated, async (req: Request, res: Response) => {
    if (!FEATURE_FLAGS.IS_UNOFFICIAL_REGISTRATION_OPEN) {
        return res.status(403).json({
            error: `Competition is coming up soon! You cannot unregister from unofficial events anymore. If you have a conflict, please contact ${FEATURE_FLAGS.CONTACT_NAME} at ${FEATURE_FLAGS.CONTACT_EMAIL}`
        });
    }

    try {
        const db = req.app.locals.db;
        const wcaUserId = req.session.wcaUserId!;
        const { eventId } = req.body;
        if (!eventId) {
            return res.status(400).json({ error: 'Missing eventId' });
        }
        await UnofficialEventService.unregister(db, wcaUserId, eventId);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Unregister unofficial event error:', error);
        res.status(500).json({ error: 'Failed to unregister from event' });
    }
});

export default router;
