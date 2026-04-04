import express, { Request, Response } from 'express';
import axios from 'axios';
import { isAuthenticated, isDelegate } from '../middleware/auth';
import AdminService from '../services/AdminService';
import AuthService from '../services/AuthService';
import { refreshAccessToken, WCA_ORIGIN, COMPETITION_ID } from '../utils/wcif';

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
        const wcaUserId = req.session.wcaUserId!;
        let accessToken = req.accessToken!;

        const delegateInfo = {
            wcaUserId,
            name: req.session.name!,
            accessToken
        };
        
        try {
            const result = await AdminService.writeToWCIF(db, delegateInfo);
            res.json(result);
        } catch (writeError: any) {
            const isAuthError = writeError.response?.status === 401 ||
                writeError.response?.data?.error === 'Please log in';

            if (isAuthError) {
                // Try refreshing the token and retrying once
                const newToken = await refreshAccessToken(db, wcaUserId);
                if (newToken) {
                    const result = await AdminService.writeToWCIF(db, { ...delegateInfo, accessToken: newToken });
                    res.json(result);
                } else {
                    res.status(401).json({ error: 'Your WCA session has expired. Please log out and log in again.' });
                }
            } else {
                throw writeError;
            }
        }
    } catch (error: any) {
        console.error('Write WCIF error status:', error.response?.status);
        const errBody = error.response?.data;
        const errBodyStr = typeof errBody === 'string' ? errBody : JSON.stringify(errBody);
        console.error('Write WCIF error body (first 2000 chars):', errBodyStr?.substring(0, 2000) || error.message);
        
        if (error.message?.includes('No group selections')) {
            return res.status(400).json({ error: error.message });
        }
        
        res.status(500).json({ 
            error: 'Failed to write groups to WCIF',
            details: error.response?.data || error.message
        });
    }
});

// Diagnostic endpoint: sends { persons: [] } to WCA to test if competition.save!
// itself is causing the 500, separate from any persons/assignments data.
router.post('/test-wcif-write', isAuthenticated, isDelegate, async (req: Request, res: Response) => {
    try {
        const accessToken = req.accessToken!;
        console.log('[test-wcif-write] Sending empty persons array to WCA...');
        const response = await axios.patch(
            `${WCA_ORIGIN}/api/v0/competitions/${COMPETITION_ID}/wcif`,
            { persons: [] },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('[test-wcif-write] Success:', response.status, response.data);
        res.json({ success: true, status: response.status, data: response.data });
    } catch (error: any) {
        const status = error.response?.status;
        const data = error.response?.data;
        const dataStr = typeof data === 'string' ? data.substring(0, 1000) : JSON.stringify(data);
        console.error('[test-wcif-write] Failed:', status, dataStr);
        res.json({ success: false, status, data: dataStr });
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
