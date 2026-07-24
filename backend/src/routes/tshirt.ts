import express, { Request, Response } from 'express';
import { isAuthenticated, isDelegate } from '../middleware/auth';
import TShirtSelectionModel from '../models/TShirtSelection';

const router = express.Router();

router.get('/my-selection', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = parseInt((req as any).wcaUserId || req.session.wcaUserId);
        
        const selection = await TShirtSelectionModel.findByWcaUserId(db, wcaUserId);
        res.json({ selection });
    } catch (error: any) {
        console.error('Get my tshirt error:', error);
        res.status(500).json({ error: 'Failed to fetch T-shirt size' });
    }
});

router.post('/select', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = parseInt((req as any).wcaUserId || req.session.wcaUserId);
        const { size } = req.body;
        
        if (!size) {
            return res.status(400).json({ error: 'Missing size' });
        }
        
        const allowedSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
        if (!allowedSizes.includes(size.toUpperCase())) {
            return res.status(400).json({ error: 'Invalid T-shirt size' });
        }
        
        await TShirtSelectionModel.createOrUpdate(db, {
            wcaUserId,
            tshirtSize: size.toUpperCase()
        });
        
        res.json({ success: true });
    } catch (error: any) {
        console.error('Select tshirt size error:', error);
        res.status(500).json({ error: 'Failed to select T-shirt size' });
    }
});

// Admin endpoints
router.get('/admin/summary', isAuthenticated, isDelegate, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const summary = await TShirtSelectionModel.getSummary(db);
        
        res.json({
            summary,
            details: []
        });
    } catch (error: any) {
        console.error('Get admin tshirt error:', error);
        res.status(500).json({ error: 'Failed to fetch T-shirt data' });
    }
});

export default router;
