import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';

import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import mysql from 'mysql2/promise';
import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import adminRoutes from './routes/admin';
import unofficialRoutes from './routes/unofficial';
import roomBlockRoutes from './routes/roomBlocks';
import panelRoutes from './routes/panels';
import tshirtRoutes from './routes/tshirt';

const app = express();

const pool = mysql.createPool(process.env.DATABASE_URL || '');

async function initDatabase(dbPool: mysql.Pool) {
    try {
        // 1. unofficial_registrations
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS unofficial_registrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                wca_user_id VARCHAR(255) NOT NULL,
                registrant_id INT,
                event_id VARCHAR(50) NOT NULL,
                event_name VARCHAR(255) NOT NULL,
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_event (wca_user_id, event_id)
            )
        `);

        // 2. room_blocks
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS room_blocks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                blurb TEXT,
                has_signups TINYINT(1) DEFAULT 0,
                max_capacity INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 3. room_block_registrations
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS room_block_registrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                wca_user_id INT NOT NULL,
                email VARCHAR(255) NOT NULL,
                room_block_id INT NOT NULL,
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user (wca_user_id),
                FOREIGN KEY (room_block_id) REFERENCES room_blocks(id) ON DELETE CASCADE,
                FOREIGN KEY (wca_user_id) REFERENCES oauth_tokens(wca_user_id) ON DELETE CASCADE
            )
        `);

        // 4. panel_submissions
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS panel_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                wca_user_id INT NOT NULL,
                email VARCHAR(255) NOT NULL,
                panel_name VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (wca_user_id) REFERENCES oauth_tokens(wca_user_id) ON DELETE CASCADE
            )
        `);

        // 5. tshirt_selections
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS tshirt_selections (
                id INT AUTO_INCREMENT PRIMARY KEY,
                wca_user_id INT NOT NULL UNIQUE,
                tshirt_size VARCHAR(50) NOT NULL,
                selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (wca_user_id) REFERENCES oauth_tokens(wca_user_id) ON DELETE CASCADE
            )
        `);

        // Sync room blocks with JSON configuration file
        await syncRoomBlocksWithJson(dbPool);
        
        console.log('Database tables initialized and verified.');
    } catch (err) {
        console.error('Failed to initialize database tables:', err);
    }
}

async function syncRoomBlocksWithJson(dbPool: mysql.Pool) {
    try {
        const configPath = path.join(__dirname, '..', 'room-blocks-config.json');
        if (!fs.existsSync(configPath)) {
            console.warn(`Config file not found at ${configPath}, skipping sync.`);
            return;
        }

        const configData = fs.readFileSync(configPath, 'utf-8');
        const configBlocks: Array<{ name: string; blurb: string; hasSignups: boolean; maxCapacity: number }> = JSON.parse(configData);

        // Fetch current blocks from DB
        const [dbRows] = await dbPool.query('SELECT * FROM room_blocks');
        const dbBlocks = dbRows as any[];

        const configNames = configBlocks.map(b => b.name.toLowerCase());

        // 1. Delete blocks from DB that are not in the JSON config
        for (const dbBlock of dbBlocks) {
            if (!configNames.includes(dbBlock.name.toLowerCase())) {
                await dbPool.query('DELETE FROM room_blocks WHERE id = ?', [dbBlock.id]);
                console.log(`Deleted room block not in JSON config: ${dbBlock.name}`);
            }
        }

        // 2. Insert or update blocks from the JSON config
        for (const configBlock of configBlocks) {
            const matchedDbBlock = dbBlocks.find(b => b.name.toLowerCase() === configBlock.name.toLowerCase());
            const hasSignupsVal = configBlock.hasSignups ? 1 : 0;
            
            if (matchedDbBlock) {
                // Update
                await dbPool.query(
                    'UPDATE room_blocks SET blurb = ?, has_signups = ?, max_capacity = ? WHERE id = ?',
                    [configBlock.blurb, hasSignupsVal, configBlock.maxCapacity, matchedDbBlock.id]
                );
            } else {
                // Insert new
                await dbPool.query(
                    'INSERT INTO room_blocks (name, blurb, has_signups, max_capacity) VALUES (?, ?, ?, ?)',
                    [configBlock.name, configBlock.blurb, hasSignupsVal, configBlock.maxCapacity]
                );
                console.log(`Inserted new room block from JSON config: ${configBlock.name}`);
            }
        }
        console.log('Room blocks successfully synced with room-blocks-config.json.');
    } catch (err) {
        console.error('Error syncing room blocks with JSON config:', err);
    }
}

initDatabase(pool);

app.locals.db = pool;

// CORS - Accept both the base domain and the full path
const allowedOrigins = [
    'https://sixstringcal.github.io',
    'https://sixstringcal.github.io/BASC-69-Schedule',
    'http://localhost:8000'
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        // Check if origin starts with allowed domains
        const isAllowed = allowedOrigins.some(allowed => 
            origin === allowed || origin.startsWith(allowed)
        );
        
        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/unofficial', unofficialRoutes);
app.use('/api/room-blocks', roomBlockRoutes);
app.use('/api/panels', panelRoutes);
app.use('/api/tshirt', tshirtRoutes);

app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
