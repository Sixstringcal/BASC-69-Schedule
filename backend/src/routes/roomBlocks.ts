import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { isAuthenticated, isDelegate } from '../middleware/auth';
import RoomBlockModel from '../models/RoomBlock';
import RoomBlockRegistrationModel from '../models/RoomBlockRegistration';
import SessionTokenModel from '../models/SessionToken';

const router = express.Router();

// Helper to get wcaUserId from optional authorization
async function getOptionalWcaUserId(req: Request): Promise<number | null> {
    const authHeader = req.headers.authorization;
    const db = req.app.locals.db;
    let wcaUserIdStr: string | null = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        wcaUserIdStr = await SessionTokenModel.findByToken(db, token);
    } else if (req.session.wcaUserId) {
        wcaUserIdStr = req.session.wcaUserId;
    }
    
    return wcaUserIdStr ? parseInt(wcaUserIdStr) : null;
}

function getRoomBlocksConfigMap(): Map<string, { blurb: string; hasSignups?: boolean; maxCapacity?: number }> {
    try {
        const configPath = path.join(__dirname, '..', '..', 'room-blocks-config.json');
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            const items = JSON.parse(data);
            const map = new Map<string, { blurb: string; hasSignups?: boolean; maxCapacity?: number }>();
            for (const item of items) {
                if (item.name) {
                    map.set(item.name.toLowerCase(), {
                        blurb: item.blurb || '',
                        hasSignups: item.hasSignups,
                        maxCapacity: item.maxCapacity
                    });
                }
            }
            return map;
        }
    } catch (err) {
        console.warn('Failed to read room-blocks-config.json:', err);
    }
    return new Map();
}

router.get('/public', async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = await getOptionalWcaUserId(req);
        
        const stats = await RoomBlockModel.getStats(db);
        const configMap = getRoomBlocksConfigMap();

        // Always read descriptions/blurbs, maxCapacity, and hasSignups directly from room-blocks-config.json
        const updatedStats = stats.map(block => {
            const config = configMap.get(block.name.toLowerCase());
            const maxCapacity = config && config.maxCapacity !== undefined ? config.maxCapacity : block.maxCapacity;
            const hasSignups = config && config.hasSignups !== undefined ? config.hasSignups : block.hasSignups;
            const totalSignups = block.registrationCount + block.waitlistCount;
            let registrationCount = totalSignups;
            let waitlistCount = 0;
            if (hasSignups) {
                registrationCount = Math.min(totalSignups, maxCapacity);
                waitlistCount = Math.max(0, totalSignups - maxCapacity);
            }
            return {
                ...block,
                blurb: config ? config.blurb : (block.blurb || ''),
                maxCapacity,
                hasSignups,
                registrationCount,
                waitlistCount
            };
        });

        let userRegistration: any = null;
        
        if (wcaUserId) {
            userRegistration = await RoomBlockRegistrationModel.findByWcaUserId(db, wcaUserId);
        }
        
        res.json({
            roomBlocks: updatedStats,
            userRegistration
        });
    } catch (error: any) {
        console.error('Get public room blocks error:', error);
        res.status(500).json({ error: 'Failed to fetch room blocks data' });
    }
});

router.post('/register', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = parseInt((req as any).wcaUserId || req.session.wcaUserId);
        const { roomBlockId, email } = req.body;
        
        if (!roomBlockId || !email) {
            return res.status(400).json({ error: 'Missing roomBlockId or email' });
        }
        
        const block = await RoomBlockModel.getById(db, parseInt(roomBlockId));
        if (!block) {
            return res.status(404).json({ error: 'Room block not found' });
        }
        
        if (!block.hasSignups) {
            return res.status(400).json({ error: 'Signups not enabled for this room block' });
        }
        
        await RoomBlockRegistrationModel.register(db, {
            wcaUserId,
            email,
            roomBlockId: parseInt(roomBlockId)
        });
        
        res.json({ success: true });
    } catch (error: any) {
        console.error('Register room block error:', error);
        res.status(500).json({ error: 'Failed to register for room block' });
    }
});

router.post('/unregister', isAuthenticated, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const wcaUserId = parseInt((req as any).wcaUserId || req.session.wcaUserId);
        
        await RoomBlockRegistrationModel.unregister(db, wcaUserId);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Unregister room block error:', error);
        res.status(500).json({ error: 'Failed to unregister from room block' });
    }
});

// Admin endpoints
router.post('/admin/save', isAuthenticated, isDelegate, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const { id, name, blurb, hasSignups, maxCapacity } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Missing name' });
        }
        
        const blockId = await RoomBlockModel.createOrUpdate(db, {
            id: id ? parseInt(id) : undefined,
            name,
            blurb,
            hasSignups: !!hasSignups,
            maxCapacity: maxCapacity ? parseInt(maxCapacity) : 0
        });
        
        res.json({ success: true, id: blockId });
    } catch (error: any) {
        console.error('Save room block error:', error);
        res.status(500).json({ error: 'Failed to save room block' });
    }
});

router.delete('/admin/:id', isAuthenticated, isDelegate, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const id = parseInt(req.params.id);
        
        await RoomBlockModel.delete(db, id);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete room block error:', error);
        res.status(500).json({ error: 'Failed to delete room block' });
    }
});

router.get('/admin/registrations', isAuthenticated, isDelegate, async (req: Request, res: Response) => {
    try {
        const db = req.app.locals.db;
        const registrations = await RoomBlockRegistrationModel.getAllWithUserDetails(db);
        res.json({ registrations });
    } catch (error: any) {
        console.error('Get admin registrations error:', error);
        res.status(500).json({ error: 'Failed to fetch registrations' });
    }
});

export default router;
