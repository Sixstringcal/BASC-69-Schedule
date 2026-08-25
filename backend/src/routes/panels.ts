import express, { Request, Response } from 'express';
import { isAuthenticated, isDelegate } from '../middleware/auth';
import PanelSubmissionModel from '../models/PanelSubmission';

const router = express.Router();

router.get('/my-submissions', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = parseInt((req as any).wcaUserId || req.session.wcaUserId);
        
        const submissions = await PanelSubmissionModel.findByWcaUserId(db, wcaUserId);
        res.json({ submissions });
    } catch (error: any) {
        console.error('Get my panels error:', error);
        res.status(500).json({ error: 'Failed to fetch your panels' });
    }
});

import { FEATURE_FLAGS } from '../config/features';

router.post('/submit', isAuthenticated, async (req: Request, res: Response) => {
    if (!FEATURE_FLAGS.IS_PANELS_REGISTRATION_OPEN) {
        return res.status(403).json({
            error: `Competition is coming up soon! Panel submissions are now closed. If you have a conflict, please contact ${FEATURE_FLAGS.CONTACT_NAME} at ${FEATURE_FLAGS.CONTACT_EMAIL}`
        });
    }

    try {
        const db = req.app.locals.db;
        const wcaUserId = parseInt((req as any).wcaUserId || req.session.wcaUserId);
        const { panelName, description, email } = req.body;
        
        if (!panelName || !description || !email) {
            return res.status(400).json({ error: 'Missing panelName, description, or email' });
        }
        
        const submissionId = await PanelSubmissionModel.create(db, {
            wcaUserId,
            email,
            panelName,
            description
        });
        
        res.json({ success: true, id: submissionId });
    } catch (error: any) {
        console.error('Submit panel error:', error);
        res.status(500).json({ error: 'Failed to submit panel' });
    }
});

router.delete('/my-submissions/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = parseInt((req as any).wcaUserId || req.session.wcaUserId);
        const id = parseInt(req.params.id);
        
        // Admins can delete any, standard users can only delete their own
        const { verifyDelegate } = require('../services/AuthService').default || require('../services/AuthService');
        const delegateCheck = await verifyDelegate(db, wcaUserId.toString());
        
        if (!delegateCheck.isDelegate && !FEATURE_FLAGS.IS_PANELS_REGISTRATION_OPEN) {
            return res.status(403).json({
                error: `Competition is coming up soon! Panel edits are now closed. If you have a conflict, please contact ${FEATURE_FLAGS.CONTACT_NAME} at ${FEATURE_FLAGS.CONTACT_EMAIL}`
            });
        }
        
        if (delegateCheck.isDelegate) {
            await PanelSubmissionModel.delete(db, id);
        } else {
            await PanelSubmissionModel.delete(db, id, wcaUserId);
        }
        
        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete panel error:', error);
        res.status(500).json({ error: 'Failed to delete panel' });
    }
});

// Admin endpoints
router.get('/admin/submissions', isAuthenticated, isDelegate, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const submissions = await PanelSubmissionModel.getAllWithUserDetails(db);
        res.json({ submissions });
    } catch (error: any) {
        console.error('Get admin panels error:', error);
        res.status(500).json({ error: 'Failed to fetch panel submissions' });
    }
});

export default router;
