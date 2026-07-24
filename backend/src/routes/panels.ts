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

router.post('/submit', isAuthenticated, async (req: Request, res: Response) => {
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
        const isUserDelegate = (req as any).isDelegate || false; // Wait, let's verify if isDelegate middleware sets this, or we can check with verifyDelegate
        // To be safe, just delete passing owner ID if not delegate. But wait! If we pass wcaUserId, the model checks it.
        // Let's check delegate status in a try block, or just delegate check if needed.
        // Actually, we can check req.session or call verifyDelegate. Let's look at `isDelegate` middleware in `backend/src/middleware/auth.ts`.
        // In the middleware: `(req as any).accessToken = result.accessToken;` and it moves to next. It doesn't set `isDelegate` boolean on req.
        // We can just query the model: if the user is standard, pass wcaUserId. If they are delegate, do not pass wcaUserId.
        // Wait, how do we know if they are a delegate? We can check using `AuthService.verifyDelegate(db, wcaUserId)`.
        // Let's do that!
        const { verifyDelegate } = require('../services/AuthService').default || require('../services/AuthService');
        const delegateCheck = await verifyDelegate(db, wcaUserId.toString());
        
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
