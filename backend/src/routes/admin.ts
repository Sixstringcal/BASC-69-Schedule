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
        
        // Log as much of the error body as possible; for HTML pages search for meaningful content
        if (typeof errBodyStr === 'string' && errBodyStr.includes('<!DOCTYPE')) {
            // WCA HTML error page — extract the visible text content between tags
            const textContent = errBodyStr.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            console.error('Write WCIF error (HTML page text):', textContent.substring(0, 3000));
        } else {
            console.error('Write WCIF error body:', errBodyStr?.substring(0, 5000) || error.message);
        }
        
        if (error.message?.includes('No group selections') || error.message?.includes('ActivityIds') || error.message?.includes('do not exist')) {
            return res.status(400).json({ error: error.message });
        }

        // Try to extract WCA request ID from their HTML error page for WST reporting
        let wcaRequestId: string | null = null;
        if (typeof errBodyStr === 'string' && errBodyStr.includes('Request ID:')) {
            const match = errBodyStr.match(/Request ID:\s*([a-f0-9-]{36})/i);
            if (match) wcaRequestId = match[1];
        }
        
        res.status(500).json({ 
            error: 'Failed to write groups to WCIF',
            wcaError: `WCA returned HTTP ${error.response?.status || 'unknown'}. This appears to be a WCA server-side issue unrelated to your payload.`,
            wcaRequestId: wcaRequestId || undefined,
            reportUrl: wcaRequestId 
                ? `https://www.worldcubeassociation.org/contact?contactRecipient=wst&requestId=${wcaRequestId}`
                : undefined,
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

router.delete('/clear-selections', isAuthenticated, isDelegate, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const [result]: any = await db.execute('DELETE FROM group_selections');
        const deleted = result.affectedRows ?? 0;
        console.log(`[clear-selections] Deleted ${deleted} group selection(s)`);
        res.json({ success: true, deleted });
    } catch (error) {
        console.error('Clear selections error:', error);
        res.status(500).json({ error: 'Failed to clear group selections' });
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
